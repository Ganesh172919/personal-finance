r"""
Per-model health tracking for routing and observability.

================================================================================
MINDMAP FLOW: MODEL HEALTH TRACKING & CIRCUIT BREAKER ENGINE
================================================================================
- Model Health & Circuit Breaker Engine
    ├── 1. Telemetry Capture
    │   ├── Total Requests & Success Count
    │   ├── Latency Tracking (Rolling Average in ms)
    │   └── Consecutive Failure Counter
    ├── 2. Granular Error Categorization & Dynamic Cooldowns
    │   ├── HTTP 429 Rate Limit -> 60s Cooldown
    │   ├── HTTP 403 Forbidden / Auth -> 1,800s (30m) Cooldown
    │   ├── HTTP 404 Model Not Found -> 900s (15m) Cooldown
    │   ├── HTTP 5xx Server Error -> 45s Cooldown
    │   └── Other Errors -> Increment generic error counter
    ├── 3. Circuit Breaker State Machine
    │   ├── HEALTHY: Success rate >= 70%, no active cooldown/trip
    │   ├── DEGRADED: Success rate < 70% (min 5 requests)
    │   ├── COOLDOWN: Active temporary cooldown_until timestamp
    │   └── CIRCUIT_OPEN: >= 4 consecutive failures (300s recovery window)
    ├── 4. Composite Health Scoring Formula
    │   ├── Cooldown Penalty: Fixed -1000.0 (Instant eviction from top ranks)
    │   ├── Circuit Open Penalty: Fixed -500.0
    │   └── Dynamic Score: (SuccessRate * 0.65) + (LatencyScore * 0.35) - Penalty
    │       ├── LatencyScore = 1.0 / (1.0 + LatencySec)
    │       └── Penalty = min(0.8, consecutive_failures * 0.1)
    └── 5. Thread Safety & Singleton Management
        ├── Re-entrant Lock (threading.RLock)
        └── Global Registry (_tracker instance & stats export)

================================================================================
ASCII FLOW: MODEL HEALTH STATE TRANSITIONS & SCORING PIPELINE
================================================================================
                     +---------------------------+
                     |    LLM Request Execution  |
                     +-------------+-------------+
                                   |
                     +-------------+-------------+
                     | Success or Failure Event? |
                     +-------------+-------------+
                            /             \
                   Success /               \ Failure
                          v                 v
           +-----------------------+   +------------------------------+
           | record_success()      |   | record_failure(status_code)  |
           | - total_requests++    |   | - total_requests++           |
           | - successful_reqs++   |   | - consecutive_failures++     |
           | - consecutive_fails=0 |   | - status_code routing:       |
           | - clear circuit/cool  |   |   * 429 -> cool 60s          |
           | - update avg_latency  |   |   * 403 -> cool 1800s        |
           +-----------+-----------+   |   * 404 -> cool 900s         |
                       |               |   * 5xx -> cool 45s          |
                       |               |   * >=4 fails -> TRIP CIRCUIT|
                       |               +--------------+---------------+
                       |                              |
                       +--------------+---------------+
                                      |
                                      v
                      +-------------------------------+
                      |      get_status(model_id)     |
                      +---------------+---------------+
                                      |
         +----------------------------+----------------------------+
         |                            |                            |
  [ cooldown_until > now ]    [ circuit_opened ]         [ success_rate < 70% ]
         |                            |                            |
         v                            v                            v
   STATUS: COOLDOWN          STATUS: CIRCUIT_OPEN          STATUS: DEGRADED
   (Score: -1000.0)            (Score: -500.0)             (Score: Dynamic)
         |                            |                            |
         +----------------------------+----------------------------+
                                      | Otherwise
                                      v
                               STATUS: HEALTHY
                   Score = (SR * 0.65) + (LatScore * 0.35) - Penalty
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional


# Enumeration of operational health states for registered LLM models.
# Defines states representing healthy, degraded, cooldown, and circuit-open conditions.
# Dictates model eligibility and ranking penalties in routing decisions.
class ModelHealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    COOLDOWN = "cooldown"
    CIRCUIT_OPEN = "circuit_open"


# Dataclass capturing cumulative health and performance metrics for a model.
# Tracks request counts, granular HTTP errors, latencies, and circuit breaker state.
# Computes dynamic success rates and average response latencies.
@dataclass
class ModelHealth:
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    errors_429: int = 0
    errors_403: int = 0
    errors_404: int = 0
    errors_5xx: int = 0
    errors_other: int = 0
    total_latency_ms: float = 0.0
    consecutive_failures: int = 0
    cooldown_until: Optional[float] = None
    circuit_opened_at: Optional[float] = None
    last_success_at: Optional[float] = None
    last_failure_at: Optional[float] = None

    # Computes percentage of successful requests out of total requests handled.
    # Defaults to 100 percent when no requests have been recorded yet.
    # Returns floating-point success percentage between 0.0 and 100.0.
    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 100.0
        return (self.successful_requests / self.total_requests) * 100.0

    # Calculates mean response latency in milliseconds across successful calls.
    # Returns zero if no successful requests have been logged yet.
    # Yields floating-point average latency value in milliseconds.
    @property
    def avg_latency_ms(self) -> float:
        if self.successful_requests == 0:
            return 0.0
        return self.total_latency_ms / self.successful_requests


# Configuration parameters governing health assessment thresholds and cooldowns.
# Defines error thresholds, circuit breaker recovery intervals, and cooldown durations.
# Calibrates failure detection sensitivity across all monitored models.
@dataclass
class ModelHealthConfig:
    degraded_threshold_percent: float = 70.0
    min_requests_for_health: int = 5
    circuit_failure_threshold: int = 4
    circuit_recovery_seconds: float = 300.0
    cooldown_429_seconds: float = 60.0
    cooldown_403_seconds: float = 1800.0
    cooldown_404_seconds: float = 900.0
    cooldown_5xx_seconds: float = 45.0


# Thread-safe tracker evaluating runtime operational health across models.
# Maintains per-model performance telemetry, dynamic cooldowns, and circuit state.
# Scores model reliability to inform optimal failover and routing decisions.
class ModelHealthTracker:
    # Initializes ModelHealthTracker with optional configuration and locks.
    # Sets up internal thread synchronization lock and health metrics dictionary.
    # Prepares tracking store for recording per-model operational events.
    def __init__(self, config: Optional[ModelHealthConfig] = None):
        self.config = config or ModelHealthConfig()
        self._health: Dict[str, ModelHealth] = {}
        self._lock = threading.RLock()

    # Retrieves or creates ModelHealth tracking container for a given model.
    # Ensures health record exists in dictionary before mutation or lookup.
    # Returns ModelHealth instance associated with the specified model ID.
    def _get(self, model_id: str) -> ModelHealth:
        if model_id not in self._health:
            self._health[model_id] = ModelHealth()
        return self._health[model_id]

    # Evaluates current health classification status for a specified model.
    # Checks active cooldown timers, open circuit breakers, and degraded thresholds.
    # Returns ModelHealthStatus enum reflecting instantaneous model condition.
    def get_status(self, model_id: str) -> ModelHealthStatus:
        with self._lock:
            health = self._get(model_id)
            now = time.time()

            if health.cooldown_until and now < health.cooldown_until:
                return ModelHealthStatus.COOLDOWN

            if health.circuit_opened_at:
                if now < health.circuit_opened_at + self.config.circuit_recovery_seconds:
                    return ModelHealthStatus.CIRCUIT_OPEN

            if health.total_requests >= self.config.min_requests_for_health:
                if health.success_rate < self.config.degraded_threshold_percent:
                    return ModelHealthStatus.DEGRADED

            return ModelHealthStatus.HEALTHY

    # Computes composite numerical suitability score for candidate model ranking.
    # Combines success rate and latency while heavily penalizing failed states.
    # Returns floating-point score used for sorting model fallback chains.
    def get_score(self, model_id: str) -> float:
        with self._lock:
            health = self._get(model_id)
            status = self.get_status(model_id)

            if status == ModelHealthStatus.COOLDOWN:
                return -1000.0
            if status == ModelHealthStatus.CIRCUIT_OPEN:
                return -500.0

            success_score = health.success_rate / 100.0
            latency_score = 1.0 / (1.0 + (health.avg_latency_ms / 1000.0))
            penalty = min(0.8, health.consecutive_failures * 0.1)

            return (success_score * 0.65) + (latency_score * 0.35) - penalty

    # Records successful request completion and updates model latency metrics.
    # Resets consecutive failure counter and clears active circuit breaker state.
    # Thread-safely logs timestamp of last successful invocation.
    def record_success(self, model_id: str, latency_ms: float = 0.0) -> None:
        with self._lock:
            health = self._get(model_id)
            health.total_requests += 1
            health.successful_requests += 1
            health.total_latency_ms += max(0.0, latency_ms)
            health.consecutive_failures = 0
            health.circuit_opened_at = None
            health.cooldown_until = None
            health.last_success_at = time.time()

    # Records request failure and updates categorized error counts and cooldowns.
    # Maps HTTP status codes to specialized cooldown durations and trips circuits.
    # Increments consecutive failure counter under re-entrant lock.
    def record_failure(self, model_id: str, status_code: Optional[int] = None) -> None:
        with self._lock:
            health = self._get(model_id)
            now = time.time()
            health.total_requests += 1
            health.failed_requests += 1
            health.consecutive_failures += 1
            health.last_failure_at = now

            if status_code == 429:
                health.errors_429 += 1
                health.cooldown_until = now + self.config.cooldown_429_seconds
            elif status_code == 403:
                health.errors_403 += 1
                health.cooldown_until = now + self.config.cooldown_403_seconds
            elif status_code == 404:
                health.errors_404 += 1
                health.cooldown_until = now + self.config.cooldown_404_seconds
            elif status_code and 500 <= status_code < 600:
                health.errors_5xx += 1
                health.cooldown_until = now + self.config.cooldown_5xx_seconds
            else:
                health.errors_other += 1

            if health.consecutive_failures >= self.config.circuit_failure_threshold:
                health.circuit_opened_at = now

    # Exports comprehensive operational metrics dictionary across all models.
    # Reports health states, error breakdowns, latencies, and composite scores.
    # Returns nested dictionary suitable for status reporting and observability.
    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            result: Dict[str, Any] = {}
            for model_id, health in self._health.items():
                result[model_id] = {
                    "status": self.get_status(model_id).value,
                    "success_rate": round(health.success_rate, 2),
                    "avg_latency_ms": round(health.avg_latency_ms, 2),
                    "total_requests": health.total_requests,
                    "successful_requests": health.successful_requests,
                    "failed_requests": health.failed_requests,
                    "errors": {
                        "429": health.errors_429,
                        "403": health.errors_403,
                        "404": health.errors_404,
                        "5xx": health.errors_5xx,
                        "other": health.errors_other,
                    },
                    "cooldown_until": health.cooldown_until,
                    "circuit_opened_at": health.circuit_opened_at,
                    "score": round(self.get_score(model_id), 4),
                }
            return result

    # Reorders candidate model entries using multi-armed bandit algorithm.
    # Optimizes model selection per task class when bandit feature is enabled.
    # Returns reordered entry list or original entries on failure or disablement.
    def bandit_order(self, entries: Any, task_class: str) -> Any:
        """Reorder catalog ``entries`` with the per-task-class bandit.

        Only models already present in ``entries`` (i.e. allowed by the model
        catalog / task config) are reordered.  Returns ``entries`` unchanged when
        ``LLM_BANDIT_ENABLED`` is off or anything goes wrong.
        """
        try:
            from learning.bandit import reorder_entries

            return reorder_entries(entries, task_class, self)
        except Exception:
            return entries

    # Clears all recorded model health metrics and circuit breaker states.
    # Acquires re-entrant synchronization lock to purge health dictionary.
    # Restores tracker to clean initial state for testing isolation.
    def reset(self) -> None:
        with self._lock:
            self._health.clear()


_tracker = ModelHealthTracker()


# Retrieves the global singleton ModelHealthTracker instance.
# Provides centralized access to model health tracking across agents.
# Returns shared ModelHealthTracker instance for application runtime.
def get_model_health_tracker() -> ModelHealthTracker:
    return _tracker


# Resets the global ModelHealthTracker singleton metrics and circuit state.
# Purges tracked performance metrics across all models during test teardown.
# Restores pristine initial state for subsequent test execution.
def reset_model_health_tracker() -> None:
    _tracker.reset()

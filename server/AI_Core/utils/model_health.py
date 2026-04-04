"""
Per-model health tracking for routing and observability.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


class ModelHealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    COOLDOWN = "cooldown"
    CIRCUIT_OPEN = "circuit_open"


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

    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 100.0
        return (self.successful_requests / self.total_requests) * 100.0

    @property
    def avg_latency_ms(self) -> float:
        if self.successful_requests == 0:
            return 0.0
        return self.total_latency_ms / self.successful_requests


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


class ModelHealthTracker:
    def __init__(self, config: Optional[ModelHealthConfig] = None):
        self.config = config or ModelHealthConfig()
        self._health: Dict[str, ModelHealth] = {}
        self._lock = threading.RLock()

    def _get(self, model_id: str) -> ModelHealth:
        if model_id not in self._health:
            self._health[model_id] = ModelHealth()
        return self._health[model_id]

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

    def reset(self) -> None:
        with self._lock:
            self._health.clear()


_tracker = ModelHealthTracker()


def get_model_health_tracker() -> ModelHealthTracker:
    return _tracker


def reset_model_health_tracker() -> None:
    _tracker.reset()

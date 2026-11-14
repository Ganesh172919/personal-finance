"""
learning/bandit.py - Per-task-class model bandit (Thompson sampling)
===================================================================

Chooses the ORDER in which already-allowed models are tried for a task class.
It never introduces a model: candidates come from ``AGENT_TASK_CONFIG`` /
``data/model_catalog.json`` via the LLM wrapper.  Guard rails:

* ``LLM_BANDIT_ENABLED`` (default OFF) - when off, the caller's order is kept.
* Quality floor: an arm with >= ``MIN_PULLS_FOR_FLOOR`` observations and a mean
  reward below ``QUALITY_FLOOR`` is demoted behind every healthy arm.
* Minimum exploration: with probability ``MIN_EXPLORATION`` a uniformly random
  allowed (healthy) model is tried first.
* Unhealthy models (cooldown / circuit open) are never promoted.
* Arm stats persist in ``ai_bandit_arms`` (loaded lazily, flushed periodically).

Rewards: thumbs up = 1.0, thumbs down = 0.0 (see ``run_store.record_feedback``).
"""

from __future__ import annotations

import logging
import random
import threading
from typing import Any, Dict, List, Optional, Sequence, Tuple

from utils.mongo_client import get_mongo_db

from . import config

logger = logging.getLogger(__name__)

ARMS = "ai_bandit_arms"
QUALITY_FLOOR = 0.4
MIN_PULLS_FOR_FLOOR = 10
MIN_EXPLORATION = 0.05
FLUSH_EVERY = 10

_lock = threading.Lock()
_arms: Dict[Tuple[str, str], Dict[str, float]] = {}
_loaded = False
_dirty = 0
_rng = random.Random()


# Retrieves or initializes arm statistical counters for task and model pair.
# Populates default prior counts for alpha, beta, and observation pulls.
# Returns mutable state dictionary tracking reward distribution metrics.
def _arm(task_class: str, model: str) -> Dict[str, float]:
    return _arms.setdefault((task_class, model), {"alpha": 0.0, "beta": 0.0, "pulls": 0.0})


# Loads historical bandit arm parameters from MongoDB persistence collection.
# Hydrates in-memory alpha, beta, and pull statistics under mutex protection.
# Guards against duplicate reloads unless force parameter is explicitly true.
def load(force: bool = False) -> None:
    global _loaded
    with _lock:
        if _loaded and not force:
            return
        try:
            for doc in get_mongo_db()[ARMS].find({}):
                key = (str(doc.get("task_class", "")), str(doc.get("model", "")))
                _arms[key] = {
                    "alpha": float(doc.get("alpha", 0.0)),
                    "beta": float(doc.get("beta", 0.0)),
                    "pulls": float(doc.get("pulls", 0.0)),
                }
        except Exception as exc:  # pragma: no cover
            logger.debug("bandit_load_failed: %s", exc)
        _loaded = True


# Persists dirty in-memory bandit arm statistics into MongoDB storage.
# Takes point-in-time snapshot of arm state and updates records with upsert.
# Resets dirty observation counter while suppressing transient database errors.
def flush() -> None:
    global _dirty
    with _lock:
        snapshot = {k: dict(v) for k, v in _arms.items()}
        _dirty = 0
    try:
        col = get_mongo_db()[ARMS]
        for (task_class, model), stats in snapshot.items():
            col.update_one(
                {"_id": f"{task_class}:{model}"},
                {"$set": {"task_class": task_class, "model": model, **stats}},
                upsert=True,
            )
    except Exception as exc:  # pragma: no cover
        logger.debug("bandit_flush_failed: %s", exc)


# Records observed reward feedback for a specific task class and model arm.
# Updates alpha and beta parameters according to bounded reward magnitude.
# Triggers periodic batch persistence flush when threshold count is exceeded.
def record_reward(task_class: str, model: str, reward: float) -> None:
    """Add one observation (reward clipped to [0, 1])."""
    global _dirty
    if not task_class or not model:
        return
    reward = max(0.0, min(1.0, float(reward)))
    load()
    with _lock:
        arm = _arm(task_class, model)
        arm["alpha"] += reward
        arm["beta"] += 1.0 - reward
        arm["pulls"] += 1.0
        _dirty += 1
        due = _dirty >= FLUSH_EVERY
    if due:
        flush()


# Compiles tabular summary of arm performance metrics across task classes.
# Calculates posterior mean expectation values, pulls, and alpha/beta sums.
# Returns list sorted by task class and descending empirical performance.
def arm_stats(task_class: Optional[str] = None) -> List[Dict[str, Any]]:
    load()
    with _lock:
        rows = [
            {
                "taskClass": tc,
                "model": model,
                "alpha": s["alpha"],
                "beta": s["beta"],
                "pulls": int(s["pulls"]),
                "mean": round((s["alpha"] + 1.0) / (s["alpha"] + s["beta"] + 2.0), 4),
            }
            for (tc, model), s in _arms.items()
            if task_class is None or tc == task_class
        ]
    return sorted(rows, key=lambda r: (r["taskClass"], -r["mean"]))


# Ranks candidate models using Thompson sampling beta posterior distributions.
# Filters out unhealthy models and applies quality floor demotion rules.
# Injects minimum epsilon exploration probability to prevent local optima.
def order_models(
    task_class: str,
    models: Sequence[str],
    *,
    healthy: Optional[Dict[str, bool]] = None,
    rng: Optional[random.Random] = None,
    force: bool = False,
) -> List[str]:
    """Return ``models`` reordered by Thompson sampling.

    ``healthy`` marks usable models (default all).  The result is always a
    permutation of ``models``.
    """
    models = list(models)
    if len(models) < 2 or not task_class:
        return models
    if not (force or config.bandit_enabled()):
        return models
    load()
    rng = rng or _rng
    healthy = healthy or {}
    usable = [m for m in models if healthy.get(m, True)]
    unusable = [m for m in models if not healthy.get(m, True)]
    if len(usable) < 2:
        return usable + unusable

    scored: List[Tuple[float, str]] = []
    demoted: List[str] = []
    with _lock:
        for model in usable:
            arm = _arm(task_class, model)
            mean = (arm["alpha"] + 1.0) / (arm["alpha"] + arm["beta"] + 2.0)
            if arm["pulls"] >= MIN_PULLS_FOR_FLOOR and mean < QUALITY_FLOOR:
                demoted.append(model)
                continue
            sample = rng.betavariate(arm["alpha"] + 1.0, arm["beta"] + 1.0)
            scored.append((sample, model))
    scored.sort(key=lambda item: -item[0])
    ordered = [m for _, m in scored]
    # Minimum exploration over non-demoted arms.
    if len(ordered) > 1 and rng.random() < MIN_EXPLORATION:
        pick = rng.choice(ordered)
        ordered.remove(pick)
        ordered.insert(0, pick)
    return ordered + demoted + unusable


# Reorders model configuration catalog entries based on bandit sampling.
# Verifies model health through tracker and evaluates arm Thompson priorities.
# Returns sorted catalog entries maintaining model object structures.
def reorder_entries(entries: Sequence[Any], task_class: str, tracker: Any) -> Sequence[Any]:
    """Reorder ``ModelEntry`` objects (anything with ``model_id``)."""
    if not config.bandit_enabled() or len(entries) < 2:
        return entries
    from utils.model_health import ModelHealthStatus

    by_id = {e.model_id: e for e in entries}
    healthy = {mid: tracker.get_status(mid) in (ModelHealthStatus.HEALTHY, ModelHealthStatus.DEGRADED) for mid in by_id}
    ordered = order_models(task_class, list(by_id), healthy=healthy)
    return [by_id[m] for m in ordered]


# Resets all in-memory bandit arms, reload flags, and dirty counter.
# Thread-safely clears cached arm dictionary under concurrency lock.
# Used to isolate test suite environments and re-initialize state.
def reset() -> None:
    global _loaded, _dirty
    with _lock:
        _arms.clear()
        _loaded = False
        _dirty = 0

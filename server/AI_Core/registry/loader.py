"""
registry/loader.py - Serving-time artifact resolution
=====================================================

``get_prompt`` / ``get_routing_config`` / ``get_exemplars`` are what the agents
call on the hot path.  Guarantees:

* An empty database (or any registry failure) returns the baked-in defaults, so
  behaviour is byte-identical to the pre-registry code.
* Reads are TTL-cached per (kind, key, org) and the cache is invalidated by every
  store write in this process (other processes converge within the TTL).
* Canary artifacts serve a *sticky* slice of traffic: ``sha256(subject:artifact)``
  buckets a user (or org when no user) into 0..9999 and the artifact serves only
  when the bucket is below ``rollout.percent``.
* Precedence: org canary > org active > global canary > global active > default.
* ``use_artifacts([...])`` overrides resolution for the current context (used by
  the gate and replay to evaluate a candidate without promoting it).
"""

from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

from .context import current_context
from .defaults import PROMPT_SPECS, default_routing_config
from .models import (
    ROUTING_KEY,
    ArtifactBase,
    ExemplarExample,
    ExemplarSet,
    PromptArtifact,
    RoutingConfig,
)

logger = logging.getLogger(__name__)

_CACHE_MAX = 1024
_FAIL_TTL_SECONDS = 5.0

_cache: Dict[Tuple[str, str, str], Tuple[float, List[ArtifactBase]]] = {}
_cache_lock = threading.Lock()
_generation = 0

# (kind, key) -> artifact; scoped to the current context (gate / replay).
_overrides: ContextVar[Optional[Dict[Tuple[str, str], ArtifactBase]]] = ContextVar("registry_overrides", default=None)
# True -> slots without an override serve baked-in defaults (never the database).
_exclusive: ContextVar[bool] = ContextVar("registry_exclusive", default=False)

_DEFAULT_ROUTING = default_routing_config()


# Retrieves configured cache time-to-live duration in seconds for registry lookups.
# Reads duration from environment variable with safe default fallback of 30.
# Returns non-negative floating point seconds for in-memory candidate cache.
def cache_ttl_seconds() -> float:
    try:
        return max(0.0, float(os.getenv("AI_REGISTRY_CACHE_TTL_SECONDS", "30") or 30))
    except ValueError:
        return 30.0


# Flushes the in-memory cache and increments registry cache generation counter.
# Thread-safely empties cached candidate artifacts across all keys and tenants.
# Forces subsequent artifact lookups to query backend storage afresh.
def invalidate() -> None:
    global _generation
    with _cache_lock:
        _cache.clear()
        _generation += 1


# Calculates sticky deterministic traffic bucket from subject and artifact ID.
# Computes SHA256 hash digest and extracts integer modulo ten thousand.
# Returns integer bucket index between 0 and 9999 for canary routing.
def bucket_for(subject: str, artifact_id: str) -> int:
    """Sticky 0..9999 bucket for ``subject`` and ``artifact_id``."""
    digest = hashlib.sha256(f"{subject}:{artifact_id}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 10000


# Determines whether subject falls within canary traffic allocation rollout.
# Compares subject bucket assignment against declared rollout percentage.
# Returns boolean flag indicating if candidate artifact should be served.
def in_canary(artifact: ArtifactBase, subject: str) -> bool:
    if artifact.status != "canary" or not subject:
        return False
    try:
        percent = float((artifact.rollout or {}).get("percent", 0) or 0)
    except (TypeError, ValueError):
        percent = 0.0
    if percent <= 0:
        return False
    if percent >= 100:
        return True
    return bucket_for(subject, artifact.id) < int(percent * 100)


# Extracts routing subject identifier from current execution context.
# Prefers user identifier falling back to organization tenant identifier.
# Returns subject string used for sticky canary hashing calculations.
def _subject(ctx: Any) -> str:
    if ctx is None:
        return ""
    return ctx.user_id or ctx.org_id or ""


# Retrieves cached or database candidate artifacts for given kind and key.
# Implements fail-soft caching with shortened TTL on storage lookup errors.
# Returns list of available ArtifactBase objects eligible for selection.
def _candidates(kind: str, key: str, org_id: str) -> List[ArtifactBase]:
    cache_key = (kind, key, org_id or "")
    now = time.monotonic()
    ttl = cache_ttl_seconds()
    with _cache_lock:
        hit = _cache.get(cache_key)
        if hit is not None and now - hit[0] < ttl:
            return hit[1]
        gen = _generation
    try:
        from .store import ArtifactStore

        rows = ArtifactStore().serving_candidates(kind, key, org_id or None)
        stamp = now
    except Exception as exc:  # fail open to defaults, retry soon
        logger.warning("registry_load_failed", extra={"event": "registry_load_failed", "error": str(exc)[:200]})
        rows = []
        # backdate so the entry expires after _FAIL_TTL_SECONDS regardless of ttl
        stamp = now - max(0.0, ttl - _FAIL_TTL_SECONDS)
    with _cache_lock:
        if gen == _generation:
            if len(_cache) >= _CACHE_MAX:
                _cache.clear()
            _cache[cache_key] = (stamp, rows)
    return rows


# Selects winning artifact according to tenant precedence and canary rules.
# Evaluates org canaries, org active, global canaries, then global active.
# Returns highest precedence active or canary ArtifactBase, or None.
def _pick(rows: Sequence[ArtifactBase], org_id: str, subject: str) -> Optional[ArtifactBase]:
    def newest(items: List[ArtifactBase]) -> Optional[ArtifactBase]:
        return max(items, key=lambda a: a.version) if items else None

    org_rows = [a for a in rows if a.scope == "org" and a.org_id == org_id and org_id]
    glob_rows = [a for a in rows if a.scope == "global"]
    for pool in (org_rows, glob_rows):
        canary = newest([a for a in pool if in_canary(a, subject)])
        if canary is not None:
            return canary
        active = newest([a for a in pool if a.status == "active"])
        if active is not None:
            return active
    return None


# Resolves appropriate artifact instance serving the current request context.
# Checks context overrides, exclusive flags, and evaluated candidates.
# Returns active or canary ArtifactBase and logs resolution in context.
def resolve(kind: str, key: str) -> Optional[ArtifactBase]:
    """Resolve the artifact serving the current context for a slot (or None)."""
    overrides = _overrides.get()
    if overrides is not None and (kind, key) in overrides:
        art = overrides[(kind, key)]
        _note(art)
        return art
    if _exclusive.get():
        return None
    ctx = current_context()
    org_id = ctx.org_id if ctx is not None else ""
    subject = _subject(ctx)
    try:
        art = _pick(_candidates(kind, key, org_id), org_id, subject)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("registry_resolve_failed", extra={"event": "registry_resolve_failed", "error": str(exc)[:200]})
        return None
    if art is not None:
        _note(art)
    return art


# Logs served artifact metadata into active request LearningContext.
# Records artifact ID, kind, key, version, scope, and status.
# Enables downstream telemetry to track exact prompt and config versions.
def _note(art: ArtifactBase) -> None:
    ctx = current_context()
    if ctx is not None:
        ctx.note_artifact(
            art.id,
            {"kind": art.kind, "key": art.key, "version": art.version, "scope": art.scope, "status": art.status},
        )


# Resolves effective prompt text for specified key from registry or defaults.
# Looks up active prompt artifact falling back to default or spec string.
# Returns prompt text string ready for agent formatting and LLM calls.
def get_prompt(key: str, default: Optional[str] = None) -> str:
    """Prompt text for ``key``: served artifact, else ``default``, else baked-in."""
    spec = PROMPT_SPECS.get(key)
    fallback = default if default is not None else (spec.default if spec else "")
    art = resolve("prompt", key)
    if isinstance(art, PromptArtifact) and art.text.strip():
        return art.text
    return fallback


# Retrieves active routing configuration artifact from registry or defaults.
# Resolves routing artifact for routing key falling back to default config.
# Returns validated RoutingConfig model governing multi-agent flow.
def get_routing_config() -> RoutingConfig:
    art = resolve("routing", ROUTING_KEY)
    if isinstance(art, RoutingConfig):
        return art
    return _DEFAULT_ROUTING


# Fetches active few-shot exemplar examples registered for prompt slot.
# Resolves ExemplarSet artifact and extracts contained exemplar pairs.
# Returns list of ExemplarExample instances or empty list on fallback.
def get_exemplars(key: str) -> List[ExemplarExample]:
    art = resolve("exemplar", key)
    if isinstance(art, ExemplarSet):
        return list(art.examples)
    return []


@contextmanager
# Context manager overriding registry artifact resolution for active thread.
# Injects explicit artifacts into ContextVar for gate and replay testing.
# Supports exclusive mode forcing non-overridden slots to baked-in defaults.
def use_artifacts(artifacts: Sequence[ArtifactBase], *, exclusive: bool = False) -> Iterator[None]:
    """Serve ``artifacts`` for the current context regardless of status.

    ``exclusive=True`` also pins every other slot to its baked-in default so an
    evaluation measures exactly one candidate against a fixed baseline.
    """
    merged: Dict[Tuple[str, str], ArtifactBase] = dict(_overrides.get() or {})
    for art in artifacts:
        merged[(art.kind, art.key)] = art
    token = _overrides.set(merged)
    token_x = _exclusive.set(exclusive or _exclusive.get())
    try:
        yield
    finally:
        _exclusive.reset(token_x)
        _overrides.reset(token)


@contextmanager
# Context manager enforcing usage of baked-in defaults across all slots.
# Sets exclusive mode to true and clears overrides for baseline evaluation.
# Yields execution control and guarantees restoration of prior context.
def use_defaults() -> Iterator[None]:
    """Force baked-in defaults everywhere (baseline side of an A/B replay)."""
    token = _overrides.set({})
    token_x = _exclusive.set(True)
    try:
        yield
    finally:
        _exclusive.reset(token_x)
        _overrides.reset(token)


# Computes composite signature string of served non-default artifact IDs.
# Resolves active artifacts for each slot and sorts concatenated IDs.
# Returns unique comma-separated signature string for cache isolation.
def served_signature(slots: Sequence[Tuple[str, str]]) -> str:
    """Comma-joined ids of the non-default artifacts serving ``slots`` ('' when all default).

    Used to key process-local response caches so one org's (or a canary's)
    output is never replayed to a request served by different artifacts.
    """
    ids: List[str] = []
    for kind, key in slots:
        art = resolve(kind, key)
        if art is not None:
            ids.append(art.id)
    return ",".join(sorted(ids))

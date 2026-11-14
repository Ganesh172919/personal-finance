"""Small builders shared by the learning-loop tests."""

from datetime import datetime, timezone
from typing import Iterable, Optional

from learning import run_store
from registry.context import LearningContext, begin_context, clear_context
from registry.defaults import PROMPT_SPECS
from registry.models import PromptArtifact
from registry.store import ArtifactStore


def default_text(key: str) -> str:
    return PROMPT_SPECS[key].default


def new_prompt(key: str, suffix: str, *, org: Optional[str] = "orgA", gated: bool = True, status: Optional[str] = None):
    """Create a prompt artifact = baked-in default + ``suffix`` (optionally pre-gated)."""
    kwargs = {"scope": "org", "org_id": org} if org else {"scope": "global"}
    art = ArtifactStore().create(PromptArtifact(key=key, text=default_text(key) + " " + suffix, **kwargs))
    if gated:
        ArtifactStore().update_fields(art.id, gate_passed=True)
        art = ArtifactStore().get(art.id)
    return art


def add_run(
    org: str,
    user: str,
    output_id: str,
    *,
    artifact_ids: Iterable[str] = (),
    route: str = "comprehensive",
    input_text: str = "How should I plan my savings",
    output_text: str = "Here is a plan",
    fallback: bool = False,
    latency_ms: float = 100.0,
    tokens: int = 100,
    verification_failed: bool = False,
    cache_hit: bool = False,
    model: str = "model-a",
    opt_out: bool = False,
) -> bool:
    ctx: LearningContext = begin_context(org, user, output_id, opt_out=opt_out, agent_output_id=output_id)
    try:
        for aid in artifact_ids:
            ctx.note_artifact(aid, {"kind": "prompt", "key": "x", "version": 1, "scope": "org", "status": "canary"})
        ctx.cache_hit = cache_hit
        ctx.note_verification(not verification_failed)
        return run_store.capture_run(
            ctx,
            route=route,
            node_trace=["master"],
            tokens={"prompt": tokens // 2, "completion": tokens - tokens // 2},
            latency_ms=latency_ms,
            provider="prov",
            model=model,
            fallback_used=fallback,
            input_text=input_text,
            output_text=output_text,
            task_class="master",
        )
    finally:
        clear_context()


def add_feedback(org: str, user: str, output_id: str, rating: str, reason: Optional[str] = None, **kw) -> bool:
    return run_store.record_feedback(
        org_id=org, user_id=user, agent_output_id=output_id, rating=rating, reason_code=reason, **kw
    )


def now() -> datetime:
    return datetime.now(timezone.utc)

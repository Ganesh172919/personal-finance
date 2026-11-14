"""
api/learning_routes.py - HTTP surface of the self-improvement loop
==================================================================

All routes sit behind the existing internal-token middleware and require the
gateway actor headers ``X-Internal-Org-Id`` and ``X-Internal-User-Id``.  Admin
routes also require ``X-Internal-Role: admin`` (403 otherwise).  Org and user always
come from headers, never from the body.  JSON is camelCase.

See ``docs/AI_CORE.md`` ("Self-improvement loop") for the contract.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from learning import config as learning_config
from learning import optimizer, reports, rollout, run_store
from registry.models import ArtifactBase, artifact_to_api
from registry.store import ArtifactError, ArtifactStore, NotFound

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/learning", tags=["learning"])

ReasonCode = Literal["wrong_number", "irrelevant", "too_long", "unsafe", "unclear", "other"]


# Schema for recording explicit user feedback on agent advisory outputs.
# Captures ratings, reason codes, textual corrections, and runtime routes.
# Ignores extraneous fields while validating token and model identifiers.
class FeedbackBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    agentOutputId: str = Field(min_length=1, max_length=200)
    rating: Literal["up", "down"]
    reasonCode: Optional[ReasonCode] = None
    correction: Optional[str] = Field(default=None, max_length=500)
    route: Optional[str] = Field(default=None, max_length=80)
    promptVersion: Optional[str] = Field(default=None, max_length=200)
    routingVersion: Optional[str] = Field(default=None, max_length=200)
    modelName: Optional[str] = Field(default=None, max_length=120)
    provider: Optional[str] = Field(default=None, max_length=60)
    cacheHit: Optional[bool] = None


# Request schema for managing administrative artifact lifecycle transitions.
# Identifies the executing user context alongside optional audit rationale notes.
# Enforces validation on actor identifiers across promotion and rollback tasks.
class ActionBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    actorUserId: str = Field(min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=500)


# Payload specification for triggering automated learning optimization jobs.
# Dictates whether optimizations apply within an organization or globally.
# Defaults execution scope to organization boundaries for secure tenant isolation.
class OptimizeBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    scope: Literal["org", "global"] = "org"


# ---------------------------------------------------------------------------
# Extracts and validates actor credentials from internal gateway request headers.
# Enforces mandatory organization and user context across learning routes.
# Asserts administrative permissions for protected lifecycle endpoints.
def _actor(request: Request, *, admin: bool = False) -> Tuple[str, str]:
    org_id = (request.headers.get("x-internal-org-id") or "").strip()
    user_id = (request.headers.get("x-internal-user-id") or "").strip()
    if not org_id or not user_id:
        raise HTTPException(status_code=403, detail="AI actor context is required")
    if admin and (request.headers.get("x-internal-role") or "").strip().lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin role is required")
    return org_id, user_id


# Checks if the requesting tenant has enabled learning loop data opt-out.
# Inspects internal request header indicators to protect tenant privacy.
# Governs whether telemetry and output samples may be archived for training.
def _opt_out(request: Request) -> bool:
    return (request.headers.get("x-internal-learning-opt-out") or "").strip() == "1"


# Formats standardized JSON error responses with status codes and messages.
# Produces uniform API error structures consumed by upstream gateway callers.
# Ensures predictable error serialization across route validation failures.
def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message})


# Enforces multi-tenant visibility controls over stored learning artifacts.
# Allows access only to organization-owned artifacts or global system defaults.
# Conceals foreign organization records to prevent cross-tenant data leaks.
def _visible(artifact: Optional[ArtifactBase], org_id: str) -> Optional[ArtifactBase]:
    """An org sees its own artifacts and global ones; never another org's."""
    if artifact is None:
        return None
    if artifact.scope == "org" and artifact.org_id != org_id:
        return None
    return artifact


# Loads and verifies tenant visibility for a designated learning artifact.
# Queries the persistent artifact store and filters by requesting organization.
# Raises HTTP 404 exceptions when artifacts do not exist or access is forbidden.
def _load(artifact_id: str, org_id: str) -> ArtifactBase:
    artifact = _visible(ArtifactStore().get(artifact_id), org_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact


# Enforces security guards on artifact lifecycle state transition requests.
# Confirms identity match between authenticated user and payload actor user.
# Restricts global system artifact modifications to authorized platform admins.
def _act_guard(artifact: ArtifactBase, org_id: str, user_id: str, body: ActionBody) -> None:
    if body.actorUserId != user_id:
        raise HTTPException(status_code=403, detail="Actor does not match the supplied user")
    if not rollout.can_act_on(artifact, org_id):
        raise HTTPException(status_code=403, detail="Global artifacts can only be changed by a platform admin org")


# Translates internal artifact store exceptions into client-ready HTTP errors.
# Maps missing artifact errors to 404 responses and state conflicts to 409.
# Preserves internal exception codes for upstream diagnostic tracking.
def _artifact_error(exc: ArtifactError) -> JSONResponse:
    if isinstance(exc, NotFound):
        return _error(404, "NOT_FOUND", "Artifact not found")
    return _error(409, exc.code, str(exc))


# ---------------------------------------------------------------------------
# Ingests user ratings, feedback classifications, and output corrections.
# Records feedback events asynchronously within the learning run store.
# Safely catches and logs ingestion errors to prevent client request failures.
@router.post("/feedback", status_code=202)
async def post_feedback(body: FeedbackBody, request: Request) -> Dict[str, Any]:
    org_id, user_id = _actor(request)
    try:
        run_store.record_feedback(
            org_id=org_id,
            user_id=user_id,
            agent_output_id=body.agentOutputId,
            rating=body.rating,
            reason_code=body.reasonCode,
            correction=body.correction,
            route=body.route,
            prompt_version=body.promptVersion,
            routing_version=body.routingVersion,
            model_name=body.modelName,
            provider=body.provider,
            cache_hit=body.cacheHit,
            opt_out=_opt_out(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # learning must never turn a thumbs-up into a 500
        logger.warning("feedback_failed", extra={"event": "feedback_failed", "error": str(exc)[:200]})
    return {"accepted": True}


# Returns overall system status for the continuous self-improvement loop.
# Aggregates active canary rollouts, recent decision traces, and audit reports.
# Provides visibility into the latest scheduled optimization cycle results.
@router.get("/status")
async def get_status(request: Request) -> Dict[str, Any]:
    org_id, _ = _actor(request, admin=True)
    return {
        "promotionMode": learning_config.promotion_mode(),
        "canary": {
            "active": rollout.active_canaries(org_id),
            "lastDecisions": rollout.last_decisions(org_id, limit=10),
        },
        "reports": reports.list_reports(5, org_id),
        "optimizer": optimizer.last_run(org_id),
    }


# Lists learning artifacts matching requested kind and lifecycle status filters.
# Restricts query scope to organization-scoped and global shared artifacts.
# Returns serialized artifact models formatted for client management views.
@router.get("/artifacts")
async def list_artifacts(request: Request, kind: Optional[str] = None, status: Optional[str] = None) -> Dict[str, Any]:
    org_id, _ = _actor(request, admin=True)
    if kind is not None and kind not in ("prompt", "routing", "exemplar"):
        raise HTTPException(status_code=422, detail="kind must be prompt, routing or exemplar")
    if status is not None and status not in ("draft", "shadow", "canary", "active", "retired"):
        raise HTTPException(status_code=422, detail="invalid status")
    items = ArtifactStore().list(kind=kind, status=status, org_id=org_id, include_global=True, limit=200)
    return {"items": [artifact_to_api(a) for a in items]}


# Retrieves complete detail and content payloads for an individual artifact.
# Validates caller tenant permissions before serving stored artifact records.
# Formats internal artifact domain models into public API response structures.
@router.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str, request: Request) -> Dict[str, Any]:
    org_id, _ = _actor(request, admin=True)
    return artifact_to_api(_load(artifact_id, org_id))


# Promotes an artifact to the next progressive rollout lifecycle stage.
# Advances candidate prompts or routing configs through canary evaluations.
# Records promotion audits with actor identifiers and explanatory notes.
@router.post("/artifacts/{artifact_id}/promote")
async def promote_artifact(artifact_id: str, body: ActionBody, request: Request):
    org_id, user_id = _actor(request, admin=True)
    artifact = _load(artifact_id, org_id)
    _act_guard(artifact, org_id, user_id, body)
    try:
        updated = rollout.promote(artifact_id, actor=body.actorUserId, note=body.note or "")
    except ArtifactError as exc:
        return _artifact_error(exc)
    return artifact_to_api(updated)


# Reverts an active or canary artifact to its previous stable baseline.
# Enforces organizational authorization checks prior to state reversion.
# Logs rollback trigger actions to preserve transparency in deployment audits.
@router.post("/artifacts/{artifact_id}/rollback")
async def rollback_artifact(artifact_id: str, body: ActionBody, request: Request):
    org_id, user_id = _actor(request, admin=True)
    artifact = _load(artifact_id, org_id)
    _act_guard(artifact, org_id, user_id, body)
    try:
        updated = rollout.rollback(artifact_id, actor=body.actorUserId, note=body.note or "", auto=False)
    except ArtifactError as exc:
        return _artifact_error(exc)
    return artifact_to_api(updated)


# Enqueues asynchronous optimization jobs across prompt and routing spaces.
# Validates platform administrator scopes when executing global optimizations.
# Dispatches background tasks and returns job tracking identifiers immediately.
@router.post("/optimize/run", status_code=202)
async def run_optimizer(request: Request, background: BackgroundTasks, body: Optional[OptimizeBody] = None):
    org_id, _ = _actor(request, admin=True)
    scope = (body.scope if body is not None else "org") or "org"
    if scope == "global" and org_id not in learning_config.platform_org_ids():
        raise HTTPException(status_code=403, detail="Global optimization requires a platform admin org")
    job_id = optimizer.create_job(org_id, scope)
    background.add_task(optimizer.run_job, job_id, org_id, scope)
    return {"jobId": job_id}


# Retrieves historical optimization reports and learning evaluation metrics.
# Scopes report listings to the requesting organization and global rollouts.
# Supports configurable pagination limits for reporting and audit dashboards.
@router.get("/reports")
async def get_reports(request: Request, limit: int = 20) -> Dict[str, List[Dict[str, Any]]]:
    org_id, _ = _actor(request, admin=True)
    return {"items": reports.list_reports(limit, org_id)}

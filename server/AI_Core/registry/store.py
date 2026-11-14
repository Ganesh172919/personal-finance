"""
registry/store.py - MongoDB persistence for versioned artifacts (``ai_artifacts``)
================================================================================

All writes go through ``ArtifactStore`` so that every status change leaves an
audit row in ``ai_artifact_audit``.  Reads for *serving* live in ``loader.py``
(TTL cached); the store itself always hits the database.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from utils.mongo_client import get_mongo_db

from .lint import lint_artifact
from .models import ArtifactBase, artifact_from_doc, utcnow

ARTIFACTS = "ai_artifacts"
AUDIT = "ai_artifact_audit"

# from -> allowed targets.  retired -> active exists only for rollback restore.
_TRANSITIONS = {
    "draft": {"shadow", "canary", "active", "retired"},
    "shadow": {"draft", "canary", "active", "retired"},
    "canary": {"active", "retired"},
    "active": {"retired"},
    "retired": {"active"},
}


# Base exception class for artifact persistence and lifecycle errors.
# Defines standardized error code string for client error mapping.
# Serves as root exception for all registry store domain failures.
class ArtifactError(Exception):
    code = "ARTIFACT_ERROR"


# Raised when candidate artifact fails safety or structural linting.
# Formats multiple diagnostic lint errors into composite message string.
# Captures raw list of error messages for detailed error inspection.
class LintError(ArtifactError):
    code = "LINT_FAILED"

    def __init__(self, errors: List[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


# Raised when invalid artifact lifecycle status transition is attempted.
# Prevents unauthorized movements between draft, canary, and retired states.
# Enforces strict state machine rules governing artifact promotions.
class TransitionError(ArtifactError):
    code = "INVALID_STATE"


# Raised when requested artifact cannot be located by identifier in database.
# Indicates missing document in the underlying MongoDB artifacts collection.
# Provides standard NOT_FOUND error code for REST API handler mapping.
class NotFound(ArtifactError):
    code = "NOT_FOUND"


_index_lock = threading.Lock()
_indexed_dbs: "set[int]" = set()


# Builds required compound indexes on artifact and audit collections.
# Thread-safely tracks initialized database instances to avoid duplicates.
# Ensures query performance for artifact lookups and audit trails.
def _ensure_indexes(db: Any) -> None:
    marker = id(db)
    if marker in _indexed_dbs:
        return
    with _index_lock:
        if marker in _indexed_dbs:
            return
        try:
            col = db[ARTIFACTS]
            col.create_index([("kind", 1), ("key", 1), ("scope", 1), ("org_id", 1), ("status", 1)])
            col.create_index([("org_id", 1), ("status", 1), ("updated_at", -1)])
            db[AUDIT].create_index([("artifact_id", 1), ("at", -1)])
            db[AUDIT].create_index([("org_id", 1), ("at", -1)])
        except Exception:  # pragma: no cover - index creation must never break serving
            pass
        _indexed_dbs.add(marker)


# Manages persistence and lifecycle state transitions for artifacts.
# Interfaces directly with MongoDB collections for storage and audit history.
# Invalidates loader cache upon artifact creation and status updates.
class ArtifactStore:
    # Initializes ArtifactStore instance with optional custom database client.
    # Stores database handle reference for lazy index creation and queries.
    # Falls back to default application MongoDB client when unspecified.
    def __init__(self, db: Any = None):
        self._db = db

    # Lazily resolves MongoDB database instance and guarantees index presence.
    # Triggers idempotent index creation before returning database handle.
    # Returns active PyMongo database connection for artifact operations.
    @property
    def db(self) -> Any:
        db = self._db if self._db is not None else get_mongo_db()
        _ensure_indexes(db)
        return db

    # Accesses primary MongoDB collection storing versioned artifacts.
    # Reads collection handle corresponding to the ai_artifacts collection.
    # Returns PyMongo Collection instance for artifact CRUD operations.
    @property
    def col(self) -> Any:
        return self.db[ARTIFACTS]

    # -- reads -------------------------------------------------------------
    # Retrieves single artifact by identifier and deserializes to typed model.
    # Queries collection matching unique document ID and validates schema.
    # Returns concrete ArtifactBase subclass instance or None if not found.
    def get(self, artifact_id: str) -> Optional[ArtifactBase]:
        doc = self.col.find_one({"_id": artifact_id})
        return artifact_from_doc(doc) if doc else None

    # Fetches raw unparsed MongoDB document dictionary for artifact ID.
    # Bypasses Pydantic validation when raw database inspection is needed.
    # Returns dictionary document representation or None if not located.
    def get_doc(self, artifact_id: str) -> Optional[Dict[str, Any]]:
        return self.col.find_one({"_id": artifact_id})

    # Queries visible artifacts applying optional kind, status, and org filters.
    # Supports tenant isolation combining org-scoped and global artifacts.
    # Returns sorted list of ArtifactBase models ordered by update time.
    def list(
        self,
        *,
        kind: Optional[str] = None,
        status: Optional[str] = None,
        key: Optional[str] = None,
        org_id: Optional[str] = None,
        include_global: bool = True,
        scope: Optional[str] = None,
        limit: int = 200,
    ) -> List[ArtifactBase]:
        """List artifacts visible to ``org_id`` (its own + global)."""
        flt: Dict[str, Any] = {}
        if kind:
            flt["kind"] = kind
        if status:
            flt["status"] = status
        if key:
            flt["key"] = key
        if scope:
            flt["scope"] = scope
        if org_id is not None and scope != "global":
            visibility: List[Dict[str, Any]] = [{"scope": "org", "org_id": org_id}]
            if include_global:
                visibility.append({"scope": "global"})
            flt["$or"] = visibility
        docs = list(self.col.find(flt).sort("updated_at", -1).limit(max(1, min(1000, limit))))
        return [artifact_from_doc(d) for d in docs]

    # Queries active and canary artifacts eligible to serve tenant requests.
    # Scopes candidates across global and specified organization boundaries.
    # Returns list of available ArtifactBase models matching slot criteria.
    def serving_candidates(self, kind: str, key: str, org_id: Optional[str]) -> List[ArtifactBase]:
        """Active + canary artifacts that may serve ``org_id`` for a slot."""
        flt: Dict[str, Any] = {"kind": kind, "key": key, "status": {"$in": ["active", "canary"]}}
        visibility: List[Dict[str, Any]] = [{"scope": "global"}]
        if org_id:
            visibility.append({"scope": "org", "org_id": org_id})
        flt["$or"] = visibility
        return [artifact_from_doc(d) for d in self.col.find(flt)]

    # Locates currently active artifact version for specific scope and key.
    # Filters by scope and tenant returning highest version document.
    # Returns typed active ArtifactBase instance or None if unassigned.
    def active_for(self, kind: str, key: str, scope: str, org_id: Optional[str]) -> Optional[ArtifactBase]:
        flt: Dict[str, Any] = {"kind": kind, "key": key, "scope": scope, "status": "active"}
        if scope == "org":
            flt["org_id"] = org_id
        docs = list(self.col.find(flt).sort("version", -1).limit(1))
        return artifact_from_doc(docs[0]) if docs else None

    # Computes next incremental version number for new artifact candidate.
    # Inspects highest existing version within kind, key, and scope context.
    # Returns incremented integer version ensuring chronological ordering.
    def _next_version(self, artifact: ArtifactBase) -> int:
        flt: Dict[str, Any] = {"kind": artifact.kind, "key": artifact.key, "scope": artifact.scope}
        if artifact.scope == "org":
            flt["org_id"] = artifact.org_id
        top = list(self.col.find(flt).sort("version", -1).limit(1))
        return (int(top[0].get("version", 0)) if top else 0) + 1

    # -- writes ------------------------------------------------------------
    # Persists new artifact candidate after executing mandatory lint checks.
    # Assigns next sequential version number and logs audit entry.
    # Invalidates loader cache and returns created ArtifactBase instance.
    def create(self, artifact: ArtifactBase, *, actor: str = "system", require_lint: bool = True) -> ArtifactBase:
        result = lint_artifact(artifact)
        if require_lint and not result.ok:
            raise LintError(result.errors)
        artifact.version = self._next_version(artifact)
        artifact.status = "draft" if artifact.status not in ("draft", "shadow") else artifact.status
        doc = artifact.to_doc()
        doc["lint"] = result.to_dict()
        self.col.insert_one(doc)
        self.audit(artifact, "created", actor=actor, to_status=artifact.status, reason=artifact.created_by)
        from . import loader

        loader.invalidate()
        return artifact

    # Performs partial update of specified fields on existing artifact document.
    # Updates timestamp automatically and verifies document existence.
    # Flushes loader cache to propagate field changes across application.
    def update_fields(self, artifact_id: str, **fields: Any) -> None:
        fields["updated_at"] = utcnow()
        res = self.col.update_one({"_id": artifact_id}, {"$set": fields})
        if getattr(res, "matched_count", 1) == 0:
            raise NotFound(artifact_id)
        from . import loader

        loader.invalidate()

    # Transitions artifact lifecycle state adhering to transition rules.
    # Validates target status, records audit event, and updates record.
    # Returns updated ArtifactBase instance reflecting new lifecycle state.
    def set_status(
        self,
        artifact_id: str,
        status: str,
        *,
        actor: str,
        reason: str = "",
        auto: bool = False,
        extra: Optional[Dict[str, Any]] = None,
        metrics: Optional[Dict[str, Any]] = None,
    ) -> ArtifactBase:
        artifact = self.get(artifact_id)
        if artifact is None:
            raise NotFound(artifact_id)
        if status != artifact.status and status not in _TRANSITIONS.get(artifact.status, set()):
            raise TransitionError(f"cannot move {artifact.status} -> {status}")
        fields: Dict[str, Any] = {"status": status}
        if extra:
            fields.update(extra)
        previous = artifact.status
        self.update_fields(artifact_id, **fields)
        updated = self.get(artifact_id)
        assert updated is not None
        self.audit(
            updated,
            "status",
            actor=actor,
            from_status=previous,
            to_status=status,
            reason=reason,
            auto=auto,
            metrics=metrics,
        )
        return updated

    # Appends comprehensive lifecycle audit trail record into audit collection.
    # Captures transition actors, previous and target statuses, and metrics.
    # Fails silently to prevent non-critical audit errors blocking workflows.
    def audit(
        self,
        artifact: ArtifactBase,
        action: str,
        *,
        actor: str,
        from_status: Optional[str] = None,
        to_status: Optional[str] = None,
        reason: str = "",
        auto: bool = False,
        metrics: Optional[Dict[str, Any]] = None,
    ) -> None:
        try:
            self.db[AUDIT].insert_one(
                {
                    "artifact_id": artifact.id,
                    "kind": artifact.kind,
                    "key": artifact.key,
                    "version": artifact.version,
                    "scope": artifact.scope,
                    "org_id": artifact.org_id,
                    "action": action,
                    "actor": actor,
                    "from_status": from_status,
                    "to_status": to_status,
                    "reason": (reason or "")[:500],
                    "auto": bool(auto),
                    "metrics": metrics or {},
                    "at": datetime.now(timezone.utc),
                }
            )
        except Exception:  # pragma: no cover
            pass

    # Retrieves audit log entries filtered by artifact ID or organization scope.
    # Sorts records chronologically descending up to requested limit.
    # Returns list of formatted audit trail dictionaries with string IDs.
    def list_audit(
        self, *, artifact_id: Optional[str] = None, org_id: Optional[str] = None, limit: int = 50
    ) -> List[Dict[str, Any]]:
        flt: Dict[str, Any] = {}
        if artifact_id:
            flt["artifact_id"] = artifact_id
        if org_id is not None:
            flt["$or"] = [{"org_id": org_id}, {"org_id": None}]
        rows = list(self.db[AUDIT].find(flt).sort("at", -1).limit(max(1, min(500, limit))))
        for row in rows:
            row["_id"] = str(row["_id"])
        return rows


# Factory function instantiating default ArtifactStore persistence service.
# Creates store configured with standard application database settings.
# Returns ready-to-use ArtifactStore instance for registry operations.
def get_store() -> ArtifactStore:
    return ArtifactStore()

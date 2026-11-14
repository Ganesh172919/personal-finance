/**
 * @fileoverview Admin endpoints for the persistent dead-letter job collection (org admin/owner only).
 */
import type { Request, Response } from "express";

import { listDeadLetterJobs, replayDeadLetterJob } from "../../services/deadLetterJobs";
import { HttpError } from "../../middleware/httpError";

const roleRank: Record<string, number> = { member: 1, admin: 2, owner: 3 };

// Enforces administrative permissions for dead-letter background job inspections.
// Confirms that the caller holds an admin or owner role rank within the organization.
// Raises an unauthorized or access denied exception when credentials fail validation.
const requireOrgAdmin = (req: Request) => {
  if (!req.org) throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  if ((roleRank[req.org.role] ?? 0) < roleRank.admin) throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  const userId = String((req.user as any)?._id ?? "");
  if (!userId) throw new HttpError(401, "UNAUTHENTICATED", "Authentication required");
  return { orgId: String(req.org.orgId), userId };
};

// Lists failed background task entries queued within the persistent dead-letter store.
// Supports status filtering, execution kind criteria, and cursor-based pagination.
// Returns an array of failed execution descriptors along with cursor tokens.
export const listDeadLetterJobsHandler = async (req: Request, res: Response) => {
  const { orgId } = requireOrgAdmin(req);
  const query = req.query as any;
  res.json(await listDeadLetterJobs({ orgId, status: query.status ?? "pending", kind: query.kind, limit: Number(query.limit ?? 25), cursor: query.cursor }));
};

// Re-queues a failed background execution job from the dead-letter queue for replay.
// Asserts administrative privileges and resets execution state for task retries.
// Returns the replay execution result and updated state of the dead-letter job.
export const replayDeadLetterJobHandler = async (req: Request, res: Response) => {
  const { orgId, userId } = requireOrgAdmin(req);
  res.json(await replayDeadLetterJob({ id: String(req.params.id), orgId, userId }));
};

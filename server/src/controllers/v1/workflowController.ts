/**
 * @fileoverview Workflow Controller (v1)
 *
 * Automation workflows: define triggers and actions that run automatically
 * or on-demand. Supports listing, creating, and manually running workflows.
 *
 * Routes served:
 *   GET    /api/v1/workflows              - listOrgWorkflows
 *   GET    /api/v1/workflows/templates    - listOrgWorkflowTemplates
 *   POST   /api/v1/workflows              - createOrgWorkflow (admin)
 *   POST   /api/v1/workflows/:id/run      - runOrgWorkflow (admin)
 *
 * Key patterns:
 *   - List and templates readable by any org member; create/run require admin
 *   - Workflows have a trigger definition and an array of action steps
 *   - runOrgWorkflow enqueues a workflow run (may execute async)
 *   - Idempotency key supported on workflow runs to prevent duplicate executions
 *   - Templates are pre-built workflow definitions available for quick setup
 *
 * @module controllers/v1/workflowController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { createWorkflow, enqueueWorkflowRun, listWorkflows } from "../../services/workflows";
import { listWorkflowTemplatesForOrg } from "../../services/workflowTemplates";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const requireOrg = (req: Request) => {
  if (!req.org?.orgId) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const requireOrgAdmin = (req: Request) => {
  const orgId = requireOrg(req);
  if (roleRank[req.org!.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return orgId;
};

export const listOrgWorkflows = async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const workflows = await listWorkflows({ orgId });
  return res.json({
    workflows: workflows.map((wf: any) => ({
      id: String(wf._id),
      name: String(wf.name),
      enabled: Boolean(wf.enabled),
      trigger: wf.trigger,
      actions: wf.actions,
      created_at: wf.createdAt,
      updated_at: wf.updatedAt,
    })),
    request_id: req.requestId,
  });
};

export const listOrgWorkflowTemplates = async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const templates = await listWorkflowTemplatesForOrg({ orgId });
  return res.json({
    org_id: orgId.toString(),
    templates,
    request_id: req.requestId,
  });
};

export const createOrgWorkflow = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgAdmin(req);
  const body = req.body as any;

  const created = await createWorkflow({
    orgId,
    userId: user._id,
    name: String(body.name),
    enabled: body.enabled === undefined ? true : Boolean(body.enabled),
    trigger: body.trigger,
    actions: body.actions,
  });

  return res.status(201).json({
    workflow: {
      id: created._id.toString(),
      name: created.name,
      enabled: created.enabled,
      trigger: (created as any).trigger,
      actions: (created as any).actions,
      created_at: created.createdAt,
    },
    request_id: req.requestId,
  });
};

export const runOrgWorkflow = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgAdmin(req);
  const workflowIdRaw = String((req as any).params?.id || "");
  if (!mongoose.Types.ObjectId.isValid(workflowIdRaw)) {
    throw new HttpError(400, "INVALID_WORKFLOW_ID", "Invalid workflow id");
  }
  const workflowId = new mongoose.Types.ObjectId(workflowIdRaw);

  const body = req.body as { idempotency_key?: string };
  // Idempotency key prevents duplicate workflow runs from retry/network issues
  const idempotencyKey = body?.idempotency_key ? String(body.idempotency_key) : undefined;

  const result = await enqueueWorkflowRun({
    orgId,
    workflowId,
    triggeredByUserId: user._id,
    requestId: req.requestId,
    idempotencyKey,
  });

  return res.json({
    queued: result.queued,
    run: {
      id: String((result.run as any)._id),
      status: (result.run as any).status,
      started_at: (result.run as any).startedAt,
      finished_at: (result.run as any).finishedAt,
      result: (result.run as any).result,
      error: (result.run as any).error,
    },
    request_id: req.requestId,
  });
};

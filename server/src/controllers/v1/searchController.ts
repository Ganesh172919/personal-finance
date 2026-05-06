/**
 * @fileoverview Search Controller (v1)
 *
 * Global search across multiple entity types (transactions, budgets, goals,
 * workflows, etc.) within an organization.
 *
 * Routes served:
 *   GET /api/v1/search - search
 *
 * Key patterns:
 *   - Delegates to globalSearch service which queries multiple collections
 *   - Supports type filtering (limit search to specific entity types)
 *   - Cursor-based pagination for efficient deep pagination
 *   - Org context extracted from req.org; falls back to user ID if missing
 *
 * @module controllers/v1/searchController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import { globalSearch, SearchableType } from "../../services/searchService";

export async function search(req: Request, res: Response) {
  const validated = req.query as unknown as {
    q: string;
    types?: string[];
    limit?: number;
    cursor?: string;
  };
  const { q, types, limit, cursor } = validated;

  const user = (req as any).user;
  const orgCtx = (req as any).org;
  const orgId = orgCtx?.orgId
    ? new mongoose.Types.ObjectId(orgCtx.orgId)
    : user?._id
      ? new mongoose.Types.ObjectId(String(user._id))
      : undefined;

  if (!orgId) {
    res.status(400).json({
      message: "Organization context required",
      code: "MISSING_ORG_CONTEXT",
      request_id: req.requestId,
    });
    return;
  }

  const result = await globalSearch({
    orgId,
    userId: new mongoose.Types.ObjectId(String(user._id)),
    query: q,
    types: types as SearchableType[] | undefined,
    limit: limit || 20,
    cursor,
  });

  res.json({ ...result, request_id: req.requestId });
}

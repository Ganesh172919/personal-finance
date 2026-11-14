/**
 * @fileoverview Unified Context Retrieval Controller (v1)
 *
 * Exposes cross-silo unified retrieval across user memory facts,
 * workspace files/documents, and ledger transactions.
 *
 * Routes served:
 *   GET  /api/v1/search/unified-context
 *   POST /api/v1/search/unified-context
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import {
  retrieveUnifiedContext,
  type UnifiedContextSourceType,
} from "../../services/unifiedContextRetrievalService";

// Handles GET requests for multi-source unified context retrieval using URL query parameters.
// Validates tenant authorization before searching across memories, documents, and transaction ledgers.
export async function getUnifiedContext(req: Request, res: Response) {
  const query = req.query as unknown as {
    q: string;
    sources?: UnifiedContextSourceType[];
    limit?: number;
    minScore?: number;
  };

  const user = (req as any).user;
  const orgCtx = (req as any).org;
  const orgId = orgCtx?.orgId
    ? new mongoose.Types.ObjectId(orgCtx.orgId)
    : user?._id
      ? new mongoose.Types.ObjectId(String(user._id))
      : undefined;

  if (!orgId || !user?._id) {
    res.status(400).json({
      message: "Organization and user context required",
      code: "MISSING_CONTEXT",
      request_id: req.requestId,
    });
    return;
  }

  const result = await retrieveUnifiedContext({
    orgId,
    userId: new mongoose.Types.ObjectId(String(user._id)),
    query: query.q,
    sources: query.sources,
    limit: query.limit,
    minScore: query.minScore,
  });

  res.json({
    status: "success",
    request_id: req.requestId,
    ...result,
  });
}

// Handles POST requests for unified semantic retrieval supporting JSON structured query payloads.
// Executes unified cross-silo context ranking and returns fused evidence items with score metrics.
export async function postUnifiedContext(req: Request, res: Response) {
  const body = req.body as {
    query: string;
    sources?: UnifiedContextSourceType[];
    limit?: number;
    minScore?: number;
  };

  const user = (req as any).user;
  const orgCtx = (req as any).org;
  const orgId = orgCtx?.orgId
    ? new mongoose.Types.ObjectId(orgCtx.orgId)
    : user?._id
      ? new mongoose.Types.ObjectId(String(user._id))
      : undefined;

  if (!orgId || !user?._id) {
    res.status(400).json({
      message: "Organization and user context required",
      code: "MISSING_CONTEXT",
      request_id: req.requestId,
    });
    return;
  }

  const result = await retrieveUnifiedContext({
    orgId,
    userId: new mongoose.Types.ObjectId(String(user._id)),
    query: body.query,
    sources: body.sources,
    limit: body.limit,
    minScore: body.minScore,
  });

  res.json({
    status: "success",
    request_id: req.requestId,
    ...result,
  });
}

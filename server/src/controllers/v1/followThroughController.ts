/**
 * @fileoverview Personalized Follow-Through Controller (v1)
 *
 * Endpoints:
 *   GET  /api/v1/follow-through/recommendations
 *   POST /api/v1/follow-through/feedback
 *   GET  /api/v1/follow-through/preferences
 *   PUT  /api/v1/follow-through/preferences
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import {
  getFollowThroughRecommendations,
  getOrCreatePreferences,
  recordFollowThroughFeedback,
  updateFollowThroughPreferences,
} from "../../services/followThroughService";
import type {
  GetRecommendationsQuery,
  RecordFeedbackBody,
  UpdatePreferencesBody,
} from "../../schemas/v1/followThroughSchemas";

// Extracts and standardizes tenant organization ID and user ID from the active request context.
// Falls back to user identifier if explicit organization context is absent on the request.
function getContextIds(req: Request) {
  const user = (req as any).user;
  const orgCtx = (req as any).org;
  const orgId = orgCtx?.orgId
    ? new mongoose.Types.ObjectId(orgCtx.orgId)
    : user?._id
      ? new mongoose.Types.ObjectId(String(user._id))
      : undefined;
  const userId = user?._id ? new mongoose.Types.ObjectId(String(user._id)) : undefined;

  return { orgId, userId };
}

// Serves personalized follow-through action recommendations tailored to user preference profiles.
// Enforces tenant and user context validation before dispatching to the recommendation service.
export async function getRecommendationsHandler(req: Request, res: Response) {
  const { orgId, userId } = getContextIds(req);
  if (!orgId || !userId) {
    res.status(400).json({
      message: "Organization and user context required",
      code: "MISSING_CONTEXT",
      request_id: req.requestId,
    });
    return;
  }

  const query = req.query as unknown as GetRecommendationsQuery;
  const limit = query.limit || 10;

  const result = await getFollowThroughRecommendations(orgId, userId, limit);
  res.json({
    status: "success",
    request_id: req.requestId,
    data: result,
  });
}

// Records explicit user acceptance, dismissal, or completion feedback for a suggested recommendation.
// Updates feedback history counts and incrementally adjusts domain preference weighting.
export async function recordFeedbackHandler(req: Request, res: Response) {
  const { orgId, userId } = getContextIds(req);
  if (!orgId || !userId) {
    res.status(400).json({
      message: "Organization and user context required",
      code: "MISSING_CONTEXT",
      request_id: req.requestId,
    });
    return;
  }

  const body = req.body as RecordFeedbackBody;
  const updated = await recordFollowThroughFeedback(orgId, userId, {
    signalId: body.signalId,
    domain: body.domain,
    action: body.action,
    reason: body.reason,
  });

  res.json({
    status: "success",
    request_id: req.requestId,
    data: {
      message: "Feedback recorded successfully",
      feedbackHistoryCount: updated.feedbackHistory.length,
    },
  });
}

// Retrieves persistent user follow-through preferences including domain affinities and cadence.
// Converts underlying Map storage into serializable key-value dictionaries for API consumers.
export async function getPreferencesHandler(req: Request, res: Response) {
  const { orgId, userId } = getContextIds(req);
  if (!orgId || !userId) {
    res.status(400).json({
      message: "Organization and user context required",
      code: "MISSING_CONTEXT",
      request_id: req.requestId,
    });
    return;
  }

  const pref = await getOrCreatePreferences(orgId, userId);
  const focusDomains =
    pref.focusDomains instanceof Map
      ? Object.fromEntries(pref.focusDomains)
      : (pref.focusDomains as unknown as Record<string, number>) || {};

  res.json({
    status: "success",
    request_id: req.requestId,
    data: {
      focusDomains,
      riskTolerance: pref.riskTolerance,
      preferredCadence: pref.preferredCadence,
      totalFeedbackEvents: pref.feedbackHistory.length,
    },
  });
}

// Updates configuration parameters governing recommendation cadence, risk tolerance, and focus.
// Persists modifications through the preference service and returns normalized preference settings.
export async function updatePreferencesHandler(req: Request, res: Response) {
  const { orgId, userId } = getContextIds(req);
  if (!orgId || !userId) {
    res.status(400).json({
      message: "Organization and user context required",
      code: "MISSING_CONTEXT",
      request_id: req.requestId,
    });
    return;
  }

  const body = req.body as UpdatePreferencesBody;
  const updated = await updateFollowThroughPreferences(orgId, userId, body);
  const focusDomains =
    updated.focusDomains instanceof Map
      ? Object.fromEntries(updated.focusDomains)
      : (updated.focusDomains as unknown as Record<string, number>) || {};

  res.json({
    status: "success",
    request_id: req.requestId,
    data: {
      focusDomains,
      riskTolerance: updated.riskTolerance,
      preferredCadence: updated.preferredCadence,
    },
  });
}

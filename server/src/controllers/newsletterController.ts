/**
 * @fileoverview Newsletter Controller
 *
 * Handles newsletter preference management, preview, send, unsubscribe, and history.
 *
 * Routes served:
 *   GET    /api/v1/newsletter/preferences  - getPreferences
 *   PUT    /api/v1/newsletter/preferences  - updatePreferences
 *   POST   /api/v1/newsletter/preview      - previewNewsletter
 *   POST   /api/v1/newsletter/send-now     - sendNow
 *   GET    /api/v1/newsletter/unsubscribe/:token - unsubscribe
 *   GET    /api/v1/newsletter/history       - getHistory
 *
 * Key patterns:
 *   - Extract orgId from req.org (org context middleware)
 *   - Extract userId from req.user
 *   - Include request_id in all responses
 *   - Throw HttpError for error cases
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * Newsletter Controller
 * ├── 1. Authentication & Tenant Scope
 * │   ├── requireOrgContext (req.org.orgId)
 * │   └── requireUser (req.user._id)
 * ├── 2. Preferences Endpoints
 * │   ├── GET /preferences (Fetch current user settings or default)
 * │   └── PUT /preferences (Update delivery time, tz, and section flags)
 * ├── 3. Dynamic Preview Endpoint
 * │   └── POST /preview (Generate newsletter HTML without sending email)
 * ├── 4. Immediate Delivery Endpoint
 * │   └── POST /send-now (Trigger generateAndSendNewsletter immediately)
 * └── 5. Public Unsubscribe Endpoint
 *     └── GET /unsubscribe/:token (Token-based one-click opt-out)
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |               Newsletter Request from Frontend / Email        |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *                      [Endpoint Route Selection]
 *                 /            |            \             \
 *                /             |             \             \
 *               v              v              v             v
 *       GET/PUT /pref     POST /preview  POST /send-now  GET /unsub/:token
 *              |               |              |                 |
 *              v               v              v                 v
 *        +-----------+   +-----------+  +-----------+     +-----------+
 *        | Update or |   | Generate  |  | Enqueue   |     | Find by   |
 *        | Read MDB  |   | Preview   |  | Delivery  |     | UUID & set|
 *        | Pref Doc  |   | HTML      |  | Pipeline  |     | sub=false |
 *        +-----+-----+   +-----+-----+  +-----+-----+     +-----+-----+
 *              |               |              |                 |
 *              \               |              |                /
 *               \              |              |               /
 *                v             v              v              v
 *   +---------------------------------------------------------------+
 *   |           Return JSON Response with request_id                |
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module controllers/newsletterController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../models/userModel";
import NewsletterPreferenceModel from "../models/newsletterPreferenceModel";
import { HttpError } from "../middleware/httpError";
import { generateAndSendNewsletter, previewNewsletter } from "../services/newsletterService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const requireUser = (req: Request): IUserDocument => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }
  return user;
};

const mapPreference = (doc: any) => ({
  id: String(doc._id),
  user_id: String(doc.userId),
  org_id: String(doc.orgId),
  is_subscribed: Boolean(doc.isSubscribed),
  delivery_time: String(doc.deliveryTime || "07:00"),
  timezone: String(doc.timezone || "Asia/Kolkata"),
  content_preferences: {
    spending_summary: Boolean(doc.contentPreferences?.spendingSummary ?? true),
    budget_alerts: Boolean(doc.contentPreferences?.budgetAlerts ?? true),
    upcoming_bills: Boolean(doc.contentPreferences?.upcomingBills ?? true),
    financial_tips: Boolean(doc.contentPreferences?.financialTips ?? true),
    portfolio_news: Boolean(doc.contentPreferences?.portfolioNews ?? true),
    weekly_health_score: Boolean(doc.contentPreferences?.weeklyHealthScore ?? true),
    actionable_recommendations: Boolean(doc.contentPreferences?.actionableRecommendations ?? true),
  },
  last_sent_at: doc.lastSentAt || null,
  created_at: doc.createdAt,
  updated_at: doc.updatedAt,
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /newsletter/preferences
 * Returns the user's newsletter preferences. Creates defaults if none exist.
 */
export const getPreferences = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const user = requireUser(req);

  const pref = await NewsletterPreferenceModel.findOneAndUpdate(
    { userId: user._id, orgId },
    { $setOnInsert: { userId: user._id, orgId } },
    { upsert: true, new: true },
  ).lean();

  res.json({
    preference: pref ? mapPreference(pref) : null,
    request_id: req.requestId,
  });
};

/**
 * PUT /newsletter/preferences
 * Updates the user's newsletter preferences.
 */
export const updatePreferences = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const user = requireUser(req);
  const body = req.body as any;

  const updateFields: Record<string, unknown> = {};

  if (typeof body.isSubscribed === "boolean") {
    updateFields.isSubscribed = body.isSubscribed;
  }
  if (typeof body.deliveryTime === "string") {
    updateFields.deliveryTime = body.deliveryTime;
  }
  if (typeof body.timezone === "string") {
    updateFields.timezone = body.timezone;
  }
  if (body.contentPreferences && typeof body.contentPreferences === "object") {
    const cp = body.contentPreferences;
    for (const key of [
      "spendingSummary",
      "budgetAlerts",
      "upcomingBills",
      "financialTips",
      "portfolioNews",
      "weeklyHealthScore",
      "actionableRecommendations",
    ]) {
      if (typeof cp[key] === "boolean") {
        updateFields[`contentPreferences.${key}`] = cp[key];
      }
    }
  }

  if (Object.keys(updateFields).length === 0) {
    throw new HttpError(400, "NO_FIELDS", "No valid fields to update");
  }

  const updated = await NewsletterPreferenceModel.findOneAndUpdate(
    { userId: user._id, orgId },
    { $set: updateFields },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  res.json({
    preference: mapPreference(updated),
    request_id: req.requestId,
  });
};

/**
 * POST /newsletter/preview
 * Generates a newsletter preview without sending it.
 */
export const previewNewsletterHandler = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const user = requireUser(req);

  const { html, sections } = await previewNewsletter(user._id, orgId);

  res.json({
    html,
    sections,
    request_id: req.requestId,
  });
};

/**
 * POST /newsletter/send-now
 * Immediately generates and sends the newsletter to the current user.
 */
export const sendNow = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const user = requireUser(req);

  const result = await generateAndSendNewsletter(user._id, orgId);

  if (!result.ok) {
    const statusMap: Record<string, number> = {
      not_subscribed: 400,
      user_not_found: 404,
    };
    throw new HttpError(
      statusMap[result.reason || ""] || 500,
      "NEWSLETTER_SEND_FAILED",
      `Newsletter could not be sent: ${result.reason || "unknown error"}`
    );
  }

  res.json({
    message: "Newsletter sent successfully",
    request_id: req.requestId,
  });
};

/**
 * GET /newsletter/unsubscribe/:token
 * One-click unsubscribe using the unique token.
 */
export const unsubscribe = async (req: Request, res: Response) => {
  const token = String((req.params as any)?.token || "");

  const pref = await NewsletterPreferenceModel.findOneAndUpdate(
    { unsubscribeToken: token },
    { $set: { isSubscribed: false } },
    { new: true }
  ).lean();

  if (!pref) {
    throw new HttpError(404, "NOT_FOUND", "Invalid unsubscribe token");
  }

  res.json({
    message: "You have been unsubscribed from the FinWise newsletter.",
    is_subscribed: false,
    request_id: req.requestId,
  });
};

/**
 * GET /newsletter/history
 * Returns basic newsletter delivery history for the user.
 */
export const getHistory = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const user = requireUser(req);

  const limitRaw = Number((req.query as any)?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 10;
  const offsetRaw = Number((req.query as any)?.offset);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  const pref = await NewsletterPreferenceModel.findOne({
    userId: user._id,
    orgId,
  }).lean();

  // For now, return preference metadata as history.
  // A full implementation would query a NewsletterLog model.
  res.json({
    history: pref
      ? [
          {
            id: String((pref as any)._id),
            last_sent_at: (pref as any).lastSentAt || null,
            is_subscribed: Boolean((pref as any).isSubscribed),
            delivery_time: String((pref as any).deliveryTime || "07:00"),
            timezone: String((pref as any).timezone || "Asia/Kolkata"),
          },
        ]
      : [],
    pagination: {
      limit,
      offset,
      total: pref ? 1 : 0,
    },
    request_id: req.requestId,
  });
};

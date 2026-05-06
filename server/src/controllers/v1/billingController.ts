/**
 * @fileoverview Billing Controller (v1)
 *
 * Stripe billing integration: checkout sessions, customer portal, and webhook handling.
 *
 * Routes served:
 *   POST /api/v1/billing/checkout  - createCheckoutSession (admin)
 *   GET  /api/v1/billing/portal    - createBillingPortal (admin)
 *   POST /api/v1/billing/webhook   - stripeWebhook (unauthenticated, Stripe-signed)
 *
 * Key patterns:
 *   - Checkout and portal endpoints require admin role
 *   - Webhook endpoint validates Stripe signature using raw request body
 *   - Plan tiers limited to "pro" and "team"
 *   - Delegates all Stripe interaction to the billing service module
 *
 * @module controllers/v1/billingController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { createCheckout, createPortal, handleStripeWebhook } from "../../services/billing";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const requireOrgAdmin = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  if (roleRank[req.org.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

export const createCheckoutSession = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgAdmin(req);

  const body = req.body as {
    plan_tier: "pro" | "team";
    seats?: number;
    success_url?: string;
    cancel_url?: string;
  };

  if (body.plan_tier !== "pro" && body.plan_tier !== "team") {
    throw new HttpError(400, "INVALID_PLAN", "Invalid plan tier");
  }

  const response = await createCheckout({
    orgId,
    userId: user._id,
    planTier: body.plan_tier,
    seats: body.seats,
    successUrl: body.success_url,
    cancelUrl: body.cancel_url,
  });

  return res.status(200).json({
    provider: response.provider,
    checkout_url: response.checkout_url,
    activated: response.activated,
    session_id: (response as any).session_id,
    request_id: req.requestId,
  });
};

export const createBillingPortal = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const returnUrl = typeof (req.query as any)?.return_url === "string" ? String((req.query as any).return_url) : undefined;

  const response = await createPortal({ orgId, returnUrl });
  return res.json({
    provider: response.provider,
    portal_url: response.portal_url,
    request_id: req.requestId,
  });
};

export const stripeWebhook = async (req: Request, res: Response) => {
  const signature = String(req.header("stripe-signature") || "");
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    throw new HttpError(400, "MISSING_RAW_BODY", "Missing raw request body");
  }

  if (!signature) {
    throw new HttpError(400, "MISSING_SIGNATURE", "Missing Stripe signature header");
  }

  await handleStripeWebhook({ rawBody, signature });
  res.json({ received: true, request_id: req.requestId });
};


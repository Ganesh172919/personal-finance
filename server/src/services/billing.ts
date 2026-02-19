import mongoose from "mongoose";
import Stripe from "stripe";

import { getEnv } from "../config/env";
import BillingAccountModel from "../models/billingAccountModel";
import SubscriptionModel from "../models/subscriptionModel";
import type { PlanTier, EntitlementStatus } from "../models/entitlementModel";
import { getOrCreateEntitlement } from "./entitlements";
import OrgMemberModel from "../models/orgMemberModel";

let stripeClient: Stripe | null = null;

const getStripe = () => {
  if (stripeClient) return stripeClient;
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required for Stripe billing");
  }
  stripeClient = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  return stripeClient;
};

const toEntitlementStatus = (stripeStatus: string): EntitlementStatus => {
  const normalized = String(stripeStatus || "").toLowerCase();
  if (normalized === "trialing") return "trialing";
  if (normalized === "past_due") return "past_due";
  if (normalized === "canceled" || normalized === "unpaid" || normalized === "incomplete_expired") return "canceled";
  return "active";
};

const resolvePlanTierFromPrice = (priceId: string | null | undefined): PlanTier => {
  const env = getEnv();
  if (!priceId) return "free";
  if (env.STRIPE_PRICE_PRO_MONTHLY && priceId === env.STRIPE_PRICE_PRO_MONTHLY) return "pro";
  if (env.STRIPE_PRICE_TEAM_SEAT && priceId === env.STRIPE_PRICE_TEAM_SEAT) return "team";
  if (env.STRIPE_PRICE_ENTERPRISE && priceId === env.STRIPE_PRICE_ENTERPRISE) return "enterprise";
  return "free";
};

export const setOrgPlan = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  provider: "stub" | "stripe";
  planTier: PlanTier;
  status: EntitlementStatus;
  seats?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}) => {
  await BillingAccountModel.findOneAndUpdate(
    { orgId: params.orgId },
    {
      $set: {
        orgId: params.orgId,
        provider: params.provider,
        status: "active",
        stripeCustomerId: params.stripeCustomerId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await SubscriptionModel.findOneAndUpdate(
    { orgId: params.orgId },
    {
      $set: {
        orgId: params.orgId,
        provider: params.provider,
        planTier: params.planTier,
        status: params.status,
        seats: params.seats,
        stripeSubscriptionId: params.stripeSubscriptionId,
        stripePriceId: params.stripePriceId,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const entitlement = await getOrCreateEntitlement({ orgId: params.orgId, userId: params.userId });
  entitlement.plan = params.planTier;
  entitlement.status = params.status;
  entitlement.billingCustomerId = params.stripeCustomerId;
  entitlement.currentPeriodStart = params.currentPeriodStart;
  entitlement.currentPeriodEnd = params.currentPeriodEnd;
  await entitlement.save();

  return { ok: true };
};

export const createCheckout = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  planTier: Exclude<PlanTier, "free" | "enterprise">;
  seats?: number;
  successUrl?: string;
  cancelUrl?: string;
}) => {
  const env = getEnv();
  const clientUrl = env.CLIENT_URL.replace(/\/$/, "");

  if (env.BILLING_PROVIDER === "stub") {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await setOrgPlan({
      orgId: params.orgId,
      userId: params.userId,
      provider: "stub",
      planTier: params.planTier,
      status: "active",
      seats: params.seats,
      currentPeriodStart: now,
      currentPeriodEnd: end,
    });

    return {
      provider: "stub" as const,
      checkout_url: `${clientUrl}/chat`,
      activated: true,
    };
  }

  const stripe = getStripe();
  const priceId =
    params.planTier === "pro" ? env.STRIPE_PRICE_PRO_MONTHLY : env.STRIPE_PRICE_TEAM_SEAT;
  if (!priceId) {
    throw new Error(`Missing Stripe price id for plan: ${params.planTier}`);
  }

  const billingAccount =
    (await BillingAccountModel.findOne({ orgId: params.orgId }).lean()) ||
    (await BillingAccountModel.create({ orgId: params.orgId, provider: "stripe", status: "active" }).then((doc) =>
      doc.toObject()
    ));

  let customerId = (billingAccount as any).stripeCustomerId as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: {
        org_id: params.orgId.toString(),
        created_by_user_id: params.userId.toString(),
      },
    });
    customerId = customer.id;
    await BillingAccountModel.updateOne(
      { orgId: params.orgId },
      { $set: { provider: "stripe", status: "active", stripeCustomerId: customerId } }
    );
  }

  const successUrl =
    params.successUrl ||
    `${clientUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = params.cancelUrl || `${clientUrl}/billing/cancel`;

  const quantity = params.planTier === "team" ? Math.max(1, Number(params.seats || 1)) : 1;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: params.orgId.toString(),
    line_items: [{ price: priceId, quantity }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      org_id: params.orgId.toString(),
      plan_tier: params.planTier,
      created_by_user_id: params.userId.toString(),
    },
    subscription_data: {
      metadata: {
        org_id: params.orgId.toString(),
        plan_tier: params.planTier,
        created_by_user_id: params.userId.toString(),
      },
    },
  });

  return {
    provider: "stripe" as const,
    checkout_url: session.url,
    activated: false,
    session_id: session.id,
  };
};

export const createPortal = async (params: { orgId: mongoose.Types.ObjectId; returnUrl?: string }) => {
  const env = getEnv();
  const clientUrl = env.CLIENT_URL.replace(/\/$/, "");

  if (env.BILLING_PROVIDER === "stub") {
    return {
      provider: "stub" as const,
      portal_url: `${clientUrl}/chat`,
    };
  }

  const stripe = getStripe();
  const billingAccount = await BillingAccountModel.findOne({ orgId: params.orgId }).lean();
  const customerId = billingAccount?.stripeCustomerId;
  if (!customerId) {
    throw new Error("Billing customer not found for org.");
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: params.returnUrl || clientUrl,
  });

  return {
    provider: "stripe" as const,
    portal_url: portal.url,
  };
};

export const handleStripeWebhook = async (params: { rawBody: Buffer; signature: string }) => {
  const env = getEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required to process Stripe webhooks.");
  }

  const stripe = getStripe();
  const event = stripe.webhooks.constructEvent(params.rawBody, params.signature, env.STRIPE_WEBHOOK_SECRET);

  const syncSubscription = async (subscription: Stripe.Subscription) => {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    const billingAccount = customerId
      ? await BillingAccountModel.findOne({ stripeCustomerId: customerId }).lean()
      : null;

    const orgIdStr =
      (subscription.metadata && subscription.metadata.org_id) ||
      (billingAccount as any)?.orgId?.toString() ||
      "";
    if (!orgIdStr || !mongoose.Types.ObjectId.isValid(orgIdStr)) {
      return { ok: false, reason: "org_id_missing" };
    }

    const orgId = new mongoose.Types.ObjectId(orgIdStr);
    const status = toEntitlementStatus(subscription.status);
    const priceId = subscription.items?.data?.[0]?.price?.id || null;
    const planTier = resolvePlanTierFromPrice(priceId);
    const seats = subscription.items?.data?.[0]?.quantity || undefined;

    const currentPeriodStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : undefined;
    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : undefined;

    const userIdStr = (subscription.metadata && subscription.metadata.created_by_user_id) || "";
    const userIdFromMetadata = mongoose.Types.ObjectId.isValid(userIdStr)
      ? new mongoose.Types.ObjectId(userIdStr)
      : null;
    const userId =
      userIdFromMetadata ||
      (await OrgMemberModel.findOne({ orgId, status: "active", role: "owner" })
        .select({ userId: 1 })
        .lean()
        .then((member) => (member?.userId ? (member.userId as unknown as mongoose.Types.ObjectId) : null))) ||
      (await OrgMemberModel.findOne({ orgId, status: "active" })
        .select({ userId: 1 })
        .lean()
        .then((member) => (member?.userId ? (member.userId as unknown as mongoose.Types.ObjectId) : null))) ||
      new mongoose.Types.ObjectId();

    await setOrgPlan({
      orgId,
      userId,
      provider: "stripe",
      planTier,
      status,
      seats,
      stripeCustomerId: customerId || undefined,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId || undefined,
      currentPeriodStart,
      currentPeriodEnd,
    });

    return { ok: true };
  };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(subscription);
    }
    return { received: true };
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await syncSubscription(subscription);
    return { received: true };
  }

  return { received: true };
};

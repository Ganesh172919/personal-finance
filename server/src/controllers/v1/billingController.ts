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
import PDFDocument from "pdfkit";

import type { IUserDocument } from "../../models/userModel";
import InvoiceModel from "../../models/invoiceModel";
import { HttpError } from "../../middleware/httpError";
import { createCheckout, createPortal, handleStripeWebhook } from "../../services/billing";
import { getEnv } from "../../config/env";
import { convertUsdToCurrency, formatBillingCurrency, normalizeCurrency } from "../../utils/currencyFx";
import { getDunningState, simulatePaymentFailure, triggerPaymentRetry } from "../../services/dunningService";

// Defines available on-demand credit bundles for metered AI and simulation quotas.
// Maps bundle identifiers to unit pricing, feature allocations, and descriptions.
// Supplies product parameters for credit purchasing workflows and plan upgrades.
export const CREDIT_PACK_DEFINITIONS = {
  ai_pack_250: {
    id: "ai_pack_250",
    name: "AI Power Pack",
    description: "250 on-demand AI intelligence calls",
    price_usd: 5,
    credits: { monthly_ai_calls: 250 },
  },
  ocr_pack_100: {
    id: "ocr_pack_100",
    name: "OCR Document Pack",
    description: "100 receipt & invoice OCR scans",
    price_usd: 4,
    credits: { ocr_quota: 100 },
  },
  scenarios_pack_100: {
    id: "scenarios_pack_100",
    name: "Simulation Pack",
    description: "100 What-If scenario simulations",
    price_usd: 3,
    credits: { scenario_depth: 100 },
  },
  flex_bundle: {
    id: "flex_bundle",
    name: "All-in-One Flex Bundle",
    description: "500 AI calls + 200 OCR scans + 200 simulations",
    price_usd: 10,
    credits: { monthly_ai_calls: 500, ocr_quota: 200, scenario_depth: 200 },
  },
} as const;

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

// Validates that the requesting caller holds administrative status for billing actions.
// Enforces tenant membership checks and verifies role hierarchy qualifications.
// Throws an unauthorized or access denied exception when credentials fail checks.
const requireOrgAdmin = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  if (roleRank[req.org.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

// Initiates a Stripe checkout session for subscription tier upgrade or purchase.
// Validates plan tier parameters, billing cycles, and seat capacity allocations.
// Returns checkout redirection URLs and session IDs for the frontend application.
export const createCheckoutSession = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgAdmin(req);

  const body = req.body as {
    plan_tier: "pro" | "team";
    billing_cycle?: "monthly" | "annual";
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
    billingCycle: body.billing_cycle,
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

// Generates a customer billing portal URL for self-service subscription management.
// Directs administrative users to Stripe-hosted portal interfaces to manage payment cards.
// Returns the single-use customer portal access URL accompanied by request tracking.
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

// Ingests cryptographically signed webhook notifications dispatched by Stripe.
// Verifies request signature headers against raw payload bytes to ensure authenticity.
// Dispatches events to underlying billing handlers to update subscription records.
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

// Credit packs must not be granted before a verified, idempotent payment event.
// No credit-pack checkout/webhook implementation exists yet, so fail closed.
export const purchaseCreditPack = async (req: Request, _res: Response) => {
  requireOrgAdmin(req);
  const body = req.body as { pack_id: keyof typeof CREDIT_PACK_DEFINITIONS };
  if (!CREDIT_PACK_DEFINITIONS[body.pack_id]) {
    throw new HttpError(400, "INVALID_PACK", "Invalid credit pack ID");
  }
  throw new HttpError(503, "CREDIT_PACKS_UNAVAILABLE", "Credit pack purchases are not available");
};

// Queries historical billing invoices and payment receipts for the organization.
// Extracts line item breakdowns, localized currency conversions, and payment statuses.
// Delivers a chronological collection of invoice records for financial accounting.
export const listInvoices = async (req: Request, res: Response) => {
  if (!req.org?.orgId) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  const orgId = new mongoose.Types.ObjectId(req.org.orgId);
  const targetCurrency = normalizeCurrency((req.query.currency as string) || (req.org as any)?.currency || "USD");

  // A read must never fabricate a paid invoice. Legacy/test records have no
  // verified Stripe provenance and must not be presented as receipts in prod.
  const filter = getEnv().NODE_ENV === "production"
    ? { orgId, "metadata.payment_verified": true, "metadata.stripe_invoice_id": { $exists: true } }
    : { orgId };
  const invoices = await InvoiceModel.find(filter).sort({ issuedAt: -1 }).lean();

  return res.json({
    currency: targetCurrency,
    invoices: invoices.map((inv) => {
      const totalLocalized = inv.totalLocalized ?? convertUsdToCurrency(inv.totalUsd, targetCurrency);
      const amountLocalized = inv.amountLocalized ?? convertUsdToCurrency(inv.amountUsd, targetCurrency);
      const taxLocalized = inv.taxLocalized ?? convertUsdToCurrency(inv.taxUsd, targetCurrency);
      return {
        id: String(inv._id),
        invoice_number: inv.invoiceNumber,
        plan_tier: inv.planTier,
        billing_cycle: inv.billingCycle,
        amount_usd: inv.amountUsd,
        tax_usd: inv.taxUsd,
        total_usd: inv.totalUsd,
        currency: targetCurrency,
        amount_localized: amountLocalized,
        tax_localized: taxLocalized,
        total_localized: totalLocalized,
        formatted_total: formatBillingCurrency(inv.totalUsd, targetCurrency),
        status: inv.status,
        payment_method: inv.paymentMethod,
        period_start: inv.periodStart,
        period_end: inv.periodEnd,
        issued_at: inv.issuedAt,
      };
    }),
    request_id: req.requestId,
  });
};

// Renders and streams formatted PDF invoices for organization billing records.
// Populates itemized charges, tenant organization details, and currency symbols.
// Pipes the dynamically generated binary PDF directly to the client HTTP stream.
export const downloadInvoicePdf = async (req: Request, res: Response) => {
  if (!req.org?.orgId) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  const orgId = new mongoose.Types.ObjectId(req.org.orgId);
  const { id } = req.params;

  const invoice = await InvoiceModel.findOne({ _id: id, orgId }).lean();
  if (!invoice || (getEnv().NODE_ENV === "production" &&
    !(invoice.metadata?.payment_verified === true && typeof invoice.metadata?.stripe_invoice_id === "string"))) {
    throw new HttpError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  }

  const verified = invoice.metadata?.payment_verified === true;
  const invoiceCurrency = normalizeCurrency(invoice.currency || "USD");
  const formattedSubtotal = formatBillingCurrency(invoice.amountUsd, invoiceCurrency);
  const formattedTax = formatBillingCurrency(invoice.taxUsd, invoiceCurrency);
  const formattedTotal = formatBillingCurrency(invoice.totalUsd, invoiceCurrency);

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="finwise-invoice-${invoice.invoiceNumber}.pdf"`);

  doc.pipe(res);

  // Document Styling & Content
  doc.fontSize(22).fillColor("#0f172a").text("FinWise billing", 50, 50);
  doc.fontSize(10).fillColor("#64748b").text("Subscription record", 50, 78);

  doc.fontSize(14).fillColor("#0284c7").text(
    verified ? "PAYMENT RECORD" : "TEST RECORD - NOT PROOF OF PAYMENT", 260, 50, { align: "right" }
  );
  doc.fontSize(10).fillColor("#64748b").text(`Invoice #: ${invoice.invoiceNumber}`, 320, 78, { align: "right" });
  doc.text(`Date of Issue: ${new Date(invoice.issuedAt).toLocaleDateString()}`, 320, 92, { align: "right" });

  doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(50, 120).lineTo(545, 120).stroke();

  // Billed To & Coverage Details
  doc.fontSize(11).fillColor("#0f172a").text("Billed To:", 50, 135);
  doc.fontSize(10).fillColor("#334155").text(`Organization ID: ${invoice.orgId.toString()}`, 50, 150);
  doc.text(`Payment Method: ${invoice.paymentMethod}`, 50, 165);
  doc.text(`Status: ${verified ? invoice.status.toUpperCase() : "UNVERIFIED TEST RECORD"}`, 50, 180);

  doc.fontSize(11).fillColor("#0f172a").text("Coverage Period:", 320, 135, { align: "right" });
  doc.fontSize(10).fillColor("#334155").text(
    `${new Date(invoice.periodStart).toLocaleDateString()} — ${new Date(invoice.periodEnd).toLocaleDateString()}`,
    320,
    150,
    { align: "right" }
  );
  doc.text(`Billing Cycle: ${invoice.billingCycle.toUpperCase()}`, 320, 165, { align: "right" });

  // Line Items Table Header
  const tableTop = 215;
  doc.rect(50, tableTop, 495, 24).fill("#f8fafc");
  doc.fontSize(10).fillColor("#475569").text("Description", 60, tableTop + 7);
  doc.text("Cycle", 280, tableTop + 7);
  doc.text("Qty", 360, tableTop + 7, { align: "center", width: 40 });
  doc.text(`Amount (${invoiceCurrency})`, 420, tableTop + 7, { align: "right", width: 115 });

  // Line item row
  const rowTop = tableTop + 32;
  const planName = invoice.planTier.toUpperCase();
  doc.fontSize(10).fillColor("#0f172a").text(`FinWise ${planName} Subscription Plan`, 60, rowTop);
  doc.fontSize(9).fillColor("#64748b").text(`Unlimited AI copilot, reporting and automated insights`, 60, rowTop + 14);
  doc.fontSize(10).fillColor("#334155").text(invoice.billingCycle, 280, rowTop);
  doc.text("1", 360, rowTop, { align: "center", width: 40 });
  doc.text(formattedSubtotal, 420, rowTop, { align: "right", width: 115 });

  doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(50, rowTop + 35).lineTo(545, rowTop + 35).stroke();

  // Summary Totals
  const totalsTop = rowTop + 50;
  doc.fontSize(10).fillColor("#64748b").text("Subtotal:", 350, totalsTop);
  doc.fillColor("#0f172a").text(formattedSubtotal, 450, totalsTop, { align: "right", width: 85 });

  doc.fillColor("#64748b").text("Recorded tax:", 350, totalsTop + 16);
  doc.fillColor("#0f172a").text(formattedTax, 450, totalsTop + 16, { align: "right", width: 85 });

  doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(350, totalsTop + 34).lineTo(545, totalsTop + 34).stroke();

  doc.fontSize(12).fillColor("#0f172a").text("Recorded total:", 350, totalsTop + 42);
  doc.fontSize(12).fillColor("#16a34a").text(`${formattedTotal} ${invoiceCurrency}`, 450, totalsTop + 42, { align: "right", width: 85 });

  // Footer
  doc.fontSize(9).fillColor("#94a3b8").text(
    verified ? "Payment status reflects the recorded provider event; contact support for billing questions." :
      "Test record only. No payment was collected and this is not a tax invoice or receipt.",
    50,
    700,
    { align: "center", width: 495 }
  );

  doc.end();
};

// Inspects delinquency status, past-due invoices, and retry attempts for accounts.
// Evaluates active dunning state to notify administrators of pending account lockouts.
// Delivers payment recovery schedules and outstanding debt balances for the tenant.
export const getDunningStatus = async (req: Request, res: Response) => {
  if (!req.org?.orgId) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  const orgId = new mongoose.Types.ObjectId(req.org.orgId);
  const state = await getDunningState(orgId);
  return res.json({
    dunning: state,
    request_id: req.requestId,
  });
};

// Triggers an immediate payment collection retry attempt against failed invoices.
// Interfaces with dunning recovery mechanisms to attempt processing delinquent dues.
// Returns the real-time outcome of the automated payment collection operation.
export const retryDunningPayment = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgAdmin(req);
  const result = await triggerPaymentRetry(orgId, user._id);
  return res.json({
    ...result,
    request_id: req.requestId,
  });
};

// Simulates a failed invoice payment event to test automated dunning recovery workflows.
// Triggers retry schedule increments, administrative alerts, and warning states.
// Provides a testing mechanism to verify payment recovery lifecycle behaviors safely.
export const simulateDunningPaymentFailure = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = requireOrgAdmin(req);
  const reason = (req.body as any)?.reason || "card_declined";
  const state = await simulatePaymentFailure(orgId, user._id, reason);
  return res.json({
    simulated: true,
    dunning: state,
    request_id: req.requestId,
  });
};


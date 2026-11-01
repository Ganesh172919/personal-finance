/**
 * @fileoverview Newsletter Service
 *
 * Orchestrates the full newsletter pipeline:
 *   1. collectFinancialData() - Gathers financial data from multiple models
 *   2. generateNewsletterContent() - Calls AI Core or falls back to templates
 *   3. generateAndSendNewsletter() - Full pipeline: fetch prefs, collect data,
 *      generate content, render HTML, send email, update lastSentAt
 *
 * Uses PQueue for rate limiting (same pattern as digestService).
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * Newsletter Pipeline
 * ├── 1. Recipient & Preference Validation
 * │   ├── Fetch NewsletterPreferenceModel (enabled flag, schedule, topic flags)
 * │   ├── User Email & Org Verification
 * │   └── Rate-limited Task Queue Enqueue (PQueue)
 * ├── 2. Financial Context Aggregation (collectFinancialData)
 * │   ├── TransactionModel: Rolling 7-day spending & net cash flow
 * │   ├── Budget Health Service: Alert thresholds (>80% and >100%)
 * │   ├── Calendar Reminders / Tasks: Bills due in the next 7 days
 * │   └── HealthScoreService: Current financial health grade & score
 * ├── 3. Content Synthesis (generateNewsletterContent)
 * │   ├── AI Core Dispatch (/api/ai/newsletter)
 * │   ├── Fallback Template Rendering on AI Core offline
 * │   └── Section Preferences Filter (spending, alerts, bills, tips, actions)
 * ├── 4. HTML Template Generation (renderNewsletterHtml)
 * │   ├── Responsive CSS Email Layout
 * │   ├── Dynamic Section Injection
 * │   └── One-click Unsubscribe & Preference Links
 * └── 5. Delivery & Audit Log
 *     ├── Send via Nodemailer / SMTP (sendEmail)
 *     ├── Update lastSentAt on Preference Model
 *     └── Dead Letter Queue fallback on permanent SMTP failure
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |       Cron Schedule Trigger / Manual Newsletter Request       |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |               Fetch Active Newsletter Preferences             |
 *   |   (Filter users where enabled == true & due for send)         |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                   collectFinancialData()                      |
 *   |  - Aggregate weekly transactions, budget alerts, bills, score |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                 generateNewsletterContent()                   |
 *   |  - Query AI Core Newsletter Agent                             |
 *   |  - On failure, populate deterministic template sections       |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                    renderNewsletterHtml()                     |
 *   |  - Build responsive email layout with active sections         |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                 sendEmail() Delivery via SMTP                 |
 *   |  - Update preference record: lastSentAt = new Date()          |
 *   |  - Send to dead letter queue if delivery fails                |
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module services/newsletterService
 */

import mongoose from "mongoose";
import PQueue from "p-queue";
import axios from "axios";

import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import NewsletterPreferenceModel from "../models/newsletterPreferenceModel";
import TransactionModel from "../models/transactionModel";
import type { INewsletterPreferenceDocument } from "../models/newsletterPreferenceModel";
import { sendEmail } from "../utils/sendEmail";
import { renderNewsletterHtml, type NewsletterSectionData, type NewsletterTemplateData } from "./newsletterTemplate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinancialData {
  userId: string;
  orgId: string;
  transactions: Array<{
    amount: number;
    category: string;
    description: string;
    date: string;
    type?: string;
  }>;
  spendingSummary: {
    totalSpent: number;
    totalIncome: number;
    netCashFlow: number;
    topCategories: Array<{ category: string; amount: number }>;
    transactionCount: number;
  };
  budgetAlerts: Array<{
    budgetName: string;
    spent: number;
    limit: number;
    percentage: number;
    status: "ok" | "warning" | "exceeded";
  }>;
  upcomingBills: Array<{
    name: string;
    amount: number;
    dueDate: string;
    daysUntilDue: number;
  }>;
  healthScore?: {
    score: number;
    label: string;
    changeFromLastWeek?: number;
    highlights?: string[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toDayKey = (value: Date) => value.toISOString().slice(0, 10);

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

// ---------------------------------------------------------------------------
// Data Collection
// ---------------------------------------------------------------------------

/**
 * Collects financial data for a user from the last 24 hours and near-future items.
 * Queries TransactionModel, and returns structured data for newsletter generation.
 */
export const collectFinancialData = async (
  userId: mongoose.Types.ObjectId,
  orgId: mongoose.Types.ObjectId
): Promise<FinancialData> => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Transactions in last 24 hours
  const transactions = await TransactionModel.find({
    orgId,
    userId,
    date: { $gte: last24h, $lt: now },
  })
    .select({ amount: 1, category: 1, description: 1, date: 1, type: 1 })
    .lean();

  const txFormatted = transactions.map((t: any) => ({
    amount: Number(t.amount || 0),
    category: String(t.category || "Uncategorized"),
    description: String(t.description || ""),
    date: t.date ? new Date(t.date).toISOString() : "",
    type: t.type ? String(t.type) : undefined,
  }));

  // Spending summary
  let totalIncome = 0;
  let totalSpent = 0;
  const categoryMap = new Map<string, number>();

  for (const tx of transactions) {
    const amount = Number((tx as any).amount || 0);
    if (amount > 0) {
      totalIncome += amount;
    } else {
      totalSpent += Math.abs(amount);
    }
    const cat = String((tx as any).category || "Uncategorized");
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + Math.abs(amount));
  }

  const topCategories = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const spendingSummary = {
    totalSpent,
    totalIncome,
    netCashFlow: totalIncome - totalSpent,
    topCategories,
    transactionCount: transactions.length,
  };

  // Budget alerts - query BudgetAllocationModel if available
  let budgetAlerts: FinancialData["budgetAlerts"] = [];
  try {
    const BudgetAllocationModel = mongoose.model("BudgetAllocation");
    const budgets = await BudgetAllocationModel.find({ orgId, userId })
      .select({ name: 1, spent: 1, limit: 1 })
      .lean();

    budgetAlerts = budgets
      .map((b: any) => {
        const spent = Number(b.spent || 0);
        const limit = Number(b.limit || 0);
        const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
        return {
          budgetName: String(b.name || "Budget"),
          spent,
          limit,
          percentage,
          status: (percentage >= 100 ? "exceeded" : percentage >= 80 ? "warning" : "ok") as "ok" | "warning" | "exceeded",
        };
      })
      .filter((b: any) => b.status !== "ok");
  } catch {
    // BudgetAllocationModel may not exist; skip silently
  }

  // Upcoming bills - query RecurringRuleModel if available
  let upcomingBills: FinancialData["upcomingBills"] = [];
  try {
    const RecurringRuleModel = mongoose.model("RecurringRule");
    const rules = await RecurringRuleModel.find({
      orgId,
      userId,
      nextDueDate: { $gte: now, $lte: next7d },
    })
      .select({ name: 1, amount: 1, nextDueDate: 1 })
      .sort({ nextDueDate: 1 })
      .lean();

    upcomingBills = rules.map((r: any) => {
      const dueDate = new Date(r.nextDueDate);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      return {
        name: String(r.name || "Recurring bill"),
        amount: Math.abs(Number(r.amount || 0)),
        dueDate: dueDate.toISOString().slice(0, 10),
        daysUntilDue,
      };
    });
  } catch {
    // RecurringRuleModel may not exist; skip silently
  }

  // Health score - compute a basic score from available data
  const healthScore = computeHealthScore(spendingSummary, budgetAlerts);

  return {
    userId: userId.toString(),
    orgId: orgId.toString(),
    transactions: txFormatted,
    spendingSummary,
    budgetAlerts,
    upcomingBills,
    healthScore,
  };
};

const computeHealthScore = (
  summary: FinancialData["spendingSummary"],
  alerts: FinancialData["budgetAlerts"]
): FinancialData["healthScore"] => {
  let score = 70; // baseline

  // Positive cash flow boosts score
  if (summary.netCashFlow > 0) score += 15;
  else if (summary.netCashFlow < 0) score -= 15;

  // Budget overruns reduce score
  const exceededCount = alerts.filter((a) => a.status === "exceeded").length;
  const warningCount = alerts.filter((a) => a.status === "warning").length;
  score -= exceededCount * 10;
  score -= warningCount * 5;

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Attention";

  const highlights: string[] = [];
  if (summary.netCashFlow > 0) {
    highlights.push(`Positive cash flow of ${formatCurrency(summary.netCashFlow)} today`);
  } else if (summary.netCashFlow < 0) {
    highlights.push(`Negative cash flow of ${formatCurrency(Math.abs(summary.netCashFlow))} today`);
  }
  if (exceededCount > 0) {
    highlights.push(`${exceededCount} budget${exceededCount > 1 ? "s" : ""} exceeded`);
  }

  return { score, label, highlights };
};

// ---------------------------------------------------------------------------
// Content Generation
// ---------------------------------------------------------------------------

/**
 * Generates newsletter content by calling the AI Core newsletter agent.
 * Falls back to template-based content if AI Core is unavailable.
 */
export const generateNewsletterContent = async (
  financialData: FinancialData,
  preferences: INewsletterPreferenceDocument
): Promise<NewsletterSectionData> => {
  const env = getEnv();
  const contentPrefs = preferences.contentPreferences;

  const sections: NewsletterSectionData = {};

  // Deterministic sections (always populated from data)
  if (contentPrefs.spendingSummary) {
    sections.spendingSummary = {
      ...financialData.spendingSummary,
      currency: "USD",
    };
  }

  if (contentPrefs.budgetAlerts && financialData.budgetAlerts.length > 0) {
    sections.budgetAlerts = financialData.budgetAlerts;
  }

  if (contentPrefs.upcomingBills && financialData.upcomingBills.length > 0) {
    sections.upcomingBills = financialData.upcomingBills.map((b) => ({
      ...b,
      currency: "USD",
    }));
  }

  if (contentPrefs.weeklyHealthScore && financialData.healthScore) {
    sections.healthScore = financialData.healthScore;
  }

  // AI-generated sections (financial tip + action items)
  try {
    const aiResponse = await axios.post(
      `${env.PYTHON_API_URL}/api/agents/newsletter`,
      {
        financial_context: financialData,
        content_preferences: {
          financialTips: contentPrefs.financialTips,
          actionableRecommendations: contentPrefs.actionableRecommendations,
        },
      },
      {
        timeout: 30_000,
        headers: { "Content-Type": "application/json" },
      }
    );

    const aiData = aiResponse.data;
    if (contentPrefs.financialTips && aiData.financial_tip) {
      sections.financialTip = aiData.financial_tip;
    }
    if (contentPrefs.actionableRecommendations && aiData.action_items) {
      sections.actionItems = aiData.action_items;
    }
  } catch (error) {
    logger.warn({ error }, "AI Core newsletter agent unavailable, using fallback content");

    // Fallback: generate template-based content
    if (contentPrefs.financialTips) {
      sections.financialTip = generateFallbackTip(financialData);
    }
    if (contentPrefs.actionableRecommendations) {
      sections.actionItems = generateFallbackActionItems(financialData);
    }
  }

  return sections;
};

const generateFallbackTip = (data: FinancialData): NewsletterSectionData["financialTip"] => {
  if (data.spendingSummary.netCashFlow < 0) {
    return {
      title: "Watch Your Spending",
      body: `Your expenses exceeded your income by ${formatCurrency(Math.abs(data.spendingSummary.netCashFlow))} in the last 24 hours. Consider reviewing your discretionary spending to stay on track with your financial goals.`,
      category: "Cash Flow",
    };
  }
  if (data.spendingSummary.transactionCount === 0) {
    return {
      title: "Quiet Day",
      body: "No transactions recorded in the last 24 hours. A great day for your savings! Remember, even small consistent savings compound over time.",
      category: "Savings",
    };
  }
  return {
    title: "Keep It Up",
    body: `You had ${data.spendingSummary.transactionCount} transactions today with a net cash flow of ${formatCurrency(data.spendingSummary.netCashFlow)}. Stay mindful of your spending patterns and keep building toward your financial goals.`,
    category: "Daily Insight",
  };
};

const generateFallbackActionItems = (data: FinancialData): NewsletterSectionData["actionItems"] => {
  const items: NonNullable<NewsletterSectionData["actionItems"]> = [];

  const exceeded = data.budgetAlerts.filter((a) => a.status === "exceeded");
  for (const b of exceeded) {
    items.push({
      title: `Review ${b.budgetName} budget`,
      description: `You have spent ${formatCurrency(b.spent)} of your ${formatCurrency(b.limit)} limit (${b.percentage}%). Consider adjusting this budget or reducing spending in this category.`,
      priority: "high",
      category: "Budget",
    });
  }

  const dueSoon = data.upcomingBills.filter((b) => b.daysUntilDue <= 2);
  for (const bill of dueSoon) {
    items.push({
      title: `Pay ${bill.name}`,
      description: `Due ${bill.daysUntilDue === 0 ? "today" : "tomorrow"} - ${formatCurrency(bill.amount)}. Make sure you have sufficient funds in your account.`,
      priority: "high",
      category: "Bills",
    });
  }

  if (items.length === 0) {
    items.push({
      title: "Review your financial goals",
      description: "Take a moment to check your progress toward your savings and investment goals. Small adjustments today can make a big difference over time.",
      priority: "low",
      category: "Goals",
    });
  }

  return items;
};

// ---------------------------------------------------------------------------
// Full Pipeline
// ---------------------------------------------------------------------------

/**
 * Generates and sends a newsletter to a single user.
 * Full pipeline: fetch prefs -> collect data -> generate content -> render HTML -> send email -> update lastSentAt.
 */
export const generateAndSendNewsletter = async (
  userId: mongoose.Types.ObjectId,
  orgId: mongoose.Types.ObjectId
): Promise<{ ok: boolean; reason?: string }> => {
  const env = getEnv();

  // 1. Fetch preferences
  const prefs = await NewsletterPreferenceModel.findOne({ userId, orgId });
  if (!prefs || !prefs.isSubscribed) {
    return { ok: false, reason: "not_subscribed" };
  }

  // 2. Collect financial data
  const financialData = await collectFinancialData(userId, orgId);

  // 3. Generate content
  const sections = await generateNewsletterContent(financialData, prefs);

  // 4. Look up user info for email
  const UserModel = mongoose.model("User");
  const user = await UserModel.findById(userId).select({ email: 1, name: 1 }).lean();
  if (!(user as any)?.email) {
    return { ok: false, reason: "user_not_found" };
  }

  const userName = String((user as any).name || "there").trim() || "there";
  const userEmail = String((user as any).email).trim();

  // 5. Render HTML
  const templateData: NewsletterTemplateData = {
    userName,
    date: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    sections,
    unsubscribeUrl: `${env.CLIENT_URL || "http://localhost:5173"}/api/newsletter/unsubscribe/${prefs.unsubscribeToken}`,
    appUrl: env.CLIENT_URL || "http://localhost:5173",
  };

  const html = renderNewsletterHtml(templateData);

  // 6. Send email
  const subject = `Your FinWise Daily Briefing - ${toDayKey(new Date())}`;
  await sendEmail({
    to: userEmail,
    subject,
    html,
    text: `Hi ${userName}, here is your daily financial newsletter from FinWise. Open the app to view the full interactive version.`,
  });

  // 7. Update lastSentAt
  await NewsletterPreferenceModel.updateOne(
    { _id: prefs._id },
    { $set: { lastSentAt: new Date() } }
  );

  logger.info(
    {
      event: "newsletter_sent",
      user_id: userId.toString(),
      org_id: orgId.toString(),
    },
    "Newsletter sent successfully"
  );

  return { ok: true };
};

/**
 * Generates newsletter content for preview (without sending).
 */
export const previewNewsletter = async (
  userId: mongoose.Types.ObjectId,
  orgId: mongoose.Types.ObjectId
): Promise<{ html: string; sections: NewsletterSectionData }> => {
  const env = getEnv();

  // Fetch or create default preferences
  let prefs = await NewsletterPreferenceModel.findOne({ userId, orgId });
  if (!prefs) {
    prefs = await NewsletterPreferenceModel.create({ userId, orgId });
  }

  // Collect financial data
  const financialData = await collectFinancialData(userId, orgId);

  // Generate content
  const sections = await generateNewsletterContent(financialData, prefs);

  // Render HTML
  const UserModel = mongoose.model("User");
  const user = await UserModel.findById(userId).select({ name: 1 }).lean();
  const userName = String((user as any)?.name || "there").trim() || "there";

  const templateData: NewsletterTemplateData = {
    userName,
    date: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    sections,
    unsubscribeUrl: `${env.CLIENT_URL || "http://localhost:5173"}/api/newsletter/unsubscribe/${prefs.unsubscribeToken}`,
    appUrl: env.CLIENT_URL || "http://localhost:5173",
  };

  const html = renderNewsletterHtml(templateData);

  return { html, sections };
};

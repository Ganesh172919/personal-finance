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

import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import { processAiCoreNewsletter } from "./aiCoreClient";
import NewsletterPreferenceModel from "../models/newsletterPreferenceModel";
import TransactionModel from "../models/transactionModel";
import type { INewsletterPreferenceDocument } from "../models/newsletterPreferenceModel";
import { sendEmail } from "../utils/sendEmail";
import { renderNewsletterHtml, type NewsletterSectionData, type NewsletterTemplateData, type HealthPillarData, type DailySpendTrendItem } from "./newsletterTemplate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Intermediate data structure aggregating recent financial activity for a user.
// Contains transaction records, spending summaries, budget alerts, and health scores.
// Supplies complete personal context to newsletter generation and AI prompting.
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
    topCategories: Array<{ category: string; amount: number; percentage?: number }>;
    transactionCount: number;
    dailyTrend?: DailySpendTrendItem[];
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
    pillars?: HealthPillarData[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Converts a Date instance into an ISO date string format (YYYY-MM-DD).
// Extracts calendar date components for daily bucket categorization.
// Used as key identifiers when grouping transaction spending by day.
const toDayKey = (value: Date) => value.toISOString().slice(0, 10);

// Formats numeric currency amounts into standardized US Dollar representations.
// Uses Intl.NumberFormat to render localized currency symbols and separators.
// Ensures consistent currency display across synthesized newsletter sections.
const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

// ---------------------------------------------------------------------------
// Data Collection
// ---------------------------------------------------------------------------

/**
 * Collects financial data for a user from the last 24 hours and near-future items.
 * Queries TransactionModel, and returns structured data for newsletter generation.
 */
// Collects multi-dimensional financial context spanning transactions, alerts, and bills.
// Calculates 7-day rolling spending trends, top expense categories, and cash flow.
// Synthesizes raw database records into structured financial inputs for newsletters.
export const collectFinancialData = async (
  userId: mongoose.Types.ObjectId,
  orgId: mongoose.Types.ObjectId
): Promise<FinancialData> => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
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

  // Transactions in rolling 7 days for trend velocity chart
  const rolling7dTransactions = await TransactionModel.find({
    orgId,
    userId,
    date: { $gte: last7d, $lte: now },
  })
    .select({ amount: 1, date: 1 })
    .lean();

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
      const cat = String((tx as any).category || "Uncategorized");
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + Math.abs(amount));
    }
  }

  // Top categories with percentage share
  const topCategories = Array.from(categoryMap.entries())
    .map(([category, amount]) => {
      const percentage = totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0;
      return { category, amount, percentage };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // 7-day daily spend trend
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dailySpendMap = new Map<string, number>();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = toDayKey(d);
    dailySpendMap.set(key, 0);
  }

  for (const tx of rolling7dTransactions) {
    const amount = Number((tx as any).amount || 0);
    if (amount < 0 && (tx as any).date) {
      const key = toDayKey(new Date((tx as any).date));
      if (dailySpendMap.has(key)) {
        dailySpendMap.set(key, (dailySpendMap.get(key) || 0) + Math.abs(amount));
      }
    }
  }

  const dailyTrend: DailySpendTrendItem[] = Array.from(dailySpendMap.entries()).map(([dateStr, amount], idx) => {
    const d = new Date(dateStr + "T00:00:00Z");
    const day = weekdays[d.getUTCDay()];
    return {
      date: dateStr,
      day,
      amount: Math.round(amount * 100) / 100,
      isToday: idx === 6,
    };
  });

  const spendingSummary = {
    totalSpent,
    totalIncome,
    netCashFlow: totalIncome - totalSpent,
    topCategories,
    transactionCount: transactions.length,
    dailyTrend,
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

// Evaluates personal financial wellness across four distinct financial pillars.
// Assesses cash flow, budget adherence, spending volatility, and savings rates.
// Calculates consolidated health scores and generates actionable highlights.
const computeHealthScore = (
  summary: FinancialData["spendingSummary"],
  alerts: FinancialData["budgetAlerts"]
): FinancialData["healthScore"] => {
  // 1. Cashflow Health pillar (max 25)
  let cashflowScore = 18;
  if (summary.netCashFlow > 0) cashflowScore = 25;
  else if (summary.netCashFlow < -500) cashflowScore = 10;
  else if (summary.netCashFlow < 0) cashflowScore = 14;

  const cashflowStatus: "good" | "fair" | "poor" =
    cashflowScore >= 20 ? "good" : cashflowScore >= 14 ? "fair" : "poor";

  // 2. Budget Discipline pillar (max 25)
  const exceededCount = alerts.filter((a) => a.status === "exceeded").length;
  const warningCount = alerts.filter((a) => a.status === "warning").length;
  let budgetScore = 25;
  if (exceededCount > 0) budgetScore = Math.max(5, 25 - exceededCount * 8);
  else if (warningCount > 0) budgetScore = Math.max(12, 25 - warningCount * 4);

  const budgetStatus: "good" | "fair" | "poor" =
    budgetScore >= 20 ? "good" : budgetScore >= 14 ? "fair" : "poor";

  // 3. Spending Stability pillar (max 25)
  const dailyAmounts = (summary.dailyTrend || []).map((d) => d.amount);
  const avgDaily = dailyAmounts.length > 0 ? dailyAmounts.reduce((a, b) => a + b, 0) / dailyAmounts.length : 0;
  const maxDaily = dailyAmounts.length > 0 ? Math.max(...dailyAmounts) : 0;
  let stabilityScore = 22;
  if (avgDaily > 0 && maxDaily > avgDaily * 3) stabilityScore = 14;
  else if (avgDaily === 0) stabilityScore = 20;

  const stabilityStatus: "good" | "fair" | "poor" =
    stabilityScore >= 20 ? "good" : stabilityScore >= 14 ? "fair" : "poor";

  // 4. Savings & Reserve pillar (max 25)
  let savingsScore = 20;
  if (summary.totalIncome > 0) {
    const savingsRatio = Math.max(0, summary.netCashFlow / summary.totalIncome);
    savingsScore = Math.min(25, Math.round(10 + savingsRatio * 15));
  }
  const savingsStatus: "good" | "fair" | "poor" =
    savingsScore >= 20 ? "good" : savingsScore >= 14 ? "fair" : "poor";

  const totalScore = Math.max(0, Math.min(100, cashflowScore + budgetScore + stabilityScore + savingsScore));
  const label = totalScore >= 80 ? "Excellent" : totalScore >= 60 ? "Good" : totalScore >= 40 ? "Fair" : "Needs Attention";

  const pillars: HealthPillarData[] = [
    { name: "Cashflow Health", score: cashflowScore, maxScore: 25, status: cashflowStatus },
    { name: "Budget Discipline", score: budgetScore, maxScore: 25, status: budgetStatus },
    { name: "Spending Stability", score: stabilityScore, maxScore: 25, status: stabilityStatus },
    { name: "Savings & Reserve", score: savingsScore, maxScore: 25, status: savingsStatus },
  ];

  const highlights: string[] = [];
  if (summary.netCashFlow > 0) {
    highlights.push(`Positive cash flow of ${formatCurrency(summary.netCashFlow)} today`);
  } else if (summary.netCashFlow < 0) {
    highlights.push(`Negative cash flow of ${formatCurrency(Math.abs(summary.netCashFlow))} today`);
  }
  if (exceededCount > 0) {
    highlights.push(`${exceededCount} budget${exceededCount > 1 ? "s" : ""} exceeded`);
  }

  return { score: totalScore, label, highlights, pillars };
};

// ---------------------------------------------------------------------------
// Content Generation
// ---------------------------------------------------------------------------

/**
 * Generates newsletter content by calling the AI Core newsletter agent.
 * Falls back to template-based content if AI Core is unavailable.
 */
// Generates personalized newsletter sections aligned with subscriber preferences.
// Dispatches aggregated context to AI Core with deterministic template fallbacks.
// Combines algorithmic spending metrics with personalized advice and action items.
export const generateNewsletterContent = async (
  financialData: FinancialData,
  preferences: INewsletterPreferenceDocument
): Promise<NewsletterSectionData> => {
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
    // Shared AI Core client: breaker, connect/read timeouts, jittered retries, batch-priority queue.
    const aiResponse = await processAiCoreNewsletter(
      {
        financial_context: financialData,
        content_preferences: {
          financialTips: contentPrefs.financialTips,
          actionableRecommendations: contentPrefs.actionableRecommendations,
        },
      },
      { timeoutMs: 30_000, priority: "batch" }
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

// Generates rule-based financial advice when AI generation services are offline.
// Evaluates cash flow conditions and transaction velocity to tailor advice.
// Returns encouraging insights and spending guardrails based on recent trends.
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

// Generates deterministic action recommendations when external AI is unavailable.
// Scans exceeded budget limits and near-term bill due dates to prioritize tasks.
// Returns prioritized action items guiding users toward immediate financial tasks.
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
// Executes the end-to-end newsletter generation, rendering, and delivery pipeline.
// Verifies active subscriptions, collects data, builds HTML, and sends email.
// Persists successful dispatch timestamps and logs delivery outcomes.
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
// Renders a complete newsletter preview for a user without dispatching emails.
// Resolves preferences, gathers context data, and generates responsive HTML.
// Enables users and administrative interfaces to inspect rendered email layouts.
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

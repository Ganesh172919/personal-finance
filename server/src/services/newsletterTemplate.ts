/**
 * @fileoverview HTML email template engine for the FinWise daily newsletter.
 *
 * Generates responsive, email-client-safe HTML with inline CSS.
 * Supports dark mode via @media (prefers-color-scheme: dark).
 * Uses FinWise branding colors and includes all newsletter sections:
 *   - Spending summary
 *   - Budget alerts
 *   - Upcoming bills
 *   - Financial tip of the day
 *   - Weekly health score
 *   - Action items / recommendations
 *   - Unsubscribe footer
 *
 * @module services/newsletterTemplate
 */

// Structural representation of a specific financial health score component.
// Details pillar names, point scores, ceiling maximums, and status labels.
// Used in visual breakdowns of user financial health in newsletter emails.
export interface HealthPillarData {
  name: string;
  score: number;
  maxScore: number;
  status: "good" | "fair" | "poor";
}

// Daily spending datapoint for rolling velocity visual charts.
// Tracks calendar date, weekday abbreviation, spend amount, and current day flag.
// Fuels the 7-day HTML bar chart visualization in the daily briefing.
export interface DailySpendTrendItem {
  date: string;
  day: string;
  amount: number;
  isToday?: boolean;
}

// Comprehensive schema encapsulating all renderable newsletter content sections.
// Details spending metrics, budget warnings, bills, tips, health scores, and actions.
// Allows modular rendering of sections according to user content preferences.
export interface NewsletterSectionData {
  spendingSummary?: {
    totalSpent: number;
    totalIncome: number;
    netCashFlow: number;
    topCategories: Array<{ category: string; amount: number; percentage?: number }>;
    transactionCount: number;
    currency?: string;
    dailyTrend?: DailySpendTrendItem[];
  };
  budgetAlerts?: Array<{
    budgetName: string;
    spent: number;
    limit: number;
    percentage: number;
    status: "ok" | "warning" | "exceeded";
  }>;
  upcomingBills?: Array<{
    name: string;
    amount: number;
    dueDate: string;
    daysUntilDue: number;
    currency?: string;
  }>;
  financialTip?: {
    title: string;
    body: string;
    category?: string;
  };
  healthScore?: {
    score: number;
    label: string;
    changeFromLastWeek?: number;
    highlights?: string[];
    pillars?: HealthPillarData[];
  };
  actionItems?: Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    category?: string;
  }>;
}

// Input contract for rendering full HTML newsletter email templates.
// Supplies subscriber display names, formatted dates, section data, and URLs.
// Binds unsubscribe endpoints and application dashboard links to templates.
export interface NewsletterTemplateData {
  userName: string;
  date: string;
  sections: NewsletterSectionData;
  unsubscribeUrl: string;
  appUrl: string;
}

const BRAND_PRIMARY = "#6366f1";
const BRAND_DARK = "#1e1b4b";
const BRAND_ACCENT = "#22d3ee";
const SUCCESS = "#10b981";
const WARNING = "#f59e0b";
const DANGER = "#ef4444";

// Formats numerical currency amounts for email rendering with fallback support.
// Applies international number formatting with zero to two fractional digits.
// Guarantees clean dollar amount formatting when localized formatting fails.
const formatCurrency = (amount: number, currency = "USD"): string => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

// Escapes HTML special characters to prevent injection attacks in emails.
// Replaces ampersands, angle brackets, and quotation marks with HTML entities.
// Sanitizes user-generated transaction names and titles for safe email display.
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Maps budget status codes to corresponding hex color codes for email styling.
// Assigns success green, warning amber, danger red, and neutral gray tones.
// Ensures consistent visual alert branding across email client environments.
const statusColor = (status: string): string => {
  switch (status) {
    case "ok":
      return SUCCESS;
    case "warning":
      return WARNING;
    case "exceeded":
      return DANGER;
    default:
      return "#6b7280";
  }
};

const CATEGORY_COLORS = [
  "#6366f1", // Indigo
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Purple
];

// Generates HTML progress bars showing proportional spend across top categories.
// Assigns rotating category palette colors, percentages, and formatted totals.
// Produces cross-client compatible HTML table and div bar components.
const renderSpendingCategoryBars = (
  categories: Array<{ category: string; amount: number; percentage?: number }>,
  currency = "USD",
  totalSpent = 0
): string => {
  if (!categories || !categories.length) return "";

  const total = totalSpent > 0 ? totalSpent : categories.reduce((sum, c) => sum + c.amount, 0);

  const bars = categories.slice(0, 5).map((c, i) => {
    const pct = c.percentage !== undefined ? c.percentage : (total > 0 ? Math.round((c.amount / total) * 100) : 0);
    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    return `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:4px;">
          <span style="font-weight:600;color:#1e293b;display:flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};"></span>
            ${escapeHtml(c.category)}
          </span>
          <span style="color:#64748b;font-weight:600;">
            ${formatCurrency(c.amount, currency)} <span style="font-size:11px;color:#94a3b8;">(${pct}%)</span>
          </span>
        </div>
        <div style="width:100%;background:#e2e8f0;border-radius:9999px;height:8px;overflow:hidden;">
          <div style="width:${Math.max(3, pct)}%;background:${color};height:8px;border-radius:9999px;"></div>
        </div>
      </div>`;
  }).join("");

  return `
    <div style="margin-top:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;">Spending Distribution by Category</span>
        <span style="font-size:11px;color:#64748b;font-weight:600;">Top ${Math.min(5, categories.length)} Categories</span>
      </div>
      ${bars}
    </div>`;
};

// Renders a lightweight HTML table-based bar chart displaying 7-day spend.
// Scales bar heights proportionally against peak spend and highlights today.
// Ensures email client compatibility without requiring external image assets.
const renderDailySpendingChart = (
  trend: DailySpendTrendItem[],
  currency = "USD"
): string => {
  if (!trend || !trend.length) return "";

  const maxAmount = Math.max(1, ...trend.map((t) => t.amount));

  const columns = trend
    .map((t) => {
      const barHeight = Math.max(8, Math.round((t.amount / maxAmount) * 70));
      const isToday = Boolean(t.isToday);
      const barColor = isToday ? BRAND_PRIMARY : t.amount > 0 ? "#94a3b8" : "#cbd5e1";
      const textColor = isToday ? BRAND_PRIMARY : "#64748b";
      const formattedAmt = t.amount > 0 ? (t.amount >= 1000 ? `$${(t.amount / 1000).toFixed(1)}k` : `$${Math.round(t.amount)}`) : "$0";

      return `
        <td style="padding:0 4px;vertical-align:bottom;text-align:center;">
          <div style="font-size:10px;font-weight:600;color:${textColor};margin-bottom:4px;white-space:nowrap;">${formattedAmt}</div>
          <div style="height:74px;display:flex;align-items:flex-end;justify-content:center;">
            <div style="width:100%;max-width:24px;height:${barHeight}px;background:${barColor};border-radius:4px 4px 0 0;margin:0 auto;" title="${t.date}: ${formatCurrency(t.amount, currency)}"></div>
          </div>
          <div style="font-size:11px;font-weight:${isToday ? "700" : "500"};color:${textColor};margin-top:6px;">${escapeHtml(t.day)}</div>
          ${isToday ? `<div style="font-size:9px;font-weight:700;color:${BRAND_PRIMARY};text-transform:uppercase;">Today</div>` : `<div style="font-size:9px;color:transparent;">&nbsp;</div>`}
        </td>`;
    })
    .join("");

  return `
    <div style="margin:16px 0 20px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;">7-Day Spending Velocity</span>
        <span style="font-size:11px;color:#64748b;font-weight:500;">Peak: ${formatCurrency(maxAmount, currency)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <tbody>
          <tr>
            ${columns}
          </tr>
        </tbody>
      </table>
    </div>`;
};

// Renders styled score bars representing the four financial health pillars.
// Maps score percentages, status color badges, and category descriptions.
// Provides visual breakdown of cash flow, budgeting, stability, and savings.
const renderHealthPillars = (
  pillars: HealthPillarData[]
): string => {
  if (!pillars || !pillars.length) return "";

  const rows = pillars.map((p) => {
    const pct = p.maxScore > 0 ? Math.round((p.score / p.maxScore) * 100) : 0;
    const color = p.status === "good" ? SUCCESS : p.status === "fair" ? WARNING : DANGER;
    const badgeLabel = p.status === "good" ? "Strong" : p.status === "fair" ? "Moderate" : "Watch";

    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:3px;">
          <span style="font-weight:600;color:#1e293b;">${escapeHtml(p.name)}</span>
          <span style="font-weight:700;color:#475569;">
            ${p.score} / ${p.maxScore}
            <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;color:#fff;background:${color};">${badgeLabel}</span>
          </span>
        </div>
        <div style="width:100%;background:#e2e8f0;border-radius:9999px;height:6px;overflow:hidden;">
          <div style="width:${Math.max(4, pct)}%;background:${color};height:6px;border-radius:9999px;"></div>
        </div>
      </div>`;
  }).join("");

  return `
    <div style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:14px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;margin-bottom:10px;">
        Financial Health Pillar Breakdown
      </div>
      ${rows}
    </div>`;
};

// Resolves color styling and text labels for action item priority levels.
// Maps high, medium, and low priorities to distinct badge color pairs.
// Ensures consistent visual emphasis on critical financial action items.
const priorityBadge = (priority: string): { color: string; bg: string; label: string } => {
  switch (priority) {
    case "high":
      return { color: "#fff", bg: DANGER, label: "High" };
    case "medium":
      return { color: "#fff", bg: WARNING, label: "Medium" };
    case "low":
      return { color: "#fff", bg: "#6b7280", label: "Low" };
    default:
      return { color: "#fff", bg: "#6b7280", label: priority };
  }
};

// Builds HTML markup for the daily spending summary briefing section.
// Formats income, expenses, net cash flow, velocity charts, and category bars.
// Delivers a high-level overview of daily transactions and cash movement.
const renderSpendingSummary = (data: NonNullable<NewsletterSectionData["spendingSummary"]>): string => {
  const currency = data.currency || "USD";
  const dailyChart = data.dailyTrend && data.dailyTrend.length ? renderDailySpendingChart(data.dailyTrend, currency) : "";
  const categoryBars = data.topCategories && data.topCategories.length ? renderSpendingCategoryBars(data.topCategories, currency, data.totalSpent) : "";

  return `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${BRAND_PRIMARY};">
        Spending Summary
      </h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#6b7280;">Income</td>
          <td style="padding:8px 0;font-size:14px;color:${SUCCESS};text-align:right;font-weight:600;">+${formatCurrency(data.totalIncome, currency)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#6b7280;">Expenses</td>
          <td style="padding:8px 0;font-size:14px;color:${DANGER};text-align:right;font-weight:600;">-${formatCurrency(data.totalSpent, currency)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#374151;font-weight:600;border-top:2px solid #e5e7eb;">Net Cash Flow</td>
          <td style="padding:8px 0;font-size:14px;color:${data.netCashFlow >= 0 ? SUCCESS : DANGER};text-align:right;font-weight:700;border-top:2px solid #e5e7eb;">${data.netCashFlow >= 0 ? "+" : ""}${formatCurrency(data.netCashFlow, currency)}</td>
        </tr>
      </table>
      ${dailyChart}
      ${categoryBars}
      <p style="font-size:12px;color:#9ca3af;margin:12px 0 0 0;">${data.transactionCount} transactions recorded in this briefing period</p>
    </div>`;
};

// Renders an HTML table of budget warning alerts for the newsletter email.
// Shows budget names, percentage spent badges, and consumed amount limits.
// Highlights categories exceeding or approaching established budget ceilings.
const renderBudgetAlerts = (alerts: NonNullable<NewsletterSectionData["budgetAlerts"]>): string => {
  if (!alerts.length) return "";

  const rows = alerts
    .map(
      (a) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(a.budgetName)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:${statusColor(a.status)};">${a.percentage}%</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;text-align:right;">${formatCurrency(a.spent)} / ${formatCurrency(a.limit)}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${WARNING};">
        Budget Alerts
      </h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Budget</th>
            <th style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:center;text-transform:uppercase;letter-spacing:0.05em;">Used</th>
            <th style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">Spent / Limit</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
};

// Constructs an HTML table displaying upcoming bill obligations due soon.
// Flags urgent payments due today or tomorrow with prominent color highlights.
// Reminds subscribers of pending outflows to prevent overdrafts and fees.
const renderUpcomingBills = (bills: NonNullable<NewsletterSectionData["upcomingBills"]>): string => {
  if (!bills.length) return "";

  const rows = bills
    .map((b) => {
      const urgencyColor = b.daysUntilDue <= 1 ? DANGER : b.daysUntilDue <= 3 ? WARNING : "#6b7280";
      const dueLabel = b.daysUntilDue === 0 ? "Today" : b.daysUntilDue === 1 ? "Tomorrow" : `in ${b.daysUntilDue} days`;
      return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(b.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:${urgencyColor};text-align:center;font-weight:600;">${dueLabel}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;font-weight:600;">${formatCurrency(b.amount, b.currency || "USD")}</td>
      </tr>`;
    })
    .join("");

  return `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${BRAND_ACCENT};">
        Upcoming Bills
      </h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Bill</th>
            <th style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:center;text-transform:uppercase;letter-spacing:0.05em;">Due</th>
            <th style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
};

// Renders an educational financial tip card with gradient accent styling.
// Formats tip titles, body explanations, and thematic category badges.
// Delivers personalized daily financial coaching directly in the email.
const renderFinancialTip = (tip: NonNullable<NewsletterSectionData["financialTip"]>): string => `
  <div style="margin-bottom:24px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-radius:12px;padding:20px;border-left:4px solid ${BRAND_PRIMARY};">
    <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px 0;">
      ${tip.category ? `<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${BRAND_PRIMARY};display:block;margin-bottom:4px;">${escapeHtml(tip.category)}</span>` : ""}
      ${escapeHtml(tip.title)}
    </h2>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0;">${escapeHtml(tip.body)}</p>
  </div>`;

// Renders the overall financial health score badge, trend change, and pillars.
// Displays color-coded circular badges and notable positive or negative highlights.
// Summarizes comprehensive weekly financial performance at a glance.
const renderHealthScore = (score: NonNullable<NewsletterSectionData["healthScore"]>): string => {
  const scoreColor = score.score >= 75 ? SUCCESS : score.score >= 50 ? WARNING : DANGER;
  const changeText =
    score.changeFromLastWeek !== undefined
      ? `<span style="font-size:13px;color:${score.changeFromLastWeek >= 0 ? SUCCESS : DANGER};margin-left:8px;">${score.changeFromLastWeek >= 0 ? "+" : ""}${score.changeFromLastWeek} from last week</span>`
      : "";

  const highlights = (score.highlights || [])
    .map((h) => `<li style="font-size:13px;color:#6b7280;margin-bottom:4px;">${escapeHtml(h)}</li>`)
    .join("");

  const pillarsHtml = score.pillars && score.pillars.length ? renderHealthPillars(score.pillars) : "";

  return `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${scoreColor};">
        Financial Health Score
      </h2>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
        <div style="width:80px;height:80px;border-radius:50%;background:${scoreColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:28px;font-weight:800;color:#fff;">${score.score}</span>
        </div>
        <div>
          <div style="font-size:16px;font-weight:600;color:#111827;">${escapeHtml(score.label)}${changeText}</div>
          ${highlights ? `<ul style="margin:8px 0 0 0;padding-left:16px;">${highlights}</ul>` : ""}
        </div>
      </div>
      ${pillarsHtml}
    </div>`;
};

// Formats concrete financial action item recommendation cards for emails.
// Tags each item with priority badges, category labels, and action steps.
// Directs users toward high-impact adjustments to improve their financial stance.
const renderActionItems = (items: NonNullable<NewsletterSectionData["actionItems"]>): string => {
  if (!items.length) return "";

  const cards = items
    .map((item) => {
      const p = priorityBadge(item.priority);
      return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:${p.color};background:${p.bg};">${p.label}</span>
          ${item.category ? `<span style="font-size:12px;color:#9ca3af;">${escapeHtml(item.category)}</span>` : ""}
        </div>
        <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:2px;">${escapeHtml(item.title)}</div>
        <div style="font-size:13px;color:#6b7280;line-height:1.4;">${escapeHtml(item.description)}</div>
      </div>`;
    })
    .join("");

  return `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${SUCCESS};">
        Action Items
      </h2>
      ${cards}
    </div>`;
};

/**
 * Renders a complete newsletter HTML email from structured section data.
 *
 * The returned HTML uses inline CSS for maximum email client compatibility.
 * A dark-mode variant is applied via @media (prefers-color-scheme: dark).
 */
// Compiles full responsive HTML email templates from modular section outputs.
// Incorporates inline CSS styles and dark mode media queries for email clients.
// Assembles header branding, greetings, sections, CTAs, and unsubscribe footers.
export function renderNewsletterHtml(data: NewsletterTemplateData): string {
  const { userName, date, sections, unsubscribeUrl, appUrl } = data;
  const safeName = escapeHtml(userName);

  const spendingSection = sections.spendingSummary ? renderSpendingSummary(sections.spendingSummary) : "";
  const budgetSection = sections.budgetAlerts ? renderBudgetAlerts(sections.budgetAlerts) : "";
  const billsSection = sections.upcomingBills ? renderUpcomingBills(sections.upcomingBills) : "";
  const tipSection = sections.financialTip ? renderFinancialTip(sections.financialTip) : "";
  const healthSection = sections.healthScore ? renderHealthScore(sections.healthScore) : "";
  const actionsSection = sections.actionItems ? renderActionItems(sections.actionItems) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FinWise Daily Newsletter - ${escapeHtml(date)}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      body, .email-body { background-color: #0f0f23 !important; }
      .email-container { background-color: #1a1a2e !important; border-color: #2d2d44 !important; }
      .email-header { background: linear-gradient(135deg, #1e1b4b, #312e81) !important; }
      h2, .section-title { color: #e5e7eb !important; }
      td, p, .text-body { color: #d1d5db !important; }
      .card { background-color: #1e1e32 !important; border-color: #2d2d44 !important; }
      .tip-card { background: linear-gradient(135deg, #1e1b4b, #312e81) !important; }
      .footer { background-color: #0f0f23 !important; }
      .footer p, .footer a { color: #9ca3af !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;" class="email-body">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;" class="email-container">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND_DARK},${BRAND_PRIMARY});border-radius:12px 12px 0 0;padding:32px 24px;text-align:center;" class="email-header">
              <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.02em;">FinWise</div>
              <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:4px;">Daily Financial Newsletter</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:8px;">${escapeHtml(date)}</div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="background-color:#fff;padding:24px 24px 0 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <p style="font-size:16px;color:#374151;margin:0 0 16px 0;">Good morning, <strong>${safeName}</strong>!</p>
              <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">Here is your personalized financial briefing for today.</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background-color:#fff;padding:0 24px 24px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              ${spendingSection}
              ${budgetSection}
              ${billsSection}
              ${healthSection}
              ${tipSection}
              ${actionsSection}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background-color:#fff;padding:0 24px 24px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;text-align:center;">
              <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:${BRAND_PRIMARY};color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Open FinWise Dashboard</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;" class="footer">
              <p style="font-size:12px;color:#9ca3af;margin:0 0 8px 0;">
                You are receiving this because you subscribed to FinWise daily newsletters.
              </p>
              <p style="font-size:12px;color:#9ca3af;margin:0;">
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND_PRIMARY};text-decoration:underline;">Unsubscribe</a>
                &nbsp;&middot;&nbsp;
                <a href="${escapeHtml(appUrl)}/settings" style="color:${BRAND_PRIMARY};text-decoration:underline;">Manage Preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

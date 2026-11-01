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

export interface NewsletterSectionData {
  spendingSummary?: {
    totalSpent: number;
    totalIncome: number;
    netCashFlow: number;
    topCategories: Array<{ category: string; amount: number }>;
    transactionCount: number;
    currency?: string;
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
  };
  actionItems?: Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    category?: string;
  }>;
}

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

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

const renderSpendingSummary = (data: NonNullable<NewsletterSectionData["spendingSummary"]>): string => {
  const currency = data.currency || "USD";
  const topCats = data.topCategories
    .slice(0, 5)
    .map(
      (c) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(c.category)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;font-weight:600;">${formatCurrency(c.amount, currency)}</td>
      </tr>`
    )
    .join("");

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
      ${
        topCats
          ? `
        <p style="font-size:13px;color:#6b7280;margin:0 0 8px 0;font-weight:600;">Top Spending Categories</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${topCats}
        </table>`
          : ""
      }
      <p style="font-size:12px;color:#9ca3af;margin:8px 0 0 0;">${data.transactionCount} transactions in the last 24 hours</p>
    </div>`;
};

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

const renderFinancialTip = (tip: NonNullable<NewsletterSectionData["financialTip"]>): string => `
  <div style="margin-bottom:24px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-radius:12px;padding:20px;border-left:4px solid ${BRAND_PRIMARY};">
    <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px 0;">
      ${tip.category ? `<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${BRAND_PRIMARY};display:block;margin-bottom:4px;">${escapeHtml(tip.category)}</span>` : ""}
      ${escapeHtml(tip.title)}
    </h2>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0;">${escapeHtml(tip.body)}</p>
  </div>`;

const renderHealthScore = (score: NonNullable<NewsletterSectionData["healthScore"]>): string => {
  const scoreColor = score.score >= 75 ? SUCCESS : score.score >= 50 ? WARNING : DANGER;
  const changeText =
    score.changeFromLastWeek !== undefined
      ? `<span style="font-size:13px;color:${score.changeFromLastWeek >= 0 ? SUCCESS : DANGER};margin-left:8px;">${score.changeFromLastWeek >= 0 ? "+" : ""}${score.changeFromLastWeek} from last week</span>`
      : "";

  const highlights = (score.highlights || [])
    .map((h) => `<li style="font-size:13px;color:#6b7280;margin-bottom:4px;">${escapeHtml(h)}</li>`)
    .join("");

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
    </div>`;
};

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

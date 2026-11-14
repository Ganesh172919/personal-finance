import mongoose from "mongoose";
import FinancialProfileModel from "../models/financialProfileModel";
import OrganizationModel from "../models/organizationModel";
import type { AuthoredDocumentFormat, DocumentKPI, DocumentTable } from "./richDocumentRenderer";

/** Saved profile facts only. Templates must never supply example balances or tax rules. */
// Extracts key financial metrics and inventory tables from user financial profiles.
// Computes cash flow, reserve coverage, debt summaries, and customized KPI cards.
// Formats structured document data tailored to specific financial document templates.
export async function populateProfileTemplateData(params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  format: AuthoredDocumentFormat;
}): Promise<{ kpis: DocumentKPI[]; tables: DocumentTable[]; summaryText: string }> {
  const [profile, org] = await Promise.all([
    FinancialProfileModel.findOne({ orgId: params.orgId, userId: params.userId }).lean(),
    OrganizationModel.findById(params.orgId).select({ currency: 1 }).lean(),
  ]);
  if (!profile) {
    return { kpis: [], tables: [], summaryText: "No saved financial profile is available in this workspace. Add your financial details or provide your own document content." };
  }

  const currency = String(org?.currency || "USD").toUpperCase();
  const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const money = (value: number | undefined) => value === undefined ? "Not saved"
    : `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const income = amount(profile.annual_income);
  const expenses = amount(profile.monthly_expenses);
  const savings = amount(profile.savings);
  const monthlyIncome = income === undefined ? undefined : income / 12;
  const cashFlow = monthlyIncome === undefined || expenses === undefined ? undefined : monthlyIncome - expenses;
  const runway = savings !== undefined && expenses !== undefined && expenses > 0 ? savings / expenses : undefined;
  const debts = profile.debts || [];
  const totalDebt = debts.reduce((total, debt) => total + (amount(debt.balance) ?? 0), 0);
  const payments = debts.reduce((total, debt) => total + (amount(debt.minimum_payment) ?? 0), 0);
  const baseKpis: DocumentKPI[] = [
    { label: "Annual Income", value: money(income), subtext: "Saved profile; not tax verified" },
    { label: "Monthly Expenses", value: money(expenses), subtext: "Saved profile" },
    { label: "Saved Reserves", value: money(savings), subtext: "Saved profile; not a linked-account balance" },
  ];
  const cashKpis: DocumentKPI[] = [
    { label: "Monthly Income", value: money(monthlyIncome), subtext: "Annual profile income / 12" },
    { label: "Monthly Expenses", value: money(expenses), subtext: "Saved profile" },
    { label: "Net Monthly Cash Flow", value: money(cashFlow), subtext: "Income minus expenses" },
    { label: "Reserve Coverage", value: runway === undefined ? "Not calculable" : `${runway.toFixed(1)} months`, subtext: "Saved reserves / monthly expenses" },
  ];

  switch (params.format) {
    case "tax_prep_summary":
      return {
        summaryText: "Tax preparation summary from the saved financial profile. Annual income is self-reported. Filing jurisdiction, tax year, deductions, withholding and tax liability are not established by this profile; supply the relevant source documents before calculating tax.",
        kpis: [baseKpis[0]!], tables: [],
      };
    case "cash_flow_audit":
    case "executive_brief":
      return {
        summaryText: `Saved profile overview: monthly income ${money(monthlyIncome)}, monthly expenses ${money(expenses)}, and net monthly cash flow ${money(cashFlow)}. These figures describe the saved profile, rather than a reconciled transaction or budget audit.`,
        kpis: cashKpis, tables: [],
      };
    case "debt_payoff_schedule":
      return {
        summaryText: debts.length ? "Saved debt inventory ordered by interest rate. Payment amounts are the recorded minimums. A payoff date or interest-saving projection requires a separate repayment calculation."
          : "No debts are saved in this financial profile. This does not establish that there are no other liabilities.",
        kpis: [
          { label: "Saved Debt Balances", value: money(totalDebt) },
          { label: "Saved Minimum Payments", value: money(payments) },
        ],
        tables: debts.length ? [{
          title: "Saved debt inventory", headers: ["Debt", "Balance", "Annual interest", "Minimum payment"],
          rows: [...debts].sort((a, b) => b.interest_rate - a.interest_rate).map(debt => [
            debt.name, money(amount(debt.balance)),
            amount(debt.interest_rate) === undefined ? "Not saved" : `${debt.interest_rate}%`,
            money(amount(debt.minimum_payment)),
          ]),
        }] : [],
      };
    case "net_worth_statement":
      return {
        summaryText: "Partial balance overview from saved reserves and saved debts. Property, investments and other assets or liabilities may be absent; this is not a complete net worth valuation.",
        kpis: [
          baseKpis[2]!,
          { label: "Saved Debt Balances", value: money(totalDebt) },
          { label: "Reserves Minus Saved Debts", value: money(savings === undefined ? undefined : savings - totalDebt), subtext: "Partial balance only" },
        ], tables: [],
      };
    default:
      return { summaryText: "Financial overview from this user's saved workspace profile. Values have not been independently verified against account statements.", kpis: baseKpis, tables: [] };
  }
}

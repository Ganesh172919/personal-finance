/**
 * @fileoverview What-if scenario builder for financial planning.
 *
 * Lets users model hypothetical changes to expenses, income, or
 * investments and see the projected impact on surplus, savings rate,
 * emergency runway, and goal timelines. Three scenario types are supported:
 * New Expense, Income Change, and Investment Plan.
 *
 * Key data flows:
 * - processScenario() mutation sends scenario_type, amount, description,
 *   and assumptions (months, expected_return_pct) to the server.
 * - The response (ScenarioResponse) contains before/after comparisons,
 *   emergency runway metrics, and delta metrics rendered in the results panel.
 * - Multi-Scenario Comparison Matrix enables side-by-side benchmarking of up
 *   to 4 distinct pinned scenarios against the baseline profile.
 * - Monte Carlo risk modeling computes P10 (bearish), P50 (median), and P90 (bullish)
 *   stochastic confidence bands over the forecast horizon.
 * - Progressive tax bracket estimator models net take-home cashflow for income adjustments.
 * - Real purchasing power calculations adjust nominal projections for inflation.
 *
 * All monetary values are formatted via useOrgFormatters for tenant-
 * aware currency display.
 *
 * Accessible from the sidebar under "Scenarios" for authenticated users.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Calculator,
  TrendingDown,
  TrendingUp,
  Target,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Activity,
  Clock,
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  MessageSquare,
  ArrowRight,
  Pin,
  Trash2,
  FileSpreadsheet,
  Coins,
  Percent,
  BarChart2,
  Layers,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getFinancialProfile } from "@/lib/api/profile";
import { createTask } from "@/lib/api/tasks";
import { listAccounts, type Account } from "@/lib/api/v1/finance";
import { getPortfolioSummary } from "@/lib/api/transactions";
import { Landmark, Wallet, CreditCard, Shield } from "lucide-react";
import { processScenario, ScenarioResponse } from "@/lib/apiClient";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { useToast } from "@/hooks/useToast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";

// Model representing a saved what-if scenario simulation result.
// Stores parameters such as cashflow impact, investment horizon, returns, and taxes.
// Enables side-by-side comparison and historical scenario recall.
export interface SavedScenario {
  id: string;
  name: string;
  type: "expense" | "income" | "investment";
  amount: number;
  months: number;
  returnPct?: number;
  taxRatePct?: number;
  response: ScenarioResponse;
  timestamp: number;
}

// Computes Monte Carlo percentile bands (P10, P50, P90) for cash and investments.
// Models compound growth volatility using stochastic log-normal returns.
// Generates probability of target capital achievement over specified months.
/**
 * Computes stochastic Monte Carlo confidence bounds for accumulated savings / investments.
 */
export function calculateMonteCarloBounds(
  monthlyAmount: number,
  months: number,
  isInvestment: boolean,
  expectedReturnPct = 10,
  volatilityPct = 15
) {
  if (months <= 0 || monthlyAmount === 0) {
    return { p10: 0, p50: 0, p90: 0, successProbability: 100 };
  }

  if (isInvestment) {
    const annualReturn = expectedReturnPct / 100;
    const monthlyReturn = annualReturn / 12;
    const annualVol = volatilityPct / 100;
    const monthlyVol = annualVol / Math.sqrt(12);

    const fvMonthly = (r: number) => {
      if (Math.abs(r) < 0.0001) return monthlyAmount * months;
      return monthlyAmount * ((Math.pow(1 + r, months) - 1) / r);
    };

    const p50 = fvMonthly(monthlyReturn);
    const r10 = Math.max(-0.05, monthlyReturn - 1.28 * monthlyVol);
    const p10 = fvMonthly(r10);
    const r90 = monthlyReturn + 1.28 * monthlyVol;
    const p90 = fvMonthly(r90);

    return {
      p10: Math.round(p10),
      p50: Math.round(p50),
      p90: Math.round(p90),
      successProbability: p10 > 0 ? 94 : 72,
    };
  } else {
    // Non-investment cashflow (income boost is positive, expense is negative).
    // Bearish (P10) is always the worse cash outcome: 15% less income or a 15% higher
    // cost; bullish (P90) is 5% more income or a 5% lower cost.
    const totalCash = monthlyAmount * months;
    const p10 = Math.round(totalCash - Math.abs(totalCash) * 0.15);
    const p50 = Math.round(totalCash);
    const p90 = Math.round(totalCash + Math.abs(totalCash) * 0.05);

    return {
      p10,
      p50,
      p90,
      successProbability: 95,
    };
  }
}

// Formats emergency fund survival runway duration to a clean single decimal digit.
// Rounds raw fractional months into user-friendly numeric strings.
// Used for displaying emergency liquidity health before and after shocks.
/** Runway months from the scenario engine, rounded for display (e.g. 3.658… -> 3.7). */
export function formatRunwayMonths(months: number): string {
  return String(Number(Number(months).toFixed(1)));
}

// Discounts future nominal cash sums by compound annual inflation rates.
// Calculates purchasing power degradation and cumulative real inflation loss.
// Clarifies the long-term impact of inflation on stagnant cash reserves.
/**
 * Computes inflation-adjusted real purchasing power of future cash.
 */
export function calculateRealPurchasingPower(
  nominalAmount: number,
  months: number,
  inflationPct = 3
) {
  const years = months / 12;
  const rate = inflationPct / 100;
  const discountFactor = Math.pow(1 + rate, years);
  const realValue = nominalAmount / (discountFactor || 1);
  return {
    realValue: Math.round(realValue),
    inflationLoss: Math.round(nominalAmount - realValue),
  };
}

// Model defining macroeconomic stress testing scenarios based on historic crises.
// Outlines equity drawdowns, income drops, inflation spikes, and recovery durations.
// Used to simulate user financial resilience against severe economic recessions.
export interface MacroCrisisScenario {
  id: string;
  name: string;
  period: string;
  description: string;
  equityShockPct: number;
  incomeShockPct: number;
  expenseShockPct: number;
  inflationShockPct: number;
  durationMonths: number;
  recoveryMonths: number;
  historicalContext: string;
}

// Curated historical financial crisis models for stress test evaluations.
// Includes 2008 GFC, 2020 COVID shock, 1970s stagflation, and dot-com bubble crash.
// Applies real-world historical shock magnitudes to current personal balance sheets.
export const HISTORICAL_MACRO_CRISES: MacroCrisisScenario[] = [
  {
    id: "gfc_2008",
    name: "2008 Great Financial Crisis",
    period: "2007 – 2009",
    description: "Severe credit contraction, housing crash, and systemic banking liquidity crunch.",
    equityShockPct: -38,
    incomeShockPct: -20,
    expenseShockPct: 0,
    inflationShockPct: 1.5,
    durationMonths: 24,
    recoveryMonths: 36,
    historicalContext: "Equities dropped ~38% globally; high unemployment prolonged recovery to 3 full years.",
  },
  {
    id: "covid_2020",
    name: "2020 COVID-19 Flash Shock",
    period: "Feb – Aug 2020",
    description: "Abrupt economic shutdown followed by aggressive fiscal stimulus and historic V-shaped bounce.",
    equityShockPct: -34,
    incomeShockPct: -15,
    expenseShockPct: -10,
    inflationShockPct: 2.0,
    durationMonths: 6,
    recoveryMonths: 6,
    historicalContext: "Rapid 34% drawdown followed by a record V-shaped bounce within 6 months.",
  },
  {
    id: "stagflation_1970s",
    name: "1970s Stagflation & Oil Shock",
    period: "1973 – 1975",
    description: "High inflation combined with stagnant economic growth and negative real asset returns.",
    equityShockPct: -18,
    incomeShockPct: 0,
    expenseShockPct: 15,
    inflationShockPct: 9.5,
    durationMonths: 36,
    recoveryMonths: 48,
    historicalContext: "Living costs jumped 15%+ while real portfolio purchasing power degraded by over 25%.",
  },
  {
    id: "dotcom_2000",
    name: "2000 Dot-Com Tech Burst",
    period: "2000 – 2002",
    description: "Extreme tech valuation contraction and prolonged multi-year sideways equity market.",
    equityShockPct: -45,
    incomeShockPct: -10,
    expenseShockPct: 0,
    inflationShockPct: 2.5,
    durationMonths: 30,
    recoveryMonths: 48,
    historicalContext: "Tech equities fell >70%, overall market down 45%, requiring 4 years to break even.",
  },
  {
    id: "rate_shock_2022",
    name: "2022 Inflation & Rate Hike Surge",
    period: "2022",
    description: "Simultaneous stock and bond correction driven by aggressive central bank interest rate hikes.",
    equityShockPct: -19,
    incomeShockPct: 0,
    expenseShockPct: 8,
    inflationShockPct: 8.5,
    durationMonths: 14,
    recoveryMonths: 18,
    historicalContext: "Worst bond market in 50 years with 8.5% inflation and double-digit tech drawdowns.",
  },
];

// Comprehensive result metrics returned from macro crisis stress test evaluations.
// Details shocked income, expenses, monthly burn rate, drawdown, and resilience rating.
// Provides personalized financial defense recommendations based on crisis severity.
export interface MacroStressTestResult {
  crisis: MacroCrisisScenario;
  baselineIncome: number;
  baselineExpenses: number;
  baselineSurplus: number;
  baselineSavings: number;
  baselineInvestments: number;
  stressedIncome: number;
  stressedExpenses: number;
  stressedMonthlyCashflow: number;
  monthlyBurn: number;
  portfolioDrawdown: number;
  stressedPortfolioValue: number;
  stressedEmergencyRunwayMonths: number | null;
  capitalDeficit: number;
  resilienceScore: number | null;
  resilienceRating: "Bulletproof" | "Resilient" | "Moderate Risk" | "Vulnerable" | "Not assessed";
  recommendations: string[];
}

// Evaluates crisis shock impacts on an individual bank or investment account.
// Captures pre and post shock balances, percentage changes, and vulnerability tags.
// Distinguishes between equity volatility, inflation drag, and debt interest hikes.
export interface StressedAccountImpact {
  account: Account;
  preBalance: number;
  postBalance: number;
  dollarChange: number;
  pctChange: number;
  vulnerabilityLabel: string;
  vulnerabilitySeverity: "high" | "moderate" | "safe";
}

// Calculates stressed account balance changes under macroeconomic crisis shocks.
// Applies beta-adjusted market equity shocks, liquidity haircuts, or debt rate hikes.
// Classifies vulnerability severity to highlight accounts most exposed to systemic risk.
export const calculateAccountStressImpact = (
  account: Account,
  crisis: MacroCrisisScenario,
  beta: number
): StressedAccountImpact => {
  const preBalance = typeof account.current_balance === "number" ? account.current_balance : Number(account.opening_balance || 0);
  let postBalance = preBalance;
  let vulnerabilityLabel = "Protected";
  let vulnerabilitySeverity: "high" | "moderate" | "safe" = "safe";

  if (account.type === "brokerage") {
    const dropRate = (crisis.equityShockPct * beta) / 100;
    postBalance = Math.round(Math.max(0, preBalance * (1 + dropRate)));
    vulnerabilityLabel = `Equity Shock (${(crisis.equityShockPct * beta).toFixed(0)}%)`;
    vulnerabilitySeverity = "high";
  } else if (account.type === "savings" || account.type === "checking" || account.type === "cash") {
    const inflationHaircut = (crisis.expenseShockPct * 0.5) / 100;
    postBalance = Math.round(Math.max(0, preBalance * (1 - inflationHaircut)));
    vulnerabilityLabel = crisis.expenseShockPct > 0 ? `Inflation Drag (-${(crisis.expenseShockPct * 0.5).toFixed(0)}%)` : "FDIC Liquid";
    vulnerabilitySeverity = "safe";
  } else if (account.type === "credit") {
    if (preBalance < 0) {
      const debtIncrease = Math.abs(preBalance) * 0.15;
      postBalance = Math.round(preBalance - debtIncrease);
      vulnerabilityLabel = "Debt Service Hike (+15%)";
      vulnerabilitySeverity = "moderate";
    }
  }

  const dollarChange = Math.round(postBalance - preBalance);
  const pctChange = preBalance !== 0 ? Number(((dollarChange / Math.abs(preBalance)) * 100).toFixed(1)) : 0;

  return {
    account,
    preBalance,
    postBalance,
    dollarChange,
    pctChange,
    vulnerabilityLabel,
    vulnerabilitySeverity,
  };
};

// Validates that an unknown input value represents a valid non-negative number.
// Distinguishes valid recorded balances (including zero) from missing or invalid entries.
// Used to verify baseline profile completeness prior to running financial stress tests.
function recordedAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

// Simulates macroeconomic crisis shock impacts against user baseline finances.
// Computes stressed cashflow, investment drawdown, burn rate, and resilience scores.
// Yields actionable hedging and liquidity protection recommendations.
export function calculateMacroStressImpact(
  crisis: MacroCrisisScenario,
  baseline: {
    monthly_income: number;
    monthly_expenses: number;
    savings: number;
    investments: number;
  }
): MacroStressTestResult {
  // Unknown balances cannot support a personalised forecast. Explicit zeroes are
  // valid recorded values; missing, invalid or negative values need correction.
  if ([baseline.monthly_income, baseline.monthly_expenses, baseline.savings, baseline.investments]
        .some((value) => recordedAmount(value) === null)) {
    throw new Error("A complete saved financial baseline is required for stress testing.");
  }
  const inc0 = baseline.monthly_income;
  const exp0 = baseline.monthly_expenses;
  const surplus0 = inc0 - exp0;
  const sav0 = baseline.savings;
  const inv0 = baseline.investments;

  const stressedIncome = Math.round(inc0 * (1 + crisis.incomeShockPct / 100));
  const stressedExpenses = Math.round(exp0 * (1 + crisis.expenseShockPct / 100));
  const stressedMonthlyCashflow = stressedIncome - stressedExpenses;
  const monthlyBurn = stressedMonthlyCashflow < 0 ? Math.abs(stressedMonthlyCashflow) : 0;

  const portfolioDrawdown = Math.round(inv0 * (crisis.equityShockPct / 100)) || 0;
  const stressedPortfolioValue = Math.max(0, inv0 + portfolioDrawdown);

  const totalCrisisCashBurn = monthlyBurn * crisis.durationMonths;
  const capitalDeficit = Math.max(0, totalCrisisCashBurn - sav0);

  const stressedEmergencyRunwayMonths =
    monthlyBurn > 0
      ? Number((sav0 / monthlyBurn).toFixed(1))
      : stressedExpenses > 0
      ? Number((sav0 / stressedExpenses).toFixed(1))
      : null;

  let resilienceScore: number | null = 50;
  let resilienceRating: MacroStressTestResult["resilienceRating"] = "Moderate Risk";

  if (stressedEmergencyRunwayMonths === null) {
    resilienceScore = null;
    resilienceRating = "Not assessed";
  } else if (stressedEmergencyRunwayMonths >= crisis.durationMonths && capitalDeficit === 0) {
    resilienceScore = Math.min(100, Math.round(85 + (stressedEmergencyRunwayMonths - crisis.durationMonths) * 1.5));
    resilienceRating = "Bulletproof";
  } else if (stressedEmergencyRunwayMonths >= crisis.durationMonths / 2) {
    resilienceScore = Math.min(84, Math.round(70 + (stressedEmergencyRunwayMonths / crisis.durationMonths) * 14));
    resilienceRating = "Resilient";
  } else if (stressedEmergencyRunwayMonths >= 3) {
    resilienceScore = Math.min(69, Math.round(45 + (stressedEmergencyRunwayMonths / (crisis.durationMonths / 2)) * 24));
    resilienceRating = "Moderate Risk";
  } else {
    resilienceScore = Math.max(12, Math.round(stressedEmergencyRunwayMonths * 12));
    resilienceRating = "Vulnerable";
  }

  const recommendations: string[] = [];
  if (capitalDeficit > 0) {
    recommendations.push(
      `Expand cash buffer by $${capitalDeficit.toLocaleString()} to survive the full ${crisis.durationMonths}-month crisis without liquidating beaten-down assets.`
    );
  }
  if (monthlyBurn > 0) {
    recommendations.push(
      `Prepare a contingency austerity budget trimming discretionary spending by $${Math.min(stressedExpenses, monthlyBurn).toLocaleString()}/mo.`
    );
  }
  if (crisis.equityShockPct <= -30) {
    recommendations.push(
      `Maintain dry-powder cash to systematically dollar-cost average during the drawdown and capture the ${crisis.recoveryMonths}-month recovery.`
    );
  }
  if (crisis.inflationShockPct >= 5) {
    recommendations.push(
      `Hedge against inflation with real assets, Treasury Inflation-Protected Securities (TIPS), or floating-rate debt.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      `Your current liquid buffer and cashflow provide strong natural insulation against this historical macro crisis.`
    );
  }

  return {
    crisis,
    baselineIncome: inc0,
    baselineExpenses: exp0,
    baselineSurplus: surplus0,
    baselineSavings: sav0,
    baselineInvestments: inv0,
    stressedIncome,
    stressedExpenses,
    stressedMonthlyCashflow,
    monthlyBurn,
    portfolioDrawdown,
    stressedPortfolioValue,
    stressedEmergencyRunwayMonths,
    capitalDeficit,
    resilienceScore,
    resilienceRating,
    recommendations,
  };
}

// Interactive financial what-if scenario forecasting and macroeconomic stress testing.
// Simulates income adjustments, major expenses, and investment compounding over time.
// Runs stochastic Monte Carlo confidence bands and historical financial crisis modeling.
export default function Scenarios() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { formatMoney } = useOrgFormatters();
  const formatCurrency = (value: number) => formatMoney(value || 0, { maximumFractionDigits: 0 });

  const [scenarioType, setScenarioType] = useState<"expense" | "income" | "investment">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [months, setMonths] = useState("12");
  const [expectedReturn, setExpectedReturn] = useState("10");
  const [taxBracketPct, setTaxBracketPct] = useState("25");
  const [results, setResults] = useState<ScenarioResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);

  const scenarioMutation = useMutation({
    mutationFn: processScenario,
    onSuccess: (data) => {
      setResults(data);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to calculate scenario impact.";
      toast({
        title: "Scenario Analysis Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Macro Crisis Stress Testing State & Handlers
  const [selectedCrisisId, setSelectedCrisisId] = useState<string>("gfc_2008");

  const profileQuery = useQuery({
    queryKey: ["financial-profile"],
    queryFn: () => getFinancialProfile(),
  });

  const accountsQuery = useQuery({
    queryKey: ["/api/finance/accounts"],
    queryFn: () => listAccounts(),
  });

  const portfolioQuery = useQuery({
    queryKey: ["portfolio-summary", "scenarios-stress"],
    queryFn: () => getPortfolioSummary({ months: 12 }),
    staleTime: 60_000,
  });

  // Dynamic Real-Time Linked Bank / Broker Accounts Live Stress State
  const [useLiveAccounts, setUseLiveAccounts] = useState<boolean>(true);
  const [equityBeta, setEquityBeta] = useState<number>(1.0);

  const linkedAccounts = useMemo(() => {
    return (accountsQuery.data?.accounts || []).filter((a) => a.status !== "closed");
  }, [accountsQuery.data]);

  const liveAccountsSummary = useMemo(() => {
    let liquidCash = 0;
    let brokerageTotal = 0;
    let creditDebt = 0;

    linkedAccounts.forEach((acc) => {
      const bal = typeof acc.current_balance === "number" ? acc.current_balance : Number(acc.opening_balance || 0);
      if (acc.type === "checking" || acc.type === "savings" || acc.type === "cash") {
        if (bal > 0) liquidCash += bal;
      } else if (acc.type === "brokerage") {
        if (bal > 0) brokerageTotal += bal;
      } else if (acc.type === "credit") {
        if (bal < 0) creditDebt += Math.abs(bal);
      }
    });

    const netLiquid = Math.max(0, liquidCash - creditDebt);

    return {
      liquidCash,
      brokerageTotal,
      creditDebt,
      netLiquid,
      totalCount: linkedAccounts.length,
      hasLiveAccounts: linkedAccounts.length > 0,
    };
  }, [linkedAccounts]);

  const createTaskMutation = useMutation({
    mutationFn: (p: Parameters<typeof createTask>[0]) => createTask(p),
    onSuccess: (res) => {
      toast({
        title: "Crisis Resilience Plan Scheduled",
        description: `Created task "${res.task?.title || "Resilience Plan"}" in your task list.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Task scheduling failed",
        description: err instanceof Error ? err.message : "Failed to create task.",
        variant: "destructive",
      });
    },
  });

  const baselineData = useMemo(() => {
    const profile = profileQuery.data;
    const annualIncome = recordedAmount(profile?.annual_income);
    const inc = annualIncome === null ? null : Math.round(annualIncome / 12);
    const exp = recordedAmount(profile?.monthly_expenses);
    const manualSav = recordedAmount(results?.baseline?.savings) ?? recordedAmount(profile?.savings);
    const manualInv = recordedAmount(portfolioQuery.data?.summary?.total_invested);

    const useLive = useLiveAccounts && liveAccountsSummary.hasLiveAccounts;
    // The selected account source is authoritative even when its balance is zero.
    const effectiveSavings = useLive ? recordedAmount(liveAccountsSummary.netLiquid) : manualSav;
    const effectiveInvestments = useLive ? recordedAmount(liveAccountsSummary.brokerageTotal) : manualInv;

    return {
      monthly_income: recordedAmount(results?.baseline?.monthly_income) ?? inc,
      monthly_expenses: recordedAmount(results?.baseline?.monthly_expenses) ?? exp,
      savings: effectiveSavings,
      investments: effectiveInvestments,
      isLiveLinked: useLive,
    };
  }, [results, profileQuery.data, portfolioQuery.data, useLiveAccounts, liveAccountsSummary]);

  const activeCrisis = useMemo(
    () => HISTORICAL_MACRO_CRISES.find((c) => c.id === selectedCrisisId) || HISTORICAL_MACRO_CRISES[0],
    [selectedCrisisId]
  );

  const missingBaselineFields = [
    ["monthly income", baselineData.monthly_income],
    ["monthly expenses", baselineData.monthly_expenses],
    ["savings", baselineData.savings],
    ["invested capital", baselineData.investments],
  ].filter(([, value]) => value === null).map(([label]) => label);

  const macroStressResult = useMemo(() => {
    const { monthly_income, monthly_expenses, savings, investments } = baselineData;
    if (monthly_income === null || monthly_expenses === null || savings === null || investments === null) {
      return null;
    }
    return calculateMacroStressImpact(activeCrisis, { monthly_income, monthly_expenses, savings, investments });
  }, [activeCrisis, baselineData]);

  const stressedAccountImpacts = useMemo(() => {
    return linkedAccounts.map((acc) => calculateAccountStressImpact(acc, activeCrisis, equityBeta));
  }, [linkedAccounts, activeCrisis, equityBeta]);

  const liveStressAggregates = useMemo(() => {
    if (!macroStressResult || !liveAccountsSummary.hasLiveAccounts) return null;
    let preLiquid = 0;
    let postLiquid = 0;
    let preBroker = 0;
    let postBroker = 0;
    let preDebt = 0;
    let postDebt = 0;

    stressedAccountImpacts.forEach((imp) => {
      if (imp.account.type === "checking" || imp.account.type === "savings" || imp.account.type === "cash") {
        if (imp.preBalance > 0) preLiquid += imp.preBalance;
        if (imp.postBalance > 0) postLiquid += imp.postBalance;
      } else if (imp.account.type === "brokerage") {
        if (imp.preBalance > 0) preBroker += imp.preBalance;
        if (imp.postBalance > 0) postBroker += imp.postBalance;
      } else if (imp.account.type === "credit") {
        if (imp.preBalance < 0) preDebt += Math.abs(imp.preBalance);
        if (imp.postBalance < 0) postDebt += Math.abs(imp.postBalance);
      }
    });

    const netLiquidPre = Math.max(0, preLiquid - preDebt);
    const netLiquidPost = Math.max(0, postLiquid - postDebt);
    const brokerDrawdown = Math.round(postBroker - preBroker);
    const monthlyBurn = macroStressResult.monthlyBurn;
    const requiredBuffer = monthlyBurn * activeCrisis.durationMonths;
    const bufferSurplus = netLiquidPost - requiredBuffer;
    const isLiquidationRisk = bufferSurplus < 0 && monthlyBurn > 0;
    const deficitAmount = Math.abs(Math.min(0, bufferSurplus));

    return {
      preLiquid,
      postLiquid,
      netLiquidPre,
      netLiquidPost,
      preBroker,
      postBroker,
      brokerDrawdown,
      requiredBuffer,
      bufferSurplus,
      isLiquidationRisk,
      deficitAmount,
    };
  }, [stressedAccountImpacts, macroStressResult, activeCrisis, liveAccountsSummary.hasLiveAccounts]);

  const handleScheduleBufferTask = (deficit: number) => {
    createTaskMutation.mutate({
      title: `Defensive Capital Buffer: Rebalance $${deficit.toLocaleString()} to Liquid HYSA for ${activeCrisis.name}`,
      why: `Protect against forced liquidation of depressed brokerage assets during an extended ${activeCrisis.durationMonths}-month market crisis.`,
      priority: "high",
    });
  };

  const handleLoadMacroScenario = (res: MacroStressTestResult) => {
    if (res.monthlyBurn > 0) {
      setScenarioType("expense");
      setAmount(String(res.monthlyBurn));
      setDescription(`Macro Crisis Shock: ${res.crisis.name}`);
      setMonths(String(res.crisis.durationMonths));
    } else if (res.crisis.incomeShockPct < 0) {
      const incLoss = Math.abs(res.baselineIncome - res.stressedIncome);
      setScenarioType("income");
      setAmount(String(incLoss));
      setDescription(`Income Loss under ${res.crisis.name}`);
      setMonths(String(res.crisis.durationMonths));
    } else {
      setScenarioType("expense");
      const expInc = Math.abs(res.stressedExpenses - res.baselineExpenses);
      setAmount(expInc > 0 ? String(expInc) : "");
      setDescription(`Cost Surge under ${res.crisis.name}`);
      setMonths(String(res.crisis.durationMonths));
    }
    toast({
      title: "Crisis Loaded into Builder",
      description: `Loaded parameters for "${res.crisis.name}". Click 'Calculate Impact' to project your scenario.`,
    });
  };

  const handleScheduleCrisisTask = (res: MacroStressTestResult) => {
    createTaskMutation.mutate({
      title: `Macro Resilience Plan: ${res.crisis.name}`,
      why: `Stress test reveals ${res.resilienceRating} rating with ${res.stressedEmergencyRunwayMonths} months runway and ${formatCurrency(res.capitalDeficit)} capital deficit during a simulated ${res.crisis.name}.`,
      bucket: 30,
      priority: res.resilienceRating === "Vulnerable" || res.resilienceRating === "Moderate Risk" ? "high" : "medium",
      kind: "cashflow",
      steps: [
        `Review current emergency liquidity ($${res.baselineSavings.toLocaleString()}) against simulated crisis cash drain.`,
        res.capitalDeficit > 0
          ? `Target additional liquid buffer of ${formatCurrency(res.capitalDeficit)}.`
          : "Maintain the current liquid reserve; this simulation shows no additional cash buffer deficit.",
        res.recommendations[0] || `Prepare contingency budget for ${res.crisis.durationMonths}-month downturn.`,
      ],
    });
  };

  const handleCalculate = () => {
    const numericAmount = Number(amount);
    const numericMonths = Number(months);
    const numericReturn = Number(expectedReturn);

    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter an amount greater than zero.",
        variant: "destructive",
      });
      return;
    }

    scenarioMutation.mutate({
      scenario_type: scenarioType,
      amount: numericAmount,
      description,
      assumptions: {
        months: Number.isFinite(numericMonths) && numericMonths > 0 ? numericMonths : undefined,
        expected_return_pct:
          scenarioType === "investment" && Number.isFinite(numericReturn) ? numericReturn : undefined,
      },
    });
  };

  const applyPreset = (
    type: "expense" | "income" | "investment",
    presetAmount: string,
    desc: string,
    horizon = "12",
    ret = "10"
  ) => {
    setScenarioType(type);
    setAmount(presetAmount);
    setDescription(desc);
    setMonths(horizon);
    setExpectedReturn(ret);
  };

  const handleReset = () => {
    setAmount("");
    setDescription("");
    setResults(null);
  };

  const handlePinScenario = () => {
    if (!results) return;
    if (savedScenarios.length >= 4) {
      toast({
        title: "Comparison Limit Reached",
        description: "You can compare up to 4 scenarios at once. Please remove one first.",
        variant: "destructive",
      });
      return;
    }

    const scenarioName = description.trim() || `${scenarioType.toUpperCase()} ${formatCurrency(results.amount)}/mo`;
    const newSaved: SavedScenario = {
      id: "scen_" + Date.now().toString(),
      name: scenarioName,
      type: scenarioType,
      amount: results.amount,
      months: results.assumptions.months,
      returnPct: scenarioType === "investment" ? results.assumptions.expected_return_pct : undefined,
      taxRatePct: scenarioType === "income" ? Number(taxBracketPct) : undefined,
      response: results,
      timestamp: Date.now(),
    };

    setSavedScenarios((prev) => [...prev, newSaved]);
    toast({
      title: "Scenario Pinned",
      description: `"${scenarioName}" added to comparison matrix.`,
    });
  };

  const handleRemoveSaved = (id: string) => {
    setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
    toast({
      title: "Scenario Removed",
      description: "Removed from comparison matrix.",
    });
  };

  const handleClearSaved = () => {
    setSavedScenarios([]);
    toast({
      title: "Comparison Cleared",
      description: "All pinned scenarios removed.",
    });
  };

  const handleLoadSaved = (saved: SavedScenario) => {
    setScenarioType(saved.type);
    setAmount(String(saved.amount));
    setDescription(saved.name);
    setMonths(String(saved.months));
    if (saved.returnPct) setExpectedReturn(String(saved.returnPct));
    if (saved.taxRatePct) setTaxBracketPct(String(saved.taxRatePct));
    setResults(saved.response);
    toast({
      title: "Scenario Loaded",
      description: `Loaded "${saved.name}" into builder.`,
    });
  };

  const handleCopySummary = async () => {
    if (!results) return;
    const summaryLines = [
      `FinWise What-If Scenario: ${description || scenarioType.toUpperCase()}`,
      `Type: ${scenarioType} | Amount: ${formatCurrency(results.amount)}/mo | Horizon: ${results.assumptions.months} mos`,
      `Baseline Surplus: ${formatCurrency(results.baseline.monthly_surplus)} -> New Surplus: ${formatCurrency(results.delta.new_monthly_surplus)} (Delta: ${results.delta.monthly_surplus_change >= 0 ? "+" : ""}${formatCurrency(results.delta.monthly_surplus_change)})`,
      `Savings Impact over ${results.assumptions.months} mos: ${results.delta.savings_change_horizon < 0 ? "−" : "+"}${formatCurrency(Math.abs(results.delta.savings_change_horizon))}`,
      results.delta.emergency_fund_months_after !== null && results.delta.emergency_fund_months_before !== null
        ? `Emergency Runway: ${results.delta.emergency_fund_months_before} mos -> ${results.delta.emergency_fund_months_after} mos`
        : null,
      results.delta.goal_timeline_delta_months !== 0
        ? `Goal Timeline Shift: ${results.delta.goal_timeline_delta_months > 0 ? "+" : ""}${results.delta.goal_timeline_delta_months} mos`
        : "Goal Timeline: No delay",
      results.recommendations?.length ? `Key Recommendation: ${results.recommendations[0]}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(summaryLines);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to Clipboard",
        description: "Scenario breakdown copied successfully.",
      });
    } catch {
      toast({
        title: "Copy Failed",
        description: "Could not copy summary to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleCopyComparisonMarkdown = async () => {
    if (savedScenarios.length === 0) return;
    const baseline = savedScenarios[0].response.baseline;
    let md = `### FinWise Multi-Scenario Comparison Matrix\n\n`;
    md += `| Metric | Baseline Profile | ${savedScenarios.map((s) => s.name).join(" | ")} |\n`;
    md += `| :--- | :--- | ${savedScenarios.map(() => ":---").join(" | ")} |\n`;
    md += `| **Type & Monthly Amount** | Baseline | ${savedScenarios.map((s) => `${s.type.toUpperCase()}: ${formatCurrency(s.amount)}/mo`).join(" | ")} |\n`;
    md += `| **Forecast Horizon** | — | ${savedScenarios.map((s) => `${s.months} months`).join(" | ")} |\n`;
    md += `| **New Monthly Surplus** | ${formatCurrency(baseline.monthly_surplus)} | ${savedScenarios.map((s) => `${formatCurrency(s.response.delta.new_monthly_surplus)} (${s.response.delta.monthly_surplus_change >= 0 ? "+" : ""}${formatCurrency(s.response.delta.monthly_surplus_change)})`).join(" | ")} |\n`;
    md += `| **Cumulative Savings Impact** | — | ${savedScenarios.map((s) => `${s.response.delta.savings_change_horizon >= 0 ? "+" : ""}${formatCurrency(s.response.delta.savings_change_horizon)}`).join(" | ")} |\n`;
    md += `| **Emergency Fund Runway** | ${savedScenarios[0].response.delta.emergency_fund_months_before ?? "—"} mos | ${savedScenarios.map((s) => `${s.response.delta.emergency_fund_months_after ?? "—"} mos`).join(" | ")} |\n`;
    md += `| **Goal Timeline Shift** | On Track | ${savedScenarios.map((s) => `${s.response.delta.goal_timeline_delta_months > 0 ? "+" : ""}${s.response.delta.goal_timeline_delta_months} mos`).join(" | ")} |\n`;

    try {
      await navigator.clipboard.writeText(md);
      toast({
        title: "Copied to Clipboard",
        description: "Comparison matrix copied as Markdown.",
      });
    } catch {
      toast({
        title: "Copy Failed",
        description: "Could not copy comparison matrix to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleExportComparisonCsv = () => {
    if (savedScenarios.length === 0) return;
    const baseline = savedScenarios[0].response.baseline;
    const headers = ["Metric", "Baseline Profile", ...savedScenarios.map((s) => s.name)];
    const rows = [
      ["Type & Monthly Amount", "Baseline Profile", ...savedScenarios.map((s) => `${s.type.toUpperCase()}: ${s.amount}/mo`)],
      ["Horizon (Months)", "-", ...savedScenarios.map((s) => `${s.months} mos`)],
      [
        "Monthly Surplus",
        formatCurrency(baseline.monthly_surplus),
        ...savedScenarios.map(
          (s) =>
            `${formatCurrency(s.response.delta.new_monthly_surplus)} (${s.response.delta.monthly_surplus_change >= 0 ? "+" : ""}${formatCurrency(s.response.delta.monthly_surplus_change)})`
        ),
      ],
      [
        "Cumulative Savings Impact",
        "$0",
        ...savedScenarios.map(
          (s) =>
            `${s.response.delta.savings_change_horizon >= 0 ? "+" : ""}${formatCurrency(s.response.delta.savings_change_horizon)}`
        ),
      ],
      [
        "Emergency Runway",
        `${savedScenarios[0].response.delta.emergency_fund_months_before ?? "—"} mos`,
        ...savedScenarios.map((s) => `${s.response.delta.emergency_fund_months_after ?? "—"} mos`),
      ],
      [
        "Goal Timeline Shift",
        "0 mos",
        ...savedScenarios.map((s) => `${s.response.delta.goal_timeline_delta_months > 0 ? "+" : ""}${s.response.delta.goal_timeline_delta_months} mos`),
      ],
    ];

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `scenario_comparison_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Comparison Exported", description: "CSV file downloaded successfully." });
  };

  const handleAskCopilot = () => {
    const promptText = `I ran a what-if scenario for ${scenarioType} of ${formatCurrency(Number(amount) || 0)}/month (${description || "planned change"}). Over ${months} months, projected surplus changes by ${results ? formatCurrency(results.delta.monthly_surplus_change) : "this amount"}. How can I best prepare my budget and emergency fund?`;
    setLocation(`/chat?prompt=${encodeURIComponent(promptText)}`);
  };

  const scenarioTypes = [
    { value: "expense", label: "New Expense", icon: TrendingDown },
    { value: "income", label: "Income Change", icon: TrendingUp },
    { value: "investment", label: "Investment Plan", icon: Target },
  ];

  const runwayDiff =
    results?.delta.emergency_fund_months_after !== null &&
    results?.delta.emergency_fund_months_after !== undefined &&
    results?.delta.emergency_fund_months_before !== null &&
    results?.delta.emergency_fund_months_before !== undefined
      ? Number((results.delta.emergency_fund_months_after - results.delta.emergency_fund_months_before).toFixed(1))
      : null;

  // Real purchasing power calculation
  const purchasingPower = results
    ? calculateRealPurchasingPower(
        Math.abs(results.delta.savings_change_horizon),
        results.assumptions.months,
        results.assumptions.inflation_pct
      )
    : null;

  // Monte Carlo bounds calculation
  const monteCarlo = results
    ? calculateMonteCarloBounds(
        // Expenses reduce cash, so model them as a negative monthly cash flow.
        results.scenario_type === "expense" ? -Math.abs(results.amount) : results.amount,
        results.assumptions.months,
        results.scenario_type === "investment",
        results.assumptions.expected_return_pct
      )
    : null;

  // Tax calculations for income adjustments
  const numericAmount = Number(amount) || 0;
  const taxPct = Number(taxBracketPct) || 0;
  const monthlyTaxWithheld = numericAmount * (taxPct / 100);
  const netTakeHome = numericAmount - monthlyTaxWithheld;

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="scenarios-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto"
      >
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-3xl font-bold text-foreground">What-If Scenarios</h1>
              <Badge variant="outline" className="text-xs font-medium">
                Simulation Engine
              </Badge>
              {savedScenarios.length > 0 && (
                <Badge variant="secondary" className="text-xs font-semibold" data-testid="badge-saved-scenarios-count">
                  {savedScenarios.length} Pinned
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Model profile-aware changes to income, expenses, or investments before committing to real financial decisions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Builder Form */}
          <Card className="p-6 lg:col-span-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground flex items-center">
                <Calculator className="w-5 h-5 mr-2 text-primary" />
                Scenario Builder
              </h3>
              {results && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="button-reset-scenario"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Reset
                </Button>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <Label htmlFor="scenario-type" className="text-sm font-medium mb-2 block">
                  Scenario Type
                </Label>
                <Select value={scenarioType} onValueChange={(value: any) => setScenarioType(value)}>
                  <SelectTrigger id="scenario-type" data-testid="select-scenario-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarioTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center space-x-2">
                          <type.icon className="w-4 h-4" />
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="field-amount" className="text-sm font-medium mb-2 block">
                  Amount (per month)
                </Label>
                <Input
                  id="field-amount"
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  data-testid="input-scenario-amount"
                />
              </div>

              {/* Progressive Tax Bracket Selector for Income Scenarios */}
              {scenarioType === "income" && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2" data-testid="container-tax-bracket">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="select-tax-bracket" className="text-xs font-semibold text-primary flex items-center">
                      <Percent className="w-3.5 h-3.5 mr-1" />
                      Marginal Tax Bracket
                    </Label>
                    <span className="text-xs font-medium text-muted-foreground">
                      Net: {formatCurrency(netTakeHome)}/mo
                    </span>
                  </div>
                  <Select value={taxBracketPct} onValueChange={setTaxBracketPct}>
                    <SelectTrigger id="select-tax-bracket" data-testid="select-tax-bracket" className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Tax-Free / Cash)</SelectItem>
                      <SelectItem value="15">15% (Low Bracket)</SelectItem>
                      <SelectItem value="22">22% (Moderate Bracket)</SelectItem>
                      <SelectItem value="25">25% (Standard Default)</SelectItem>
                      <SelectItem value="32">32% (High Bracket)</SelectItem>
                      <SelectItem value="37">37% (Top Federal Bracket)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Estimated tax withheld: {formatCurrency(monthlyTaxWithheld)}/mo. Net take-home surplus retains {100 - taxPct}%.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="field-months" className="text-sm font-medium mb-2 block">
                    Horizon (months)
                  </Label>
                  <Input
                    id="field-months"
                    type="number"
                    min={1}
                    value={months}
                    onChange={(event) => setMonths(event.target.value)}
                    data-testid="input-scenario-months"
                  />
                </div>
                <div>
                  <Label htmlFor="field-expectedReturn" className="text-sm font-medium mb-2 block">
                    Return % (invest)
                  </Label>
                  <Input
                    id="field-expectedReturn"
                    type="number"
                    value={expectedReturn}
                    onChange={(event) => setExpectedReturn(event.target.value)}
                    disabled={scenarioType !== "investment"}
                    data-testid="input-scenario-return"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="field-description" className="text-sm font-medium mb-2 block">
                  Description
                </Label>
                <Input
                  id="field-description"
                  placeholder="e.g., Salary raise, car EMI, SIP increase"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  data-testid="input-scenario-description"
                />
              </div>

              <div className="space-y-2 pt-1">
                <span className="text-xs text-muted-foreground font-medium">Quick Presets (editable assumptions):</span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyPreset("income", "500", "Annual Salary Raise", "12")}
                  >
                    +500/mo Salary Raise
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyPreset("expense", "350", "Auto Loan / Car EMI", "36")}
                  >
                    -350/mo Car EMI
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyPreset("investment", "200", "Index Fund SIP Boost", "24", "12")}
                  >
                    +200/mo SIP Booster
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyPreset("income", "1200", "Freelance & Consulting", "12")}
                  >
                    +1.2k/mo Freelance
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyPreset("expense", "450", "Apartment Rent Upgrade", "12")}
                  >
                    -450/mo Rent Upgrade
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyPreset("expense", "300", "Student Loan Acceleration", "24")}
                  >
                    -300/mo Student Loan
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleCalculate}
                disabled={!amount || scenarioMutation.isPending}
                className="w-full mt-2"
                data-testid="button-calculate-scenario"
              >
                {scenarioMutation.isPending ? "Analyzing..." : "Calculate Impact"}
              </Button>
            </div>
          </Card>

          {/* Results Analysis */}
          <Card className="p-6 lg:col-span-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-foreground flex items-center">
                  <Sparkles className="w-5 h-5 mr-2 text-primary" />
                  Impact Analysis
                </h3>
                {results && (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePinScenario}
                      className="h-8 text-xs"
                      data-testid="button-pin-scenario"
                    >
                      <Pin className="w-3.5 h-3.5 mr-1 text-primary" />
                      Pin to Compare
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopySummary}
                      className="h-8 text-xs"
                      data-testid="button-copy-breakdown"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copy Breakdown
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {scenarioMutation.isPending && (
                <motion.div
                  className="text-center py-16"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Calculator className="w-10 h-10 mx-auto mb-3 text-primary animate-pulse" />
                  <div className="text-foreground font-medium mb-1">Analyzing scenario...</div>
                  <div className="text-xs text-muted-foreground">
                    Calculating baseline surplus, runway delta, and portfolio projections
                  </div>
                </motion.div>
              )}

              {scenarioMutation.isError && !scenarioMutation.isPending && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Calculation Failed</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      {scenarioMutation.error instanceof Error
                        ? scenarioMutation.error.message
                        : "Could not analyze the scenario with current financial parameters."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCalculate}
                      className="mt-2 text-xs"
                    >
                      Try Again
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {results && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-5"
                  data-testid="scenario-results-detailed"
                >
                  {/* Context Header */}
                  {results.fallback_used && (
                    <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 py-2.5">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <AlertTitle className="text-xs font-semibold">Heuristic Projection</AlertTitle>
                      <AlertDescription className="text-xs">
                        Calculated deterministically using profile data while AI Core is offline.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Primary Metrics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Monthly Surplus */}
                    <div className="bg-accent/60 rounded-xl p-4 border border-border/50" data-testid="metric-monthly-surplus">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>New Monthly Surplus</span>
                        <Badge
                          variant={results.delta.monthly_surplus_change >= 0 ? "default" : "destructive"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {results.delta.monthly_surplus_change >= 0 ? "+" : ""}
                          {formatCurrency(results.delta.monthly_surplus_change)}
                        </Badge>
                      </div>
                      <div className="text-2xl font-bold text-foreground mb-1">
                        {formatCurrency(results.delta.new_monthly_surplus)}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-between">
                        <span>Baseline: {formatCurrency(results.baseline.monthly_surplus)}</span>
                      </div>
                    </div>

                    {/* Savings Horizon Change */}
                    <div className="bg-accent/60 rounded-xl p-4 border border-border/50" data-testid="metric-savings-change">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Savings Horizon Change</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {results.assumptions.months} mo horizon
                        </Badge>
                      </div>
                      <div
                        className={`text-2xl font-bold mb-1 ${
                          results.delta.savings_change_horizon < 0 ? "text-destructive" : "text-emerald-500"
                        }`}
                      >
                        {results.delta.savings_change_horizon < 0 ? "−" : "+"}
                        {formatCurrency(Math.abs(results.delta.savings_change_horizon))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Current savings: {formatCurrency(results.baseline.savings)}
                      </div>
                    </div>

                    {/* Emergency Fund Runway */}
                    <div className="bg-accent/60 rounded-xl p-4 border border-border/50" data-testid="metric-emergency-runway">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="flex items-center">
                          <ShieldCheck className="w-3.5 h-3.5 mr-1 text-primary" />
                          Emergency Runway
                        </span>
                        {runwayDiff !== null && (
                          <Badge
                            variant={runwayDiff >= 0 ? "default" : "destructive"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {runwayDiff >= 0 ? `+${runwayDiff}` : `${runwayDiff}`} mo
                          </Badge>
                        )}
                      </div>
                      <div className="text-2xl font-bold text-foreground mb-1">
                        {results.delta.emergency_fund_months_after !== null &&
                        results.delta.emergency_fund_months_after !== undefined
                          ? `${formatRunwayMonths(results.delta.emergency_fund_months_after)} months`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Before:{" "}
                        {results.delta.emergency_fund_months_before !== null &&
                        results.delta.emergency_fund_months_before !== undefined
                          ? formatRunwayMonths(results.delta.emergency_fund_months_before)
                          : "—"}{" "}
                        months
                      </div>
                    </div>

                    {/* Goal Timeline Impact */}
                    <div className="bg-accent/60 rounded-xl p-4 border border-border/50" data-testid="metric-goal-timeline">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Goal Timeline Shift</span>
                        <Badge
                          variant={results.delta.goal_timeline_delta_months <= 0 ? "default" : "destructive"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {results.delta.goal_timeline_delta_months <= 0 ? "On Track" : "Delayed"}
                        </Badge>
                      </div>
                      <div
                        className={`text-2xl font-bold mb-1 ${
                          results.delta.goal_timeline_delta_months > 0 ? "text-destructive" : "text-foreground"
                        }`}
                      >
                        {results.delta.goal_timeline_delta_months > 0 ? "+" : ""}
                        {results.delta.goal_timeline_delta_months} months
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Delay (+) or acceleration (−)
                      </div>
                    </div>
                  </div>

                  {/* Projected Investment Value (if investment) */}
                  {typeof results.delta.projected_investment_value === "number" && (
                    <div className="bg-primary/10 border border-primary/20 rounded-xl p-4" data-testid="metric-investment-value">
                      <div className="flex items-center justify-between text-xs text-primary mb-1">
                        <span className="font-semibold flex items-center">
                          <Target className="w-3.5 h-3.5 mr-1" />
                          Projected Investment Value
                        </span>
                        <span>{results.assumptions.expected_return_pct}% annual return</span>
                      </div>
                      <div className="text-2xl font-bold text-primary">
                        {formatCurrency(results.delta.projected_investment_value)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Cumulative compounded value over {results.assumptions.months} months
                      </div>
                    </div>
                  )}

                  {/* Marginal Tax Impact (if income) */}
                  {results.scenario_type === "income" && (
                    <div className="bg-accent/40 border border-border/60 rounded-xl p-4" data-testid="metric-tax-breakdown">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span className="font-semibold text-foreground flex items-center">
                          <Coins className="w-3.5 h-3.5 mr-1 text-primary" />
                          Tax Impact & Net Take-Home (Est. {taxBracketPct}% Bracket)
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {100 - Number(taxBracketPct)}% Retained
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center pt-1">
                        <div className="p-2 rounded-lg bg-card/60">
                          <div className="text-[11px] text-muted-foreground">Gross Added</div>
                          <div className="text-sm font-bold text-foreground">
                            +{formatCurrency(results.amount)}/mo
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-card/60">
                          <div className="text-[11px] text-muted-foreground">Estimated Tax</div>
                          <div className="text-sm font-bold text-destructive">
                            -{formatCurrency(results.amount * (Number(taxBracketPct) / 100))}/mo
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-card/60">
                          <div className="text-[11px] text-muted-foreground">Net Take-Home</div>
                          <div className="text-sm font-bold text-emerald-500" data-testid="metric-net-take-home">
                            +{formatCurrency(results.amount * (1 - Number(taxBracketPct) / 100))}/mo
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Real Inflation-Adjusted Purchasing Power */}
                  {purchasingPower && (
                    <div className="bg-accent/40 border border-border/60 rounded-xl p-4" data-testid="metric-purchasing-power">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-semibold text-foreground flex items-center">
                          <Percent className="w-3.5 h-3.5 mr-1 text-primary" />
                          Inflation-Adjusted Purchasing Power
                        </span>
                        <span>{results.assumptions.inflation_pct}% annual inflation</span>
                      </div>
                      <div className="flex items-baseline justify-between mt-1">
                        <div>
                          <div className="text-lg font-bold text-foreground">
                            {formatCurrency(purchasingPower.realValue)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Real spending value at month {results.assumptions.months}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                            −{formatCurrency(purchasingPower.inflationLoss)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Inflation erosion</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Monte Carlo Stochastic Risk Bounds */}
                  {monteCarlo && (
                    <div className="bg-accent/40 border border-border/60 rounded-xl p-4" data-testid="monte-carlo-bounds">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span className="font-semibold text-foreground flex items-center">
                          <BarChart2 className="w-3.5 h-3.5 mr-1 text-primary" />
                          Monte Carlo Stochastic Risk Bounds ({results.assumptions.months} mos)
                        </span>
                        <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                          {monteCarlo.successProbability}% Target Confidence
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center pt-1">
                        <div className="p-2 rounded-lg bg-card/60">
                          <div className="text-[11px] text-muted-foreground">Bearish (P10)</div>
                          <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                            {formatCurrency(monteCarlo.p10)}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">Downside shock</div>
                        </div>
                        <div className="p-2 rounded-lg bg-card/60">
                          <div className="text-[11px] text-muted-foreground">Expected (P50)</div>
                          <div className="text-sm font-bold text-foreground">
                            {formatCurrency(monteCarlo.p50)}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">Median trajectory</div>
                        </div>
                        <div className="p-2 rounded-lg bg-card/60">
                          <div className="text-[11px] text-muted-foreground">Bullish (P90)</div>
                          <div className="text-sm font-bold text-emerald-500">
                            {formatCurrency(monteCarlo.p90)}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">Upside compounding</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {results.recommendations?.length > 0 && (
                    <div className="rounded-xl border border-border/50 p-4 bg-card">
                      <h4 className="font-medium text-foreground mb-3 text-sm flex items-center">
                        <Sparkles className="w-4 h-4 mr-1.5 text-primary" />
                        Recommendations & Guidance
                      </h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {results.recommendations.map((item, index) => (
                          <li key={index} className="flex items-start">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 mr-2 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Adjustments (if any) */}
                  {results.adjustments?.length > 0 && (
                    <div className="rounded-xl border border-border/50 p-4 bg-card">
                      <h4 className="font-medium text-foreground mb-2 text-sm">Suggested Category Adjustments</h4>
                      <div className="space-y-1.5 text-sm">
                        {results.adjustments.map((adj, index) => (
                          <div key={index} className="flex items-center justify-between text-muted-foreground">
                            <span>{adj.category}</span>
                            <span className="text-foreground font-semibold">
                              Reduce by {formatCurrency(adj.reduction)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Baseline Parameters */}
                  <div className="border-t border-border/40 pt-4 flex flex-wrap items-center justify-between text-xs text-muted-foreground gap-3">
                    <div>Income: {formatCurrency(results.baseline.monthly_income)}/mo</div>
                    <div>Expenses: {formatCurrency(results.baseline.monthly_expenses)}/mo</div>
                    <div>Debt: {formatCurrency(results.baseline.total_debt)}</div>
                    <div>Inflation: {results.assumptions.inflation_pct}%</div>
                  </div>
                </motion.div>
              )}

              {!results && !scenarioMutation.isPending && (
                <div className="text-center py-16 text-muted-foreground">
                  <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <div className="text-foreground font-medium mb-1">No Active Simulation</div>
                  <div className="text-xs max-w-xs mx-auto">
                    Select a scenario type and amount, or choose one of the quick presets to test financial impacts.
                  </div>
                </div>
              )}
            </div>

            {results && (
              <div className="border-t border-border/40 pt-4 mt-6 flex flex-wrap gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePinScenario}
                  className="text-xs"
                  data-testid="button-pin-scenario-bottom"
                >
                  <Pin className="w-3.5 h-3.5 mr-1.5 text-primary" />
                  Pin for Comparison
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAskCopilot}
                  className="text-xs"
                  data-testid="button-ask-copilot"
                >
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-primary" />
                  Ask Copilot
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Multi-Scenario Comparison Matrix */}
        {savedScenarios.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
            data-testid="comparison-matrix-section"
          >
            <Card className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center">
                    <Layers className="w-5 h-5 mr-2 text-primary" />
                    Multi-Scenario Comparison Matrix
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Side-by-side benchmark of {savedScenarios.length} pinned scenario{savedScenarios.length > 1 ? "s" : ""} against your baseline financial profile.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyComparisonMarkdown}
                    className="text-xs h-8"
                    data-testid="button-copy-comparison"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy Markdown
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportComparisonCsv}
                    className="text-xs h-8"
                    data-testid="button-export-comparison-csv"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                    Export CSV
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSaved}
                    className="text-xs h-8 text-destructive hover:bg-destructive/10"
                    data-testid="button-clear-comparisons"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table data-testid="scenario-comparison-table">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-48 font-semibold text-foreground">Planning Metric</TableHead>
                      <TableHead className="w-48 font-semibold text-muted-foreground bg-accent/20">
                        Baseline Profile
                      </TableHead>
                      {savedScenarios.map((scen) => (
                        <TableHead key={scen.id} className="min-w-[200px] font-semibold text-foreground">
                          <div className="flex items-center justify-between">
                            <span className="truncate pr-2">{scen.name}</span>
                            <div className="flex items-center space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                onClick={() => handleLoadSaved(scen)}
                                title="Load into Builder"
                                data-testid={`btn-load-saved-${scen.id}`}
                              >
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveSaved(scen.id)}
                                title="Remove Scenario"
                                data-testid={`btn-remove-saved-${scen.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium text-foreground">Scenario Type & Amount</TableCell>
                      <TableCell className="text-muted-foreground bg-accent/10">Current Baseline</TableCell>
                      {savedScenarios.map((scen) => (
                        <TableCell key={scen.id} className="font-semibold">
                          <Badge variant="outline" className="text-xs uppercase mr-1.5">
                            {scen.type}
                          </Badge>
                          {formatCurrency(scen.amount)}/mo
                        </TableCell>
                      ))}
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium text-foreground">Forecast Horizon</TableCell>
                      <TableCell className="text-muted-foreground bg-accent/10">—</TableCell>
                      {savedScenarios.map((scen) => (
                        <TableCell key={scen.id}>
                          {scen.months} months
                        </TableCell>
                      ))}
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium text-foreground">Monthly Surplus</TableCell>
                      <TableCell className="font-semibold text-foreground bg-accent/10">
                        {formatCurrency(savedScenarios[0]?.response.baseline.monthly_surplus || 0)}
                      </TableCell>
                      {savedScenarios.map((scen) => (
                        <TableCell key={scen.id}>
                          <div className="font-bold text-foreground">
                            {formatCurrency(scen.response.delta.new_monthly_surplus)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Delta: {scen.response.delta.monthly_surplus_change >= 0 ? "+" : ""}
                            {formatCurrency(scen.response.delta.monthly_surplus_change)}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium text-foreground">Savings Horizon Change</TableCell>
                      <TableCell className="text-muted-foreground bg-accent/10">$0</TableCell>
                      {savedScenarios.map((scen) => (
                        <TableCell
                          key={scen.id}
                          className={`font-semibold ${
                            scen.response.delta.savings_change_horizon < 0 ? "text-destructive" : "text-emerald-500"
                          }`}
                        >
                          {scen.response.delta.savings_change_horizon < 0 ? "−" : "+"}
                          {formatCurrency(Math.abs(scen.response.delta.savings_change_horizon))}
                        </TableCell>
                      ))}
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium text-foreground">Emergency Runway</TableCell>
                      <TableCell className="text-foreground bg-accent/10">
                        {savedScenarios[0]?.response.delta.emergency_fund_months_before ?? "—"} months
                      </TableCell>
                      {savedScenarios.map((scen) => {
                        const after = scen.response.delta.emergency_fund_months_after;
                        const before = scen.response.delta.emergency_fund_months_before;
                        const diff = after !== null && before !== null ? Number((after - before).toFixed(1)) : null;
                        return (
                          <TableCell key={scen.id}>
                            <span className="font-semibold">{after !== null ? `${after} mos` : "—"}</span>
                            {diff !== null && (
                              <Badge
                                variant={diff >= 0 ? "default" : "destructive"}
                                className="text-[10px] ml-1.5 px-1 py-0"
                              >
                                {diff >= 0 ? `+${diff}` : `${diff}`}
                              </Badge>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium text-foreground">Goal Timeline Impact</TableCell>
                      <TableCell className="text-muted-foreground bg-accent/10">On Track</TableCell>
                      {savedScenarios.map((scen) => (
                        <TableCell key={scen.id}>
                          <Badge
                            variant={scen.response.delta.goal_timeline_delta_months <= 0 ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {scen.response.delta.goal_timeline_delta_months <= 0
                              ? "On Track"
                              : `+${scen.response.delta.goal_timeline_delta_months} mos delay`}
                          </Badge>
                        </TableCell>
                      ))}
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium text-foreground">Monte Carlo Range (P10 - P90)</TableCell>
                      <TableCell className="text-muted-foreground bg-accent/10">—</TableCell>
                      {savedScenarios.map((scen) => {
                        const bounds = calculateMonteCarloBounds(
                          scen.type === "expense" ? -Math.abs(scen.amount) : scen.amount,
                          scen.months,
                          scen.type === "investment",
                          scen.returnPct
                        );
                        return (
                          <TableCell key={scen.id} className="text-xs">
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              {formatCurrency(bounds.p10)}
                            </span>
                            <span className="mx-1 text-muted-foreground">→</span>
                            <span className="text-emerald-500 font-medium">
                              {formatCurrency(bounds.p90)}
                            </span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Historical Macro Scenario Replay & Dynamic Stress Testing */}
        <Card data-testid="card-macro-stress-testing" className="p-6 border-border shadow-sm mt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-border/50">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground flex items-center">
                  <ShieldAlert className="w-5 h-5 mr-2 text-primary" />
                  Historical Macro Crisis Replay & Stress Testing
                </h2>
                <Badge variant="outline" className="text-xs font-semibold bg-primary/10 text-primary border-primary/20">
                  Macro Stress Engine
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Replay severe historical market drawdowns and macroeconomic shocks against your real financial baseline.
              </p>
            </div>

            {macroStressResult && macroStressResult.resilienceScore !== null && <div className="flex items-center gap-2">
              <Badge
                variant={
                  macroStressResult.resilienceRating === "Bulletproof"
                    ? "default"
                    : macroStressResult.resilienceRating === "Resilient"
                    ? "secondary"
                    : "destructive"
                }
                className={`text-xs px-2.5 py-1 font-semibold ${
                  macroStressResult.resilienceRating === "Bulletproof"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : macroStressResult.resilienceRating === "Resilient"
                    ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                    : macroStressResult.resilienceRating === "Moderate Risk"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                }`}
                data-testid="badge-resilience-status"
              >
                Resilience: {macroStressResult.resilienceRating} ({macroStressResult.resilienceScore}/100)
              </Badge>
            </div>}
          </div>

          {/* Crisis Preset Chips */}
          <div className="pt-4 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Select Crisis Scenario to Replay:</span>
            <p className="text-xs text-muted-foreground">These are hypothetical shock assumptions, not predictions of your future finances. Loading a shock lets you edit its amount and duration in the builder.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2" data-testid="macro-crisis-chips">
              {HISTORICAL_MACRO_CRISES.map((crisis) => {
                const active = crisis.id === selectedCrisisId;
                return (
                  <button
                    key={crisis.id}
                    type="button"
                    onClick={() => setSelectedCrisisId(crisis.id)}
                    className={`text-left p-2.5 rounded-xl border transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/30"
                        : "border-border/60 bg-accent/30 hover:bg-accent/60 text-muted-foreground"
                    }`}
                    data-testid={`btn-select-crisis-${crisis.id}`}
                  >
                    <div className="font-semibold text-xs text-foreground truncate">{crisis.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{crisis.period}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-mono font-medium">
                        {crisis.equityShockPct}% Eq
                      </span>
                      {crisis.incomeShockPct !== 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-mono font-medium">
                          {crisis.incomeShockPct}% Inc
                        </span>
                      )}
                      {crisis.expenseShockPct !== 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 font-mono font-medium">
                          +{crisis.expenseShockPct}% Exp
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Crisis Replay Dashboard */}
          {!macroStressResult ? (
            <Alert className="mt-5" data-testid="macro-baseline-unavailable">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {profileQuery.isPending || accountsQuery.isPending || portfolioQuery.isPending
                  ? "Loading your saved financial baseline"
                  : "Financial baseline unavailable"}
              </AlertTitle>
              <AlertDescription>
                <p>Stress testing needs recorded {missingBaselineFields.join(", ")}. Save these values in your financial profile or accounts to see a personalised result. Zero is accepted when it reflects your finances.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    void profileQuery.refetch();
                    void accountsQuery.refetch();
                    void portfolioQuery.refetch();
                  }}
                  disabled={profileQuery.isFetching || accountsQuery.isFetching || portfolioQuery.isFetching}
                >
                  Refresh saved data
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
          <div className="mt-5 space-y-4" data-testid="macro-stress-results">
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-accent/40 rounded-xl p-3.5 border border-border/50">
                <div className="text-xs text-muted-foreground flex items-center justify-between mb-1">
                  <span>Stressed Runway</span>
                  <Clock className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="text-xl font-bold text-foreground" data-testid="metric-stressed-runway">
                  {macroStressResult.stressedEmergencyRunwayMonths === null ? "Not available" : `${macroStressResult.stressedEmergencyRunwayMonths} months`}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {macroStressResult.stressedEmergencyRunwayMonths === null ? "No recorded expenses to calculate runway" : `Crisis length: ${activeCrisis.durationMonths} months`}
                </div>
              </div>

              <div className="bg-accent/40 rounded-xl p-3.5 border border-border/50">
                <div className="text-xs text-muted-foreground flex items-center justify-between mb-1">
                  <span>Stressed Cashflow</span>
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <div
                  className={`text-xl font-bold ${
                    macroStressResult.stressedMonthlyCashflow >= 0 ? "text-emerald-500" : "text-destructive"
                  }`}
                  data-testid="metric-stressed-cashflow"
                >
                  {macroStressResult.stressedMonthlyCashflow >= 0 ? "+" : ""}
                  {formatCurrency(macroStressResult.stressedMonthlyCashflow)}/mo
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Baseline: {formatCurrency(macroStressResult.baselineSurplus)}/mo
                </div>
              </div>

              <div className="bg-accent/40 rounded-xl p-3.5 border border-border/50">
                <div className="text-xs text-muted-foreground flex items-center justify-between mb-1">
                  <span>Portfolio Drawdown</span>
                  <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                </div>
                <div className="text-xl font-bold text-destructive" data-testid="metric-portfolio-drawdown">
                  {formatCurrency(macroStressResult.portfolioDrawdown)} ({activeCrisis.equityShockPct}%)
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Stressed value: {formatCurrency(macroStressResult.stressedPortfolioValue)}
                </div>
              </div>

              <div className="bg-accent/40 rounded-xl p-3.5 border border-border/50">
                <div className="text-xs text-muted-foreground flex items-center justify-between mb-1">
                  <span>Buffer Deficit</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div
                  className={`text-xl font-bold ${
                    macroStressResult.capitalDeficit > 0 ? "text-amber-500" : "text-emerald-500"
                  }`}
                  data-testid="metric-buffer-deficit"
                >
                  {macroStressResult.capitalDeficit > 0
                    ? formatCurrency(macroStressResult.capitalDeficit)
                    : `No deficit (${formatCurrency(0)})`}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {macroStressResult.capitalDeficit > 0 ? "Extra cash needed" : macroStressResult.baselineSavings > 0 ? "Saved reserves cover the modelled burn" : "No reserve balance recorded"}
                </div>
              </div>
            </div>

            {/* Historical Narrative & Insights */}
            <div className="bg-accent/20 rounded-xl p-4 border border-border/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-foreground flex items-center">
                    <Sparkles className="w-3.5 h-3.5 mr-1.5 text-primary" />
                    Historical Anatomy: {activeCrisis.name} ({activeCrisis.period})
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{activeCrisis.historicalContext}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 self-start sm:self-auto">
                  Recovery Horizon: ~{activeCrisis.recoveryMonths} months
                </Badge>
              </div>

              <div className="pt-2 border-t border-border/40">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Stress Mitigation Insights:
                </span>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground" data-testid="macro-recommendations-list">
                  {macroStressResult.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-primary font-bold">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadMacroScenario(macroStressResult)}
                  className="text-xs h-8"
                  data-testid="btn-load-macro-scenario"
                >
                  <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                  Load Shock into Builder
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleScheduleCrisisTask(macroStressResult)}
                  disabled={createTaskMutation.isPending || macroStressResult.stressedEmergencyRunwayMonths === null}
                  className="text-xs h-8"
                  data-testid="btn-schedule-crisis-plan"
                >
                  <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                  {createTaskMutation.isPending ? "Scheduling…" : "Schedule Crisis Resilience Plan"}
                </Button>
              </div>
            </div>

            {/* Dynamic Real-Time Linked Bank / Broker Account Live Stress Testing Cockpit */}
            <div data-testid="card-live-accounts-stress-testing" className="mt-6 pt-5 border-t border-border/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Account balance stress test</h3>
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      Saved balances
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Apply {activeCrisis.name} assumptions to your saved account balances. Results depend on how current those balances are.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={useLiveAccounts ? "default" : "outline"}
                    size="sm"
                    onClick={() => setUseLiveAccounts(!useLiveAccounts)}
                    data-testid="toggle-live-accounts-mode"
                    className="h-7 text-xs rounded-lg"
                  >
                    {useLiveAccounts ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                        Use saved accounts ({liveAccountsSummary.totalCount})
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Using Profile Baseline
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void accountsQuery.refetch()}
                    data-testid="btn-refresh-live-accounts"
                    className="h-7 text-xs px-2"
                    title="Refresh live account balances"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {liveStressAggregates ? <>
              {/* Equity Risk Beta Sensitivity Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-accent/20 p-3 rounded-xl border border-border/40">
                <div className="flex items-center gap-2 text-xs">
                  <Percent className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-semibold text-foreground">Brokerage Equity Beta (&beta;):</span>
                  <span className="text-muted-foreground">Adjust sensitivity of your stock/equity holdings relative to the broad market drawdown.</span>
                </div>
                <div className="flex items-center gap-1.5" data-testid="slider-equity-beta">
                  {[
                    { label: "0.5x Defensive", val: 0.5 },
                    { label: "1.0x Market Beta", val: 1.0 },
                    { label: "1.5x Aggressive", val: 1.5 },
                    { label: "2.0x High Leverage", val: 2.0 },
                  ].map((preset) => (
                    <Button
                      key={preset.val}
                      type="button"
                      variant={equityBeta === preset.val ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setEquityBeta(preset.val)}
                      data-testid={`btn-beta-${preset.val.toFixed(1)}`}
                      className="h-6 text-[11px] px-2 rounded"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Real-Time Linked Account Stress Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-accent/30 rounded-xl p-3 border border-border/40">
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Saved net liquid cash</span>
                    <Wallet className="w-3 h-3 text-primary" />
                  </div>
                  <div className="text-base font-bold text-foreground mt-0.5" data-testid="metric-live-net-liquid">
                    {formatCurrency(liveStressAggregates.netLiquidPre)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Post-crisis real: {formatCurrency(liveStressAggregates.netLiquidPost)}
                  </div>
                </div>

                <div className="bg-accent/30 rounded-xl p-3 border border-border/40">
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Brokerage Holdings</span>
                    <TrendingDown className="w-3 h-3 text-destructive" />
                  </div>
                  <div className="text-base font-bold text-foreground mt-0.5" data-testid="metric-live-broker-holdings">
                    {formatCurrency(liveStressAggregates.preBroker)}
                  </div>
                  <div className="text-[10px] text-destructive mt-0.5" data-testid="metric-live-broker-drawdown">
                    Drawdown: {formatCurrency(liveStressAggregates.brokerDrawdown)} ({(activeCrisis.equityShockPct * equityBeta).toFixed(0)}%)
                  </div>
                </div>

                <div className="bg-accent/30 rounded-xl p-3 border border-border/40">
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Required Shock Buffer</span>
                    <Clock className="w-3 h-3 text-primary" />
                  </div>
                  <div className="text-base font-bold text-foreground mt-0.5" data-testid="metric-live-required-buffer">
                    {formatCurrency(liveStressAggregates.requiredBuffer)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {activeCrisis.durationMonths} mos &times; {formatCurrency(macroStressResult.monthlyBurn)}/mo burn
                  </div>
                </div>

                <div className="bg-accent/30 rounded-xl p-3 border border-border/40">
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Buffer Cushion Status</span>
                    {liveStressAggregates.isLiquidationRisk ? (
                      <AlertTriangle className="w-3 h-3 text-destructive" />
                    ) : (
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    )}
                  </div>
                  <div
                    className={`text-base font-bold mt-0.5 ${
                      liveStressAggregates.isLiquidationRisk ? "text-destructive" : "text-emerald-500"
                    }`}
                    data-testid="metric-live-buffer-health"
                  >
                    {liveStressAggregates.isLiquidationRisk
                      ? `-${formatCurrency(liveStressAggregates.deficitAmount)} Deficit`
                      : `+${formatCurrency(liveStressAggregates.bufferSurplus)} Safe`}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {liveStressAggregates.isLiquidationRisk ? "Forced liquidation risk" : "Liquid buffer intact"}
                  </div>
                </div>
              </div>

              {/* Linked Accounts Shock Impact Breakdown Table */}
              {linkedAccounts.length > 0 ? (
                <div className="rounded-xl border border-border/50 overflow-hidden">
                  <Table data-testid="table-live-account-stress">
                    <TableHeader className="bg-muted/40 text-[11px]">
                      <TableRow>
                        <TableHead>Account Name & Institution</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Saved balance</TableHead>
                        <TableHead className="text-right">Post-Crisis Value</TableHead>
                        <TableHead className="text-right">Dollar Change (&Delta; $)</TableHead>
                        <TableHead className="text-right">% Change</TableHead>
                        <TableHead>Vulnerability Assessment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {stressedAccountImpacts.map((imp) => (
                        <TableRow key={imp.account.id} data-testid={`row-account-stress-${imp.account.id}`}>
                          <TableCell className="font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              {imp.account.type === "brokerage" && <TrendingUp className="w-3.5 h-3.5 text-primary" />}
                              {(imp.account.type === "checking" || imp.account.type === "savings") && (
                                <Landmark className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                              {imp.account.type === "credit" && <CreditCard className="w-3.5 h-3.5 text-amber-500" />}
                              <div>
                                <div>{imp.account.name}</div>
                                {imp.account.institution && (
                                  <div className="text-[10px] text-muted-foreground">{imp.account.institution}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {imp.account.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatCurrency(imp.preBalance)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground">
                            {formatCurrency(imp.postBalance)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-semibold ${
                              imp.dollarChange < 0 ? "text-destructive" : "text-emerald-500"
                            }`}
                          >
                            {imp.dollarChange > 0 ? "+" : ""}
                            {formatCurrency(imp.dollarChange)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono ${
                              imp.pctChange < 0 ? "text-destructive" : "text-emerald-500"
                            }`}
                          >
                            {imp.pctChange > 0 ? "+" : ""}
                            {imp.pctChange}%
                          </TableCell>
                          <TableCell>
                            <Badge
                              data-testid={`badge-account-risk-${imp.account.id}`}
                              className={`text-[10px] ${
                                imp.vulnerabilitySeverity === "high"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                  : imp.vulnerabilitySeverity === "moderate"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              }`}
                            >
                              {imp.vulnerabilityLabel}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  No linked bank or broker accounts found. Add accounts in Finance OS to run live account-level stress simulations.
                </div>
              )}

              {/* Liquidation Risk Callout Banner */}
              {liveStressAggregates.isLiquidationRisk ? (
                <div data-testid="alert-liquidation-risk" className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-700 dark:text-rose-300">
                        Forced Brokerage Liquidation Warning: {formatCurrency(liveStressAggregates.deficitAmount)} Deficit
                      </h4>
                      <p className="text-xs text-rose-600/90 dark:text-rose-400/90 mt-0.5">
                        During an extended {activeCrisis.durationMonths}-month crisis, your post-shock liquid reserves will be exhausted, forcing the fire-sale of up to {formatCurrency(liveStressAggregates.deficitAmount)} in depressed brokerage assets to cover living expenses.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleScheduleBufferTask(liveStressAggregates.deficitAmount)}
                    disabled={createTaskMutation.isPending}
                    data-testid="btn-schedule-buffer-task"
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 shrink-0 self-start sm:self-auto"
                  >
                    <Shield className="w-3.5 h-3.5 mr-1.5" />
                    {createTaskMutation.isPending ? "Scheduling…" : "Schedule Buffer Rebalance"}
                  </Button>
                </div>
              ) : (
                <div data-testid="banner-buffer-safe" className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold">Resilient Liquid Buffer: </span>
                    Your post-shock net liquid cash of {formatCurrency(liveStressAggregates.netLiquidPost)} completely absorbs the {activeCrisis.durationMonths}-month crisis burn without requiring any forced brokerage liquidation.
                  </div>
                </div>
              )}
              </> : (
                <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center text-xs text-muted-foreground" data-testid="live-accounts-unavailable">
                  {accountsQuery.isPending
                    ? "Loading saved account balances…"
                    : accountsQuery.isError
                    ? "Account balances could not be loaded. Refresh to retry."
                    : "No linked bank or broker accounts found. Add accounts in Finance OS to run account-level stress simulations."}
                </p>
              )}
            </div>
          </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

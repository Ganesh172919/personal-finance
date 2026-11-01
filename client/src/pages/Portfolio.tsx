/**
 * @fileoverview Investment portfolio dashboard with holdings, charts, and AI analysis.
 *
 * Displays the user's investment portfolio across three tabs:
 * - Holdings: table of individual investment transactions with totals.
 * - Performance: line chart of portfolio value over time and pie chart
 *   of asset allocation by investment type.
 * - AI Analysis: markdown-rendered insights from the investment advisor
 *   agent, fetched from agent outputs.
 *
 * Key data flows:
 * - getTransactions({ type: "investment" }) provides raw holdings data.
 * - getPortfolioSummary({ months: 12 }) returns aggregated performance
 *   and allocation breakdowns for the Recharts visualizations.
 * - Agent outputs are fetched via apiClient for the AI analysis tab.
 *
 * An "Add Investment" dialog allows manual entry of new investment
 * transactions, which invalidate the relevant queries on success.
 *
 * Accessible from the sidebar under "Portfolio" for authenticated users.
 */

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  TrendingUp,
  Plus,
  Target,
  Loader2,
  Wand2,
  Briefcase,
  Scale,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/useToast";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import {
  ApiError,
  apiClient,
  createTask,
  createTransaction,
  getPortfolioSummary,
  getTransactions,
  PortfolioSummaryResponse,
} from "@/lib/apiClient";
import { IAgentOutput, IFinancialProfile } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type TargetAllocationModel = {
  id: string;
  name: string;
  description: string;
  targets: Record<string, number>;
};

export const TARGET_ALLOCATION_PRESETS: TargetAllocationModel[] = [
  {
    id: "moderate",
    name: "Moderate (60/40)",
    description: "Balanced growth and volatility dampening for medium-to-long term wealth.",
    targets: { Equity: 60, Debt: 30, Commodity: 10 },
  },
  {
    id: "aggressive",
    name: "Aggressive (80/20)",
    description: "Capital appreciation oriented for long horizons (>7 years) with high risk tolerance.",
    targets: { Equity: 80, Debt: 15, Commodity: 5 },
  },
  {
    id: "conservative",
    name: "Conservative (Preservation)",
    description: "Capital preservation and yield focus for capital safety and short-to-medium horizons.",
    targets: { Equity: 30, Debt: 55, Commodity: 10, Cash: 5 },
  },
  {
    id: "all_weather",
    name: "All-Weather (Dalio)",
    description: "Weather all economic seasons through risk-parity across equity, debt, and commodities.",
    targets: { Equity: 30, Debt: 55, Commodity: 15 },
  },
];

export const normalizeAssetClassName = (raw: string): string => {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("debt") || lower.includes("bond") || lower.includes("treasury")) return "Debt";
  if (lower.includes("gold") || lower.includes("commodity") || lower.includes("silver")) return "Commodity";
  if (lower.includes("crypto") || lower.includes("bitcoin") || lower.includes("btc") || lower.includes("eth")) return "Crypto";
  if (lower.includes("cash") || lower.includes("liquid") || lower.includes("money market")) return "Cash";
  return "Equity";
};

const COMMON_INVESTMENT_PRESETS = [
  { name: "S&P 500 Index Fund", type: "Equity" },
  { name: "Total Stock Market", type: "Equity" },
  { name: "US Treasury Bonds", type: "Debt" },
  { name: "Gold ETF", type: "Commodity" },
  { name: "Bitcoin", type: "Crypto" },
];

const AMOUNT_BOOSTERS = [100, 500, 1000, 5000];

export default function Portfolio() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id || localStorage.getItem("userId");
  const { toast } = useToast();
  const { formatMoney, currency } = useOrgFormatters();
  const formatCurrency = (value: number) => formatMoney(value);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    try {
      return localStorage.getItem("finwise_portfolio_model") || "moderate";
    } catch {
      return "moderate";
    }
  });
  const [rebalanceMode, setRebalanceMode] = useState<"inflow" | "full">("inflow");
  const [inflowAmount, setInflowAmount] = useState<number>(1000);
  const [isRecordDividendOpen, setIsRecordDividendOpen] = useState(false);
  const [dripHorizonYears, setDripHorizonYears] = useState<5 | 10 | 20>(10);
  const [newDividend, setNewDividend] = useState({
    holdingName: "",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    reinvest: false,
  });
  const [newInvestment, setNewInvestment] = useState({
    name: "",
    type: "Equity", 
    amount: 0,
    date: new Date().toISOString().split('T')[0], 
  });

  // Query 1: Get investment transactions (for holdings and performance)
  const { data: investmentTxData, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["/api/transactions", "investment"],
    queryFn: () => getTransactions({ page: 1, limit: 100, type: "investment" }),
  });

  const { data: portfolioSummaryData } = useQuery<PortfolioSummaryResponse>({
    queryKey: ["/api/portfolio/summary", 12],
    queryFn: () => getPortfolioSummary({ months: 12 }),
  });

  // Query 2: Get AI insights for the 'Analysis' tab
  const { data: insights, isLoading: isLoadingInsights } = useQuery<IAgentOutput[]>({
    queryKey: [`/api/agent-outputs/user`, userId],
    queryFn: () => apiClient<IAgentOutput[]>(`/agent-outputs/user/${encodeURIComponent(String(userId))}`),
    enabled: !!userId,
  });

  const addInvestmentMutation = useMutation({
    mutationFn: async (investment: typeof newInvestment) => {
      return apiClient<IFinancialProfile>(`/financial-profiles/investments`, {
        method: "POST",
        body: JSON.stringify({
          name: investment.name,
          type: investment.type,
          amount: investment.amount,
          date: investment.date,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Investment Added",
        description: "Your investment has been recorded successfully.",
      });
      setIsAddDialogOpen(false);
      setNewInvestment({ name: "", type: "Equity", amount: 0, date: new Date().toISOString().split('T')[0] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
    },
    onError: (error: unknown) => {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message =
        error instanceof Error ? error.message : "Failed to add investment. Please try again.";
      toast({
        title: "Error",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createTask>[0]) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task Scheduled",
        description: "Portfolio rebalancing action plan added to your Tasks workspace.",
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to create task.";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const recordDividendMutation = useMutation({
    mutationFn: async (payload: typeof newDividend) => {
      // 1. Record income transaction for the dividend payout
      await createTransaction({
        amount: payload.amount,
        category: "Investments",
        description: `${payload.holdingName.trim()} Dividend`,
        type: "income",
        date: payload.date,
      });

      // 2. If DRIP is enabled, automatically create matching investment transaction
      if (payload.reinvest) {
        await createTransaction({
          amount: payload.amount,
          category: "Investments",
          description: `${payload.holdingName.trim()} DRIP Reinvestment`,
          type: "investment",
          date: payload.date,
        });
      }
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Dividend Payout Recorded 💰",
        description: variables.reinvest
          ? `Recorded ${formatCurrency(variables.amount)} dividend and executed DRIP reinvestment into ${variables.holdingName}.`
          : `Recorded ${formatCurrency(variables.amount)} dividend payout from ${variables.holdingName}.`,
      });
      setIsRecordDividendOpen(false);
      setNewDividend({
        holdingName: "",
        amount: 0,
        date: new Date().toISOString().split("T")[0],
        reinvest: false,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
    },
    onError: (error: unknown) => {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "Failed to record dividend.";
      toast({
        title: "Error",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    },
  });

  const handleAddInvestment = () => {
    if (!newInvestment.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter an investment name.",
        variant: "destructive",
      });
      return;
    }
    if (!newInvestment.amount || newInvestment.amount <= 0) {
      toast({
        title: "Validation Error",
        description: "Investment amount must be greater than zero.",
        variant: "destructive",
      });
      return;
    }
    addInvestmentMutation.mutate(newInvestment);
  };

  const portfolioData = useMemo(() => {
  if (portfolioSummaryData) {
    return {
      totalValue: Number(portfolioSummaryData.summary.total_invested || 0),
      dynamicHoldings: (portfolioSummaryData.holdings || []).map(holding => ({
        name: holding.name,
        type: holding.asset_class,
        amount: Number(holding.invested_amount || 0),
      })),
      dynamicAllocations: (portfolioSummaryData.allocations || [])
        .map(alloc => ({
          name: alloc.name,
          value: Number(alloc.percentage || 0),
          color:
            alloc.name.toLowerCase().includes("equity")
              ? "hsl(158 64% 52%)"
              : alloc.name.toLowerCase().includes("debt")
              ? "hsl(221 83% 53%)"
              : alloc.name.toLowerCase().includes("gold")
              ? "hsl(46 95% 53%)"
              : "hsl(0 84% 60%)",
        }))
        .filter(alloc => alloc.value > 0),
    };
  }

  const investmentTransactions = investmentTxData?.transactions || [];

  // Since amounts are negative, take absolute value for display
  const totalValue = Math.abs(
    investmentTransactions.reduce((sum, t) => sum + t.amount, 0)
  );

  const holdingsMap = new Map<string, { name: string, type: string, amount: number }>();
  investmentTransactions.forEach((t) => {
    const existing = holdingsMap.get(t.description);
    const absAmount = Math.abs(t.amount); 
    
    if (existing) {
      existing.amount += absAmount;
    } else {
      let type = "Equity";
      if (t.description.toLowerCase().includes("debt") || 
          t.description.toLowerCase().includes("bond")) type = "Debt";
      if (t.description.toLowerCase().includes("gold") || 
          t.description.toLowerCase().includes("etf")) type = "Commodity";
      if (t.description.toLowerCase().includes("liquid")) type = "Cash";
      
      holdingsMap.set(t.description, {
        name: t.description,
        type: type,
        amount: absAmount,
      });
    }
  });

  const dynamicHoldings = Array.from(holdingsMap.values());

  const allocMap = { Equity: 0, Debt: 0, Gold: 0, Cash: 0, Crypto: 0 };
  dynamicHoldings.forEach(h => {
    if (h.type === "Equity") allocMap.Equity += h.amount;
    else if (h.type === "Debt") allocMap.Debt += h.amount;
    else if (h.type === "Commodity") allocMap.Gold += h.amount;
    else if (h.type === "Cash") allocMap.Cash += h.amount;
    else if (h.type === "Crypto") allocMap.Crypto += h.amount;
  });

  const dynamicAllocations = totalValue > 0 ? [
    { name: "Equity", value: (allocMap.Equity / totalValue) * 100, color: "hsl(158 64% 52%)" },
    { name: "Debt", value: (allocMap.Debt / totalValue) * 100, color: "hsl(221 83% 53%)" },
    { name: "Gold", value: (allocMap.Gold / totalValue) * 100, color: "hsl(46 95% 53%)" },
    { name: "Cash", value: (allocMap.Cash / totalValue) * 100, color: "hsl(0 84% 60%)" },
    { name: "Crypto", value: (allocMap.Crypto / totalValue) * 100, color: "hsl(280 65% 60%)" },
  ].filter(alloc => alloc.value > 0) 
   : [];

  return { totalValue, dynamicHoldings, dynamicAllocations };
}, [investmentTxData?.transactions, portfolioSummaryData]);
  
  const performanceData = useMemo(() => {
  if (portfolioSummaryData?.performance?.length) {
    return portfolioSummaryData.performance.map(row => ({
      month: row.month,
      value: Number(row.cumulative || 0),
    }));
  }

  const investmentTx = [...(investmentTxData?.transactions || [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (investmentTx.length === 0) return [];

  const monthlyData = new Map<string, number>();
  let cumulativeValue = 0;

  for (const t of investmentTx) {
    const date = new Date(t.date);
    const month = date.toISOString().slice(0, 7);
    cumulativeValue += Math.abs(t.amount);
    monthlyData.set(month, cumulativeValue);
  }
  
  const filledData = [];
  const startDate = new Date(investmentTx[0].date);
  const endDate = new Date();
  let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  let lastValue = 0;

  while (currentDate <= endDate) {
    const monthKey = currentDate.toISOString().slice(0, 7);
    const monthName = currentDate.toLocaleString('default', { month: 'short' });
    
    if (monthlyData.has(monthKey)) {
      lastValue = monthlyData.get(monthKey)!;
    }
    
    filledData.push({
      month: `${monthName} ${currentDate.getFullYear()}`,
      value: lastValue,
    });

    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  return filledData.slice(-12);
}, [investmentTxData?.transactions, portfolioSummaryData]);

  const investmentInsights = useMemo(() => {
    if (!insights || !Array.isArray(insights)) return [];
    return insights
      .filter(
        insight => insight.agentType === 'investment_advisor' || 
                   insight.analysis_type === 'investment_advice'
      )
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [insights]);

  const summaryTotalValue = Number(portfolioSummaryData?.summary?.total_invested ?? portfolioData.totalValue ?? 0);
  const summaryMoMChange = Number(portfolioSummaryData?.summary?.month_over_month_change_pct ?? 0);
  const summaryMonthlySip = Number(portfolioSummaryData?.summary?.monthly_sip_estimate ?? 0);

  const targetModel = useMemo(() => {
    const found = TARGET_ALLOCATION_PRESETS.find(p => p.id === selectedModelId);
    if (found) return found;
    return TARGET_ALLOCATION_PRESETS[0];
  }, [selectedModelId]);

  const driftAnalysis = useMemo(() => {
    const totalInvested = summaryTotalValue;
    const targetMap = targetModel.targets;

    const currentValues: Record<string, number> = {
      Equity: 0,
      Debt: 0,
      Commodity: 0,
      Cash: 0,
      Crypto: 0,
    };

    if (portfolioSummaryData?.allocations?.length) {
      portfolioSummaryData.allocations.forEach(a => {
        const canonical = normalizeAssetClassName(a.name);
        const amt =
          Number(a.amount || 0) > 0
            ? Number(a.amount)
            : totalInvested > 0
            ? (Number(a.percentage || 0) * totalInvested) / 100
            : 0;
        currentValues[canonical] = (currentValues[canonical] || 0) + amt;
      });
    } else {
      portfolioData.dynamicHoldings.forEach(h => {
        const canonical = normalizeAssetClassName(h.type);
        currentValues[canonical] = (currentValues[canonical] || 0) + Number(h.amount || 0);
      });
    }

    const assetClasses = Array.from(
      new Set([...Object.keys(targetMap), ...Object.keys(currentValues).filter(k => currentValues[k] > 0)])
    );

    let maxDrift = 0;
    let mostOverweightClass = "";
    let mostUnderweightClass = "";
    let highestOverweightDrift = 0;
    let highestUnderweightDrift = 0;

    const items = assetClasses.map(name => {
      const currentAmount = currentValues[name] || 0;
      const currentPct = totalInvested > 0 ? (currentAmount / totalInvested) * 100 : 0;
      const targetPct = targetMap[name] || 0;
      const driftPct = currentPct - targetPct;
      const targetAmount = totalInvested * (targetPct / 100);
      const dollarDifference = currentAmount - targetAmount;

      const absDrift = Math.abs(driftPct);
      if (absDrift > maxDrift) {
        maxDrift = absDrift;
      }

      if (driftPct > 3 && driftPct > highestOverweightDrift) {
        highestOverweightDrift = driftPct;
        mostOverweightClass = name;
      } else if (driftPct < -3 && Math.abs(driftPct) > highestUnderweightDrift) {
        highestUnderweightDrift = Math.abs(driftPct);
        mostUnderweightClass = name;
      }

      let status: "balanced" | "overweight" | "underweight" = "balanced";
      if (driftPct > 3) status = "overweight";
      else if (driftPct < -3) status = "underweight";

      const color =
        name === "Equity"
          ? "hsl(158 64% 52%)"
          : name === "Debt"
          ? "hsl(221 83% 53%)"
          : name === "Commodity"
          ? "hsl(46 95% 53%)"
          : name === "Crypto"
          ? "hsl(280 65% 60%)"
          : "hsl(0 84% 60%)";

      return {
        name,
        currentAmount,
        currentPct,
        targetPct,
        driftPct,
        status,
        targetAmount,
        dollarDifference,
        color,
      };
    });

    const underweightItems = items.filter(i => i.status === "underweight");
    const totalDeficit = underweightItems.reduce((sum, i) => sum + Math.abs(i.dollarDifference), 0);
    const safeInflow = Math.max(0, Number(inflowAmount) || 0);

    const inflowRecommendations = items.map(item => {
      let allocated = 0;
      if (item.status === "underweight" && totalDeficit > 0) {
        const ratio = Math.abs(item.dollarDifference) / totalDeficit;
        allocated = Math.round(safeInflow * ratio);
      } else if (underweightItems.length === 0 && safeInflow > 0 && item.targetPct > 0) {
        allocated = Math.round(safeInflow * (item.targetPct / 100));
      }

      const newTotal = totalInvested + safeInflow;
      const newAmount = item.currentAmount + allocated;
      const projectedPct = newTotal > 0 ? (newAmount / newTotal) * 100 : 0;
      const projectedDrift = projectedPct - item.targetPct;

      return {
        name: item.name,
        allocated,
        projectedPct,
        projectedDrift,
      };
    });

    const fullRebalanceOrders: Array<{ type: "buy" | "sell"; name: string; amount: number }> = [];
    items.forEach(item => {
      if (item.dollarDifference > 50) {
        fullRebalanceOrders.push({
          type: "sell",
          name: item.name,
          amount: Math.round(item.dollarDifference),
        });
      } else if (item.dollarDifference < -50) {
        fullRebalanceOrders.push({
          type: "buy",
          name: item.name,
          amount: Math.round(Math.abs(item.dollarDifference)),
        });
      }
    });

    return {
      items,
      maxDrift,
      hasDriftAlert: maxDrift > 3,
      mostOverweightClass,
      mostUnderweightClass,
      inflowRecommendations,
      fullRebalanceOrders,
    };
  }, [summaryTotalValue, portfolioSummaryData, portfolioData, targetModel, inflowAmount]);

  const handleScheduleRebalanceTask = () => {
    if (!driftAnalysis || summaryTotalValue <= 0) return;

    const isSmartInflow = rebalanceMode === "inflow";
    const orders = isSmartInflow
      ? driftAnalysis.inflowRecommendations
          .filter(r => r.allocated > 0)
          .map(r => `Deploy ${formatCurrency(r.allocated)} into ${r.name} to close allocation deficit`)
      : driftAnalysis.fullRebalanceOrders.map(
          o => `${o.type === "sell" ? "Trim / Sell" : "Buy / Add"} ${formatCurrency(o.amount)} in ${o.name}`
        );

    orders.push("Verify asset allocation in FinWise Portfolio after execution");

    createTaskMutation.mutate({
      title: `Portfolio Rebalance: Realign to ${targetModel.name}`,
      why: isSmartInflow
        ? `Target asset drift reaches ${driftAnalysis.maxDrift.toFixed(1)}%. Deploying ${formatCurrency(inflowAmount)} restores target weights without tax sales.`
        : `Target asset drift reaches ${driftAnalysis.maxDrift.toFixed(1)}%. Full rebalance restores ${targetModel.name} targets.`,
      steps: orders,
      priority: driftAnalysis.maxDrift > 10 ? "high" : "medium",
      expected_impact: `Restores portfolio balance to ${targetModel.name} and dampens risk.`,
      kind: "invest",
      bucket: 30,
      due_days: 14,
    });
  };

  const dividendAnalytics = useMemo(() => {
    const divData = portfolioSummaryData?.dividends;
    const totalReceived = Number(divData?.total_received || 0);
    const ttmReceived = Number(divData?.ttm_received || 0);
    const totalInvested = summaryTotalValue || 0;
    const portfolioYieldPct =
      totalInvested > 0
        ? (ttmReceived / totalInvested) * 100
        : Number(divData?.portfolio_yield_pct || 0);
    const monthlyAverage = Number(divData?.monthly_average ?? (ttmReceived / 12));
    const payoutsByHolding = divData?.payouts_by_holding || [];
    const monthlyProgression = divData?.monthly_progression || [];
    const recentPayouts = divData?.recent_payouts || [];

    // DRIP Simulation calculations
    const principal = Math.max(totalInvested, 1000);
    const horizon = dripHorizonYears;
    const yieldRate = portfolioYieldPct > 0 ? portfolioYieldPct / 100 : 0.03;
    const capitalGrowthRate = 0.05;
    const totalReturnRateWithDrip = capitalGrowthRate + yieldRate;

    const futureValueWithDrip = Math.round(principal * Math.pow(1 + totalReturnRateWithDrip, horizon));
    const futureValueNoDripPrincipal = Math.round(principal * Math.pow(1 + capitalGrowthRate, horizon));

    let cumulativeCashDividends = 0;
    for (let yr = 1; yr <= horizon; yr++) {
      cumulativeCashDividends += principal * Math.pow(1 + capitalGrowthRate, yr - 1) * yieldRate;
    }
    const futureValueCashTotal = Math.round(futureValueNoDripPrincipal + cumulativeCashDividends);
    const dripWealthAdvantage = Math.max(0, futureValueWithDrip - futureValueCashTotal);
    const dripAdvantagePct =
      futureValueCashTotal > 0
        ? ((futureValueWithDrip - futureValueCashTotal) / futureValueCashTotal) * 100
        : 0;

    return {
      totalReceived,
      ttmReceived,
      portfolioYieldPct,
      monthlyAverage,
      payoutsByHolding,
      monthlyProgression,
      recentPayouts,
      sim: {
        principal,
        horizon,
        futureValueWithDrip,
        futureValueCashTotal,
        futureValueNoDripPrincipal,
        cumulativeCashDividends: Math.round(cumulativeCashDividends),
        dripWealthAdvantage,
        dripAdvantagePct,
      },
    };
  }, [portfolioSummaryData?.dividends, summaryTotalValue, dripHorizonYears]);

  const handleScheduleDividendPlan = () => {
    createTaskMutation.mutate({
      title: "Dividend Income & DRIP Reinvestment Optimization",
      why: `Portfolio generates ${formatCurrency(dividendAnalytics.ttmReceived)} annual dividend run-rate (${dividendAnalytics.portfolioYieldPct.toFixed(2)}% yield). Reinvesting compounding adds +${formatCurrency(dividendAnalytics.sim.dripWealthAdvantage)} over ${dripHorizonYears} years.`,
      steps: [
        "Enable automated dividend reinvestment (DRIP) across core index and equity holdings",
        `Allocate monthly dividend cash flows (${formatCurrency(dividendAnalytics.monthlyAverage)}/mo) toward underweight asset classes`,
        "Audit tax treatment of qualified dividends versus REIT/ordinary income distributions",
      ],
      priority: "medium",
      kind: "invest",
      bucket: 30,
      due_days: 14,
      expected_impact: `Accelerates long-term compound wealth by +${formatCurrency(dividendAnalytics.sim.dripWealthAdvantage)} through DRIP compounding.`,
    });
  };


  if (isLoadingTransactions) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="portfolio-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Investment Portfolio</h1>
            <p className="text-muted-foreground">
              Monitor and optimize your investment strategy
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-primary text-primary-foreground"
                data-testid="button-add-investment"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Investment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Investment</DialogTitle>
                <DialogDescription>
                  Record a new investment. This will be added as a transaction.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="investment-name">Investment Name</Label>
                  <Input
                    id="investment-name"
                    placeholder="e.g., Vanguard S&P 500 ETF"
                    value={newInvestment.name}
                    onChange={(e) => setNewInvestment({ ...newInvestment, name: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground self-center mr-1">Suggestions:</span>
                    {COMMON_INVESTMENT_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setNewInvestment({ ...newInvestment, name: preset.name, type: preset.type })}
                        className="text-[11px] px-2 py-0.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="investment-type">Type (for reporting)</Label>
                  <Select
                    value={newInvestment.type}
                    onValueChange={(value) => setNewInvestment({ ...newInvestment, type: value })}
                  >
                    <SelectTrigger id="investment-type">
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Equity">Equity</SelectItem>
                      <SelectItem value="Debt">Debt</SelectItem>
                      <SelectItem value="Commodity">Gold/Commodity</SelectItem>
                      <SelectItem value="Cash">Cash/Liquid</SelectItem>
                      <SelectItem value="Crypto">Crypto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="investment-amount">Amount ({currency})</Label>
                    <div className="flex items-center gap-1">
                      {AMOUNT_BOOSTERS.map((booster) => (
                        <button
                          key={booster}
                          type="button"
                          onClick={() => setNewInvestment((prev) => ({ ...prev, amount: (prev.amount || 0) + booster }))}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          +{booster}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    id="investment-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="1000"
                    value={newInvestment.amount || ""}
                    onChange={(e) => setNewInvestment({ ...newInvestment, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="investment-date">Date</Label>
                  <Input
                    id="investment-date"
                    type="date"
                    value={newInvestment.date}
                    onChange={(e) => setNewInvestment({ ...newInvestment, date: e.target.value })}
                  />
                </div>
                <Button
                  onClick={handleAddInvestment}
                  disabled={addInvestmentMutation.isPending}
                  className="w-full"
                >
                  {addInvestmentMutation.isPending ? "Adding..." : "Add Investment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Record Dividend Payout Dialog */}
          <Dialog open={isRecordDividendOpen} onOpenChange={setIsRecordDividendOpen}>
            <DialogContent data-testid="dialog-record-dividend">
              <DialogHeader>
                <DialogTitle>Record Dividend Payout</DialogTitle>
                <DialogDescription>
                  Log cash dividends or distribution payouts from your portfolio holdings.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="dividend-holding">Holding / Asset Name</Label>
                  <Input
                    id="dividend-holding"
                    placeholder="e.g., Vanguard Total Stock Market ETF"
                    value={newDividend.holdingName}
                    onChange={(e) => setNewDividend({ ...newDividend, holdingName: e.target.value })}
                    data-testid="input-dividend-holding"
                  />
                  {portfolioData.dynamicHoldings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[11px] text-muted-foreground self-center mr-1">Your holdings:</span>
                      {portfolioData.dynamicHoldings.slice(0, 4).map((h) => (
                        <button
                          key={h.name}
                          type="button"
                          onClick={() => setNewDividend({ ...newDividend, holdingName: h.name })}
                          className="text-[11px] px-2 py-0.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {h.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dividend-amount">Dividend Amount ({currency})</Label>
                    <div className="flex items-center gap-1">
                      {[25, 50, 100, 250].map((booster) => (
                        <button
                          key={booster}
                          type="button"
                          onClick={() => setNewDividend((prev) => ({ ...prev, amount: (prev.amount || 0) + booster }))}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/30 hover:bg-muted text-muted-foreground"
                        >
                          +{booster}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    id="dividend-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="150"
                    value={newDividend.amount || ""}
                    onChange={(e) => setNewDividend({ ...newDividend, amount: parseFloat(e.target.value) || 0 })}
                    data-testid="input-dividend-amount"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dividend-date">Payout Date</Label>
                  <Input
                    id="dividend-date"
                    type="date"
                    value={newDividend.date}
                    onChange={(e) => setNewDividend({ ...newDividend, date: e.target.value })}
                    data-testid="input-dividend-date"
                  />
                </div>

                <div className="p-3 rounded-lg border border-border/80 bg-muted/20 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-foreground">Automatically Reinvest (DRIP)</div>
                    <div className="text-[11px] text-muted-foreground">
                      Logs an investment transaction into this holding to compound returns
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="switch-dividend-reinvest"
                    checked={newDividend.reinvest}
                    onChange={(e) => setNewDividend({ ...newDividend, reinvest: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    data-testid="switch-dividend-reinvest"
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => {
                    if (!newDividend.holdingName.trim()) {
                      toast({ title: "Validation Error", description: "Please enter a holding name.", variant: "destructive" });
                      return;
                    }
                    if (!newDividend.amount || newDividend.amount <= 0) {
                      toast({ title: "Validation Error", description: "Dividend amount must be greater than zero.", variant: "destructive" });
                      return;
                    }
                    recordDividendMutation.mutate(newDividend);
                  }}
                  disabled={recordDividendMutation.isPending}
                  className="w-full"
                  data-testid="button-submit-dividend"
                >
                  {recordDividendMutation.isPending ? "Recording..." : "Record Dividend Payout"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Portfolio Summary  */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total Value</span>
              <TrendingUp className="w-4 h-4 text-chart-1" />
            </div>
            <motion.div
              className="text-3xl font-bold text-chart-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {formatCurrency(summaryTotalValue)}
            </motion.div>
            <div className="text-sm text-muted-foreground mt-1">
              Total invested capital
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                Total Returns
              </span>
              <TrendingUp className="w-4 h-4 text-chart-1" />
            </div>
            <motion.div
              className={`text-3xl font-bold ${summaryMoMChange >= 0 ? "text-chart-1" : "text-chart-4"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {summaryMoMChange >= 0 ? "+" : ""}
              {summaryMoMChange.toFixed(1)}%
            </motion.div>
            <div className="text-sm text-muted-foreground mt-1">Month-over-month invested change</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Monthly SIP</span>
              <Target className="w-4 h-4 text-chart-2" />
            </div>
            <motion.div
              className="text-3xl font-bold text-chart-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              {formatCurrency(summaryMonthlySip)}
            </motion.div>
            <div className="text-sm text-muted-foreground mt-1">
              Recent monthly contribution average
            </div>
          </Card>
        </div>

        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-6 w-full max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            <TabsTrigger value="rebalance">Rebalance</TabsTrigger>
            <TabsTrigger value="dividends" data-testid="tab-dividends">Dividends</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>

          {/* Overview Tab  */}
          <TabsContent value="overview" className="space-y-6">
            {driftAnalysis.hasDriftAlert && summaryTotalValue > 0 && (
              <div
                className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                data-testid="portfolio-drift-alert"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      Asset Allocation Drift Detected
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">
                        ±{driftAnalysis.maxDrift.toFixed(1)}% drift
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {driftAnalysis.mostOverweightClass && (
                        <span>
                          {driftAnalysis.mostOverweightClass} is overweight vs your {targetModel.name} target.
                        </span>
                      )}{" "}
                      Rebalance via cash inflow to restore optimal risk-return posture without taxable sales.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs shrink-0 self-start sm:self-center flex items-center gap-1"
                  onClick={() => setActiveTab("rebalance")}
                  data-testid="review-drift-btn"
                >
                  <Scale className="h-3 w-3 text-primary" />
                  Rebalance Portfolio →
                </Button>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-6">Asset Allocation</h3>
                {portfolioData.dynamicAllocations.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-4">
                    <p className="text-sm text-muted-foreground">No asset allocations to display yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Record investments to visualize your portfolio distribution.</p>
                  </div>
                ) : (
                  <>
                    <div className="h-64 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={portfolioData.dynamicAllocations}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                          >
                            {portfolioData.dynamicAllocations.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      {portfolioData.dynamicAllocations.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center space-x-2"
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="text-sm">
                            <span className="font-medium text-foreground">{item.name}</span>
                            <span className="text-muted-foreground ml-1">
                              ({item.value.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>

              {/* Performance Chart  */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-6">
                  Portfolio Performance
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(217 32% 17%)"
                      />
                      <XAxis dataKey="month" stroke="hsl(215 20% 65%)" />
                      <YAxis stroke="hsl(215 20% 65%)" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(158 64% 52%)"
                        strokeWidth={3}
                        dot={{ fill: "hsl(158 64% 52%)", strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Overview Dividend Widget */}
            <Card className="p-6" data-testid="portfolio-dividend-overview-card">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-amber-500" />
                    <h3 className="text-base font-semibold text-foreground">Dividend Yield & Passive Cash Flow</h3>
                    {dividendAnalytics.portfolioYieldPct > 0 && (
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        {dividendAnalytics.portfolioYieldPct.toFixed(2)}% Yield
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Annual dividend run-rate is {formatCurrency(dividendAnalytics.ttmReceived)} across your portfolio holdings.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Annual Run-rate</div>
                    <div className="text-lg font-bold text-foreground">{formatCurrency(dividendAnalytics.ttmReceived)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Portfolio Yield</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{dividendAnalytics.portfolioYieldPct.toFixed(2)}%</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    onClick={() => setActiveTab("dividends")}
                    data-testid="view-dividends-tab-btn"
                  >
                    Manage Dividends →
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Holdings Tab  */}
          <TabsContent value="holdings" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Your Holdings</h3>
              {/* Button is in the DialogTrigger at the top */}
            </div>
            {portfolioData.dynamicHoldings.length === 0 ? (
              <Card className="p-8 text-center flex flex-col items-center justify-center">
                <Briefcase className="w-10 h-10 text-muted-foreground/60 mb-3" />
                <h4 className="text-base font-semibold text-foreground mb-1">No Holdings Recorded</h4>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  Add your stocks, index funds, bonds, or commodities to track your asset distribution and performance.
                </p>
                <Button onClick={() => setIsAddDialogOpen(true)} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add First Investment
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {portfolioData.dynamicHoldings.map((holding, index) => (
                  <motion.div
                    key={holding.name + index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    data-testid={`holding-detail-${holding.name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <Card className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-foreground">{holding.name}</h4>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-muted-foreground">
                                {holding.type}
                              </div>
                              <div className="font-medium text-foreground">
                                {formatCurrency(holding.amount)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-chart-1">
                                {summaryTotalValue > 0
                                  ? `${((holding.amount / summaryTotalValue) * 100).toFixed(1)}%`
                                  : "0.0%"}
                              </div>
                              <div className="text-sm flex items-center text-muted-foreground">
                                Allocation share
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rebalance" className="space-y-6" data-testid="portfolio-rebalance-tab">
            <Card className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Scale className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">
                      Target Allocation & Drift Rebalancing
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select your investment model and realign your portfolio to maintain your desired risk-return profile.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TARGET_ALLOCATION_PRESETS.map(preset => (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant={selectedModelId === preset.id ? "default" : "outline"}
                      className="h-7 text-xs px-2.5"
                      onClick={() => {
                        setSelectedModelId(preset.id);
                        try {
                          localStorage.setItem("finwise_portfolio_model", preset.id);
                        } catch {
                          // ignore
                        }
                      }}
                      data-testid={`model-preset-${preset.id}`}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-xs text-muted-foreground mb-6">
                <span className="font-medium text-foreground">{targetModel.name}: </span>
                {targetModel.description}
              </div>

              {/* Drift Table */}
              <div className="space-y-3 mb-6">
                <h4 className="text-sm font-semibold text-foreground">Current vs Target Allocation</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {driftAnalysis.items.map(item => {
                    const statusBadge =
                      item.status === "overweight" ? (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">
                          Overweight (+{item.driftPct.toFixed(1)}%)
                        </Badge>
                      ) : item.status === "underweight" ? (
                        <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/30">
                          Underweight ({item.driftPct.toFixed(1)}%)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                          Balanced (±{Math.abs(item.driftPct).toFixed(1)}%)
                        </Badge>
                      );

                    return (
                      <div
                        key={item.name}
                        className="p-3.5 rounded-lg border border-border/60 bg-accent/30 space-y-2"
                        data-testid={`drift-card-${item.name.toLowerCase()}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="font-medium text-sm text-foreground">{item.name}</span>
                          </div>
                          {statusBadge}
                        </div>

                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Actual: <strong className="text-foreground">{formatCurrency(item.currentAmount)}</strong> ({item.currentPct.toFixed(1)}%)</span>
                          <span>Target: <strong className="text-foreground">{item.targetPct}%</strong></span>
                        </div>

                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.max(0, item.currentPct))}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rebalancing Strategy Controls */}
              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Rebalancing Method</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Choose how to restore your target asset weights.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={rebalanceMode === "inflow" ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setRebalanceMode("inflow")}
                      data-testid="mode-inflow-btn"
                    >
                      Smart Cash Inflow (No Sell)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={rebalanceMode === "full" ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setRebalanceMode("full")}
                      data-testid="mode-full-btn"
                    >
                      Full Rebalance (Buy/Sell)
                    </Button>
                  </div>
                </div>

                {rebalanceMode === "inflow" ? (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <Label htmlFor="rebalance-inflow-input" className="text-xs font-medium text-foreground">
                          Capital to Deploy ({currency})
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          Direct fresh cash toward underweight assets without incurring taxable gains or brokerage sales.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[250, 500, 1000, 2500].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setInflowAmount(amt)}
                            className="text-[11px] px-2 py-0.5 rounded border border-border/60 bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            +{amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Input
                      id="rebalance-inflow-input"
                      data-testid="rebalance-inflow-input"
                      type="number"
                      min="1"
                      step="50"
                      value={inflowAmount}
                      onChange={e => setInflowAmount(Math.max(0, Number(e.target.value) || 0))}
                      className="h-8 text-xs max-w-xs"
                    />

                    {/* Inflow recommendations */}
                    <div className="space-y-2 pt-1">
                      <Label className="text-xs text-muted-foreground">Recommended Cash Distribution</Label>
                      <div className="space-y-1.5">
                        {driftAnalysis.inflowRecommendations
                          .filter(r => r.allocated > 0)
                          .map(r => (
                            <div
                              key={r.name}
                              className="p-2.5 rounded bg-background/90 border border-border/60 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-medium text-foreground">Invest in {r.name}</span>
                                <div className="text-[10px] text-muted-foreground">
                                  Closes allocation deficit; projected weight will be {r.projectedPct.toFixed(1)}% (drift: {r.projectedDrift > 0 ? "+" : ""}{r.projectedDrift.toFixed(1)}%)
                                </div>
                              </div>
                              <Badge variant="secondary" className="font-semibold text-emerald-600 dark:text-emerald-400">
                                +{formatCurrency(r.allocated)}
                              </Badge>
                            </div>
                          ))}
                        {driftAnalysis.inflowRecommendations.filter(r => r.allocated > 0).length === 0 && (
                          <div className="text-xs text-muted-foreground p-2">
                            Portfolio is currently balanced. Fresh cash will be allocated proportionally to target weights.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-accent/40 border border-border/60 space-y-3">
                    <Label className="text-xs font-medium text-foreground">
                      Full Portfolio Rebalance Trade Orders
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Executes buy and sell orders to immediately reset weights to the exact target model.
                    </p>

                    <div className="space-y-1.5">
                      {driftAnalysis.fullRebalanceOrders.map((order, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded bg-background/80 border border-border/60 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            {order.type === "sell" ? (
                              <ArrowDownRight className="w-4 h-4 text-amber-500" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                            )}
                            <span className="font-medium text-foreground">
                              {order.type === "sell" ? "Trim / Sell" : "Buy / Add"} {order.name}
                            </span>
                          </div>
                          <Badge
                            variant={order.type === "sell" ? "outline" : "secondary"}
                            className={order.type === "sell" ? "text-amber-600 border-amber-500/30 font-semibold" : "text-emerald-600 font-semibold"}
                          >
                            {order.type === "sell" ? "-" : "+"}{formatCurrency(order.amount)}
                          </Badge>
                        </div>
                      ))}
                      {driftAnalysis.fullRebalanceOrders.length === 0 && (
                        <div className="text-xs text-muted-foreground p-2">
                          No trade orders needed. All asset classes are within ±3% tolerance of target.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full h-8 text-xs flex items-center justify-center gap-1.5"
                  onClick={handleScheduleRebalanceTask}
                  disabled={createTaskMutation.isPending || summaryTotalValue <= 0}
                  data-testid="schedule-rebalance-task-btn"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {createTaskMutation.isPending ? "Scheduling..." : "+ Schedule Rebalance Action Plan"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Dividends Tab */}
          <TabsContent value="dividends" className="space-y-6" data-testid="portfolio-dividends-tab">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Coins className="w-5 h-5 text-amber-500" />
                  Dividend Tracking & DRIP Compounding
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Monitor passive cash flows, evaluate yield on cost, and plan dividend reinvestment strategies.
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs flex items-center gap-1.5 self-start sm:self-center"
                onClick={() => setIsRecordDividendOpen(true)}
                data-testid="button-open-record-dividend"
              >
                <Plus className="w-3.5 h-3.5" />
                Record Dividend Payout
              </Button>
            </div>

            {/* 4 Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4" data-testid="metric-total-dividends">
                <div className="text-xs text-muted-foreground mb-1">Total Received</div>
                <div className="text-xl font-bold text-foreground">
                  {formatCurrency(dividendAnalytics.totalReceived)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Cumulative dividend cash flows
                </div>
              </Card>

              <Card className="p-4" data-testid="metric-annual-dividends">
                <div className="text-xs text-muted-foreground mb-1">TTM Annual Run-Rate</div>
                <div className="text-xl font-bold text-primary">
                  {formatCurrency(dividendAnalytics.ttmReceived)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Trailing 12-month income
                </div>
              </Card>

              <Card className="p-4" data-testid="metric-portfolio-dividend-yield">
                <div className="text-xs text-muted-foreground mb-1">Portfolio Dividend Yield</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {dividendAnalytics.portfolioYieldPct.toFixed(2)}%
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Yield on invested capital
                </div>
              </Card>

              <Card className="p-4" data-testid="metric-monthly-dividend-avg">
                <div className="text-xs text-muted-foreground mb-1">Monthly Run-Rate</div>
                <div className="text-xl font-bold text-foreground">
                  {formatCurrency(dividendAnalytics.monthlyAverage)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Avg. monthly cash flow
                </div>
              </Card>
            </div>

            {/* Charts & Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Dividend Income Chart */}
              <Card className="p-5" data-testid="chart-monthly-dividends">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Monthly Dividend Payouts</h4>
                    <p className="text-[11px] text-muted-foreground">Historical distribution timeline</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Trailing {dividendAnalytics.monthlyProgression.length} Months
                  </Badge>
                </div>
                {dividendAnalytics.monthlyProgression.length === 0 || dividendAnalytics.monthlyProgression.every(m => m.amount === 0) ? (
                  <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs text-muted-foreground">No monthly dividend distributions recorded yet.</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Record dividend payouts to visualize your passive income growth over time.</p>
                  </div>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dividendAnalytics.monthlyProgression}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 32% 17%)" />
                        <XAxis dataKey="month" stroke="hsl(215 20% 65%)" fontSize={11} />
                        <YAxis stroke="hsl(215 20% 65%)" fontSize={11} />
                        <Tooltip
                          formatter={(value: any) => [formatCurrency(Number(value) || 0), "Dividends"]}
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                        />
                        <Bar dataKey="amount" fill="hsl(158 64% 52%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Dividends by Holding Breakdown */}
              <Card className="p-5" data-testid="table-dividends-by-holding">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Holdings Yield on Cost</h4>
                    <p className="text-[11px] text-muted-foreground">Distribution efficiency per asset</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {dividendAnalytics.payoutsByHolding.length} Holdings
                  </Badge>
                </div>

                {dividendAnalytics.payoutsByHolding.length === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs text-muted-foreground">No holdings dividends recorded yet.</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Record dividend payouts with holding names to calculate yield on cost.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {dividendAnalytics.payoutsByHolding.map((h) => (
                      <div key={h.holding_name} className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-medium">
                          <span className="text-foreground truncate max-w-[200px]">{h.holding_name}</span>
                          <span className="text-foreground font-semibold">{formatCurrency(h.total_amount)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{h.payout_count} payout{h.payout_count !== 1 ? "s" : ""}</span>
                          {h.invested_amount > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {h.yield_on_cost_pct.toFixed(2)}% Yield on Cost
                            </span>
                          ) : (
                            <span>Yield: —</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* DRIP Compounding Simulator */}
            <Card className="p-6 space-y-5" data-testid="section-drip-simulator">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Dividend Reinvestment (DRIP) Compounding Simulator
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Model the wealth multiplier effect of automatically reinvesting dividends vs taking cash payouts.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/60 self-start sm:self-center">
                  {([5, 10, 20] as const).map((years) => (
                    <Button
                      key={years}
                      type="button"
                      size="sm"
                      variant={dripHorizonYears === years ? "default" : "ghost"}
                      className="h-7 text-xs px-2.5"
                      onClick={() => setDripHorizonYears(years)}
                      data-testid={`btn-drip-horizon-${years}`}
                    >
                      {years}Y Horizon
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-1">
                  <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">With DRIP Reinvestment</div>
                  <div className="text-xl font-bold text-foreground" data-testid="drip-val-with-drip">
                    {formatCurrency(dividendAnalytics.sim.futureValueWithDrip)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Principal + dividends compounding together at {(0.05 * 100 + (dividendAnalytics.portfolioYieldPct || 3)).toFixed(1)}%/yr
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1">
                  <div className="text-[11px] font-medium text-muted-foreground">Cash Payout Scenario</div>
                  <div className="text-xl font-bold text-foreground" data-testid="drip-val-cash-payout">
                    {formatCurrency(dividendAnalytics.sim.futureValueCashTotal)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatCurrency(dividendAnalytics.sim.futureValueNoDripPrincipal)} stock value + {formatCurrency(dividendAnalytics.sim.cumulativeCashDividends)} cash dividends
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 space-y-1">
                  <div className="text-[11px] font-medium text-primary">DRIP Compounding Surplus</div>
                  <div className="text-xl font-bold text-primary" data-testid="drip-val-advantage">
                    +{formatCurrency(dividendAnalytics.sim.dripWealthAdvantage)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    +{dividendAnalytics.sim.dripAdvantagePct.toFixed(1)}% higher wealth creation over {dripHorizonYears} years
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border/60">
                <p className="text-xs text-muted-foreground">
                  Pro-tip: Reinvesting dividends through market cycles turns volatility into accelerated share accumulation.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-8 text-xs flex items-center gap-1.5 shrink-0"
                  onClick={handleScheduleDividendPlan}
                  disabled={createTaskMutation.isPending}
                  data-testid="schedule-dividend-task-btn"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {createTaskMutation.isPending ? "Scheduling..." : "+ Schedule DRIP Action Plan"}
                </Button>
              </div>
            </Card>

            {/* Recent Payouts Table */}
            {dividendAnalytics.recentPayouts.length > 0 && (
              <Card className="p-5" data-testid="table-recent-dividends">
                <h4 className="text-sm font-semibold text-foreground mb-3">Recent Dividend Distributions</h4>
                <div className="divide-y divide-border/60">
                  {dividendAnalytics.recentPayouts.map((tx) => (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{tx.description}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(tx.date).toLocaleDateString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(tx.amount)}
                        </div>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {tx.category}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="performance">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-6">
                Performance Analytics
              </h3>
              {performanceData.length === 0 ? (
                <div className="h-96 flex flex-col items-center justify-center text-center p-6">
                  <p className="text-sm text-muted-foreground">No performance history available yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Add monthly investment contributions to plot your cumulative wealth trajectory.</p>
                </div>
              ) : (
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(217 32% 17%)"
                      />
                      <XAxis dataKey="month" stroke="hsl(215 20% 65%)" />
                      <YAxis stroke="hsl(215 20% 65%)" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(158 64% 52%)"
                        strokeWidth={3}
                        dot={{ fill: "hsl(158 64% 52%)", strokeWidth: 2, r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* AI Analysis Tab  */}
          <TabsContent value="analysis">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-6 flex items-center">
                <Wand2 className="w-5 h-5 mr-2 text-primary" />
                AI Portfolio Analysis
              </h3>
              {isLoadingInsights ? (
                 <div className="flex items-center justify-center h-40">
                   <Loader2 className="w-6 h-6 animate-spin" />
                 </div>
              ) : investmentInsights.length > 0 ? (
                <div className="space-y-4">
                  {investmentInsights.map((insight) => (
                    <div key={insight.id} className="bg-accent rounded-lg p-4">
                      <h4 className="font-medium text-foreground mb-2">{insight.outputData.title}</h4>
                      <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {insight.outputData.response || insight.outputData.description}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-10">
                  <p>No AI insights available for your portfolio yet.</p>
                  <p className="text-xs mt-2">Try asking the AI to "analyze my portfolio" from the dashboard.</p>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

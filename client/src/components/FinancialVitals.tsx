/**
 * @fileoverview FinancialVitals — top-level dashboard metrics row showing four key
 * financial health indicators: Cash Flow, Savings Rate, Total Savings, and Goals Progress.
 *
 * WHAT IT DOES
 *  - Fetches `/api/dashboard/summary` via React Query and computes four `Metric` objects.
 *  - Each metric card displays an icon, label, formatted value, and a status indicator
 *    (e.g. "Positive cash flow" vs "Negative cash flow", "Above target" vs "Below target").
 *  - Values are formatted via `useOrgFormatters` for locale-aware currency and percentages.
 *
 * KEY PROPS & DATA FLOW
 *  - No props — data is fully server-fetched.
 *  - Returns a 4-column responsive grid (1 col mobile, 2 col tablet, 4 col desktop).
 *
 * ARCHITECTURE NOTES
 *  - Rendered at the top of the Dashboard page, above all other cards.
 *  - Shows "No data" defaults when the summary endpoint returns no data (e.g. new user).
 *  - Framer Motion stagger (0.1 s) for card entry animation.
 */
import { motion } from "framer-motion";
import { Wallet, TrendingUp, PiggyBank, Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useQuery } from "@tanstack/react-query";
import { DashboardSummaryResponse, getDashboardSummary } from "@/lib/apiClient";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";

interface Metric {
  icon: typeof Wallet;
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
}

export function FinancialVitals() {
  const { formatMoney } = useOrgFormatters();
  const { data: summary } = useQuery<DashboardSummaryResponse>({
    queryKey: ["/api/dashboard/summary"],
    queryFn: getDashboardSummary,
  });

  const calculateMetrics = (): Metric[] => {
    if (!summary) {
      return [
        {
          icon: Wallet,
          label: "Cash Flow",
          value: formatMoney(0, { maximumFractionDigits: 0 }),
          change: "No data",
          isPositive: true,
        },
        {
          icon: TrendingUp,
          label: "Savings Rate",
          value: "0%",
          change: "No data",
          isPositive: true,
        },
        {
          icon: PiggyBank,
          label: "Total Savings",
          value: formatMoney(0, { maximumFractionDigits: 0 }),
          change: "No data",
          isPositive: true,
        },
        {
          icon: Trophy,
          label: "Goals Progress",
          value: "0%",
          change: "No goals",
          isPositive: true,
        },
      ];
    }

    const cashFlow = Number(summary.cash_flow.net || 0);
    const savingsRate = Number(summary.cash_flow.savings_rate_pct || 0);
    const goalsProgress = Number(summary.goals.progress_pct || 0);
    const goalsOnTrack = Number(summary.goals.on_track || 0);

    return [
      {
        icon: Wallet,
        label: "Cash Flow",
        value: formatMoney(cashFlow, { maximumFractionDigits: 0 }),
        change: cashFlow > 0 ? "Positive cash flow" : "Negative cash flow",
        isPositive: cashFlow > 0,
      },
      {
        icon: TrendingUp,
        label: "Savings Rate",
        value: `${savingsRate.toFixed(1)}%`,
        change: savingsRate > 20 ? "Above target" : "Below target",
        isPositive: savingsRate > 20,
      },
      {
        icon: PiggyBank,
        label: "Total Savings",
        value: formatMoney(Number(summary.savings.balance || 0), { maximumFractionDigits: 0 }),
        change:
          summary.savings.emergency_fund_months === null
            ? "Emergency runway unavailable"
            : `${summary.savings.emergency_fund_months.toFixed(1)} months runway`,
        isPositive: true,
      },
      {
        icon: Trophy,
        label: "Goals Progress",
        value: `${goalsProgress.toFixed(0)}%`,
        change: `${goalsOnTrack} goals on track`,
        isPositive: goalsProgress > 50,
      },
    ];
  };

  const metrics = calculateMetrics();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {metrics.map((metric, index) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          data-testid={`vital-${metric.label.toLowerCase().replace(/\s/g, "-")}`}
        >
          <Card className="group relative cursor-pointer overflow-hidden p-6">
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 to-transparent opacity-80 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative flex items-center justify-between mb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-white/5 text-foreground">
                <metric.icon className="h-5 w-5" />
              </div>
              <span className="rounded-full bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {metric.label}
              </span>
            </div>
            <div className="relative space-y-2">
              <motion.div
                className="text-3xl font-bold tracking-tight text-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.2 + 0.5 }}
                data-testid={`value-${metric.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                {metric.value}
              </motion.div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: metric.isPositive ? "hsl(0 0% 100%)" : "hsl(0 0% 50%)" }}
                />
                {metric.change}
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

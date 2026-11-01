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
 *  - Distinguishes loading, unavailable, cached, and freshly loaded summaries.
 *  - Framer Motion stagger (0.1 s) for card entry animation.
 */
import { motion } from "framer-motion";
import { Wallet, TrendingUp, PiggyBank, Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery } from "@tanstack/react-query";
import { DashboardSummaryResponse, getDashboardSummary } from "@/lib/apiClient";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";

interface Metric {
  icon: typeof Wallet;
  label: string;
  value: string;
  change: string;
  isPositive: boolean | null;
}

export function FinancialVitals() {
  const { formatMoney } = useOrgFormatters();
  const { data: summary, isPending, isError, isFetching, refetch } = useQuery<DashboardSummaryResponse>({
    queryKey: ["/api/dashboard/summary"],
    queryFn: getDashboardSummary,
  });

  if (isPending) {
    return (
      <div role="status" aria-label="Loading financial summary" className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(index => (
          <Card key={index} className="space-y-4 p-5" aria-hidden="true">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </Card>
        ))}
        <span className="sr-only">Loading your financial summary.</span>
      </div>
    );
  }

  if (!summary) {
    return (
      <Card role="alert" className="mb-8 space-y-3 p-5">
        <p className="text-sm text-muted-foreground">Your financial summary could not be loaded.</p>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Retrying..." : "Try again"}
        </Button>
      </Card>
    );
  }

  const calculateMetrics = (): Metric[] => {
    const cashFlow = Number(summary.cash_flow.net || 0);
    const savingsRate = Number(summary.cash_flow.savings_rate_pct || 0);
    const goalsProgress = Number(summary.goals.progress_pct || 0);
    const goalsOnTrack = Number(summary.goals.on_track || 0);
    const hasIncome = Number(summary.cash_flow.monthly_income) > 0;
    const hasCashFlow = hasIncome || Number(summary.cash_flow.monthly_expenses) > 0;

    return [
      {
        icon: Wallet,
        label: "Cash Flow",
        value: hasCashFlow ? formatMoney(cashFlow, { maximumFractionDigits: 0 }) : "—",
        change: !hasCashFlow ? "Add income or expenses" : cashFlow > 0 ? "Positive cash flow" : cashFlow < 0 ? "Negative cash flow" : "Balanced cash flow",
        isPositive: hasCashFlow ? cashFlow >= 0 : null,
      },
      {
        icon: TrendingUp,
        label: "Savings Rate",
        value: hasIncome ? `${savingsRate.toFixed(1)}%` : "—",
        change: !hasIncome ? "Add income to calculate" : savingsRate > 20 ? "Above target" : savingsRate === 20 ? "At target" : "Below target",
        isPositive: hasIncome ? savingsRate >= 20 : null,
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
        change: summary.goals.total_count === 0 ? "No goals added" : `${goalsOnTrack} goals on track`,
        isPositive: goalsProgress > 50,
      },
    ];
  };

  const metrics = calculateMetrics();

  return (
    <div className="mb-8">
      {isError ? (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Could not refresh the summary. Showing the last loaded values.
        </p>
      ) : null}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          data-testid={`vital-${metric.label.toLowerCase().replace(/\s/g, "-")}`}
        >
          <Card className="relative overflow-hidden p-5">
            <div className="relative flex items-center justify-between mb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-white/5 text-foreground">
                <metric.icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
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
                  aria-hidden="true"
                  className={`inline-block h-2 w-2 rounded-full ${metric.isPositive === null ? "bg-muted-foreground" : metric.isPositive ? "bg-emerald-600 dark:bg-emerald-400" : "bg-amber-600 dark:bg-amber-400"}`}
                />
                {metric.change}
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
    </div>
  );
}

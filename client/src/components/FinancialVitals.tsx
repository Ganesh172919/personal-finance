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
  color: string;
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
          color: "hsl(158 64% 52%)",
          isPositive: true,
        },
        {
          icon: TrendingUp,
          label: "Savings Rate",
          value: "0%",
          change: "No data",
          color: "hsl(221 83% 53%)",
          isPositive: true,
        },
        {
          icon: PiggyBank,
          label: "Total Savings",
          value: formatMoney(0, { maximumFractionDigits: 0 }),
          change: "No data",
          color: "hsl(46 95% 53%)",
          isPositive: true,
        },
        {
          icon: Trophy,
          label: "Goals Progress",
          value: "0%",
          change: "No goals",
          color: "hsl(271 81% 56%)",
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
        color: "hsl(158 64% 52%)",
        isPositive: cashFlow > 0,
      },
      {
        icon: TrendingUp,
        label: "Savings Rate",
        value: `${savingsRate.toFixed(1)}%`,
        change: savingsRate > 20 ? "Above target" : "Below target",
        color: "hsl(221 83% 53%)",
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
        color: "hsl(46 95% 53%)",
        isPositive: true,
      },
      {
        icon: Trophy,
        label: "Goals Progress",
        value: `${goalsProgress.toFixed(0)}%`,
        change: `${goalsOnTrack} goals on track`,
        color: "hsl(271 81% 56%)",
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
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${metric.color}20` }}
              >
                <metric.icon
                  className="w-5 h-5"
                  style={{ color: metric.color }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{metric.label}</span>
            </div>
            <div className="space-y-1">
              <motion.div
                className="text-2xl font-bold"
                style={{ color: metric.color }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.2 + 0.5 }}
                data-testid={`value-${metric.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                {metric.value}
              </motion.div>
              <div className="text-xs text-muted-foreground">{metric.change}</div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

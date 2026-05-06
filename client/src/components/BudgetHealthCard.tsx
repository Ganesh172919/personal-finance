/**
 * @fileoverview Budget Health Card
 *
 * Dashboard card showing the weekly financial health score as an animated
 * circular gauge, burn-rate alerts as warning chips, and a "if you continue"
 * projection summary.
 *
 * DATA:
 * Fetches from GET /api/financial-data/budget-health via React Query.
 *
 * @module components/BudgetHealthCard
 */

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { getBudgetHealth } from "@/lib/api/transactions";
import type { BudgetHealthResponse } from "@/lib/api/transactions";

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

/** Animated circular health gauge (0–100) */
const HealthGauge = ({ score }: { score: number }) => {
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, Math.max(0, score / 100));
  const offset = circumference * (1 - progress);

  const color =
    score >= 75
      ? "stroke-emerald-500"
      : score >= 50
        ? "stroke-amber-500"
        : "stroke-red-500";

  const textColor =
    score >= 75
      ? "text-emerald-400"
      : score >= 50
        ? "text-amber-400"
        : "text-red-400";

  const label =
    score >= 75 ? "Healthy" : score >= 50 ? "Needs Work" : "At Risk";

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/15"
          />
          {/* Animated progress arc */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={color}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
            style={{ strokeDasharray: circumference }}
          />
        </svg>
        {/* Score text centered inside */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={`text-3xl font-bold ${textColor}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            {score}
          </motion.span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            / 100
          </span>
        </div>
      </div>
      <motion.div
        className={`text-xs font-medium ${textColor} mt-2`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        {label}
      </motion.div>
    </div>
  );
};

/** Score breakdown bar */
const ScoreBreakdown = ({
  label,
  score,
  max,
}: {
  label: string;
  score: number;
  max: number;
}) => {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color =
    pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">
          {score}/{max}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/20 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
        />
      </div>
    </div>
  );
};

export default function BudgetHealthCard() {
  const { formatMoney } = useOrgFormatters();

  const { data, isLoading } = useQuery<BudgetHealthResponse>({
    queryKey: ["/api/financial-data/budget-health"],
    queryFn: getBudgetHealth,
    refetchInterval: 10 * 60 * 1000, // 10 min
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="p-6 animate-pulse bg-card/50 h-64" data-testid="budget-health-skeleton" />
    );
  }

  if (!data) return null;

  const { health_score, burn_rate_alerts, pace_comparison, projection } = data;

  const trendIcon =
    pace_comparison.trend === "improving"
      ? "📉"
      : pace_comparison.trend === "worsening"
        ? "📈"
        : "➡️";

  const trendColor =
    pace_comparison.trend === "improving"
      ? "text-emerald-400"
      : pace_comparison.trend === "worsening"
        ? "text-red-400"
        : "text-muted-foreground";

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      data-testid="budget-health-card"
    >
      <Card className="p-6 bg-gradient-to-br from-card to-card/80 border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary" />
          Financial Health
        </h3>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Health Gauge */}
          <div className="flex-shrink-0">
            <HealthGauge score={health_score.total} />
          </div>

          {/* Score Breakdown */}
          <div className="flex-1 space-y-3">
            <ScoreBreakdown
              label="Budget Adherence"
              score={health_score.budget_adherence}
              max={40}
            />
            <ScoreBreakdown
              label="Review Cleanliness"
              score={health_score.review_cleanliness}
              max={20}
            />
            <ScoreBreakdown
              label="Goal Progress"
              score={health_score.goal_progress}
              max={20}
            />
            <ScoreBreakdown
              label="Debt Management"
              score={health_score.debt_management}
              max={20}
            />
          </div>
        </div>

        {/* Projection */}
        <div className="mt-4 p-3 rounded-lg bg-muted/10 border border-border/30">
          <div className="text-sm text-foreground font-medium mb-1">
            {trendIcon} Spending Trend:{" "}
            <span className={trendColor}>
              {pace_comparison.trend.charAt(0).toUpperCase() + pace_comparison.trend.slice(1)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {projection.if_you_continue}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span>
              This week: {formatMoney(pace_comparison.current_week_avg_daily, { maximumFractionDigits: 0 })}/day
            </span>
            <span>
              Last week: {formatMoney(pace_comparison.last_week_avg_daily, { maximumFractionDigits: 0 })}/day
            </span>
          </div>
        </div>

        {/* Burn Rate Alerts */}
        {burn_rate_alerts.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Budget Alerts
            </h4>
            {burn_rate_alerts.slice(0, 4).map((alert) => (
              <div
                key={alert.category}
                className={`flex items-start gap-2 p-2 rounded-lg border ${
                  alert.severity === "critical"
                    ? "bg-red-500/5 border-red-500/20"
                    : "bg-amber-500/5 border-amber-500/20"
                }`}
              >
                <Badge
                  className={`text-[10px] shrink-0 ${
                    alert.severity === "critical"
                      ? "bg-red-500/20 text-red-400 border-red-500/30"
                      : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  } border`}
                >
                  {alert.severity === "critical" ? "🔴" : "🟡"} {alert.category}
                </Badge>
                <span className="text-xs text-muted-foreground flex-1">
                  {alert.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

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
 * MINDMAP FLOW
 * ------------
 * ```
 * BudgetHealthCard Component
 * ├── 1. Data Ingestion (useQuery: ['budgetHealth'])
 * │   └── getBudgetHealth() endpoint query
 * ├── 2. Animated Circular Gauge (HealthGauge)
 * │   ├── SVG Stroke Circumference Math (2 * PI * r)
 * │   ├── Color Tiers:
 * │   │   ├── >= 75: Emerald (Healthy)
 * │   │   ├── 50-74: Amber (Moderate Concern)
 * │   │   └── < 50: Red (Critical Attention Needed)
 * │   └── Motion animation on score change
 * ├── 3. Burn Rate Alert Badges
 * │   ├── Categories on track to breach budget before month end
 * │   └── Daily burn rate velocity indicators
 * └── 4. "If You Continue" Projection Summary
 *     ├── Estimated month-end cash buffer
 *     └── Actionable recommendations to stay solvent
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |               Mount BudgetHealthCard on Dashboard             |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |       useQuery(['budgetHealth']) -> GET /budget-health        |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |             HealthGauge Circular SVG Component                |
 *   |  - Compute stroke-dashoffset from score (0 - 100)             |
 *   |  - Colorize gauge (Emerald / Amber / Red)                     |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                    Burn Rate Warning Chips                    |
 *   |  [ Dining: 85% used ] [ Shopping: Trending 120% by EOM ]      |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                 Month-End Projection Summary                  |
 *   |  "At current rate, savings surplus will be $420 at EOM"       |
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module components/BudgetHealthCard
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BudgetHealthCardSkeleton } from "@/components/ui/CardSkeleton";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { useToast } from "@/hooks/useToast";
import { createTask } from "@/lib/api/tasks";
import { getBudgetHealth } from "@/lib/api/transactions";
import type { BudgetHealthResponse, ProactiveSavingsRecommendation } from "@/lib/api/transactions";
import { Sparkles, PlusCircle, Loader2 } from "lucide-react";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [applyingRecId, setApplyingRecId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<BudgetHealthResponse>({
    queryKey: ["/api/financial-data/budget-health"],
    queryFn: getBudgetHealth,
    refetchInterval: 10 * 60 * 1000, // 10 min
    staleTime: 5 * 60 * 1000,
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createTask>[0]) => createTask(payload),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({
        title: "Savings Action Added",
        description: `Task "${resp?.task?.title || "Budget Adjustment"}" has been scheduled in your actionable tasks.`,
      });
      setApplyingRecId(null);
    },
    onError: (err: any) => {
      toast({
        title: "Action Scheduling Failed",
        description: err?.message || "Could not create task for recommendation.",
        variant: "destructive",
      });
      setApplyingRecId(null);
    },
  });

  const handleApplyRecommendation = (rec: ProactiveSavingsRecommendation) => {
    setApplyingRecId(rec.id);
    createTaskMutation.mutate({
      title: rec.suggested_task_title,
      why: rec.reasoning,
      priority: rec.difficulty === "strategic" ? "high" : "medium",
      kind: "budget",
      expected_impact: `Save $${rec.impact_monthly_savings}/mo, +${rec.score_impact_pts} pts health score`,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  };

  if (isLoading) {
    return <BudgetHealthCardSkeleton />;
  }

  if (!data) return null;

  const {
    health_score,
    burn_rate_alerts,
    predictive_spending_limits,
    predictive_limits_summary,
    proactive_savings_recommendations,
    savings_potential_summary,
    pace_comparison,
    projection,
  } = data;

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

        {health_score.data_available === false ? (
          <div className="py-6 text-center space-y-3" data-testid="budget-health-empty">
            <p className="text-sm text-muted-foreground">
              Add transactions, a budget, or goals to calculate your financial health score.
            </p>
            <Link
              href="/finance?tab=budgets"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
            >
              Set up a budget →
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row gap-6">
              {/* Health Gauge */}
              <div className="flex-shrink-0" data-testid="health-score-gauge">
                {projection.budget_planned > 0 ? (
                  <HealthGauge score={health_score.total} />
                ) : (
                  <p className="max-w-40 text-sm text-muted-foreground">
                    Set a budget to complete your health score.
                  </p>
                )}
              </div>

              {/* Score Breakdown */}
              <div className="flex-1 space-y-3">
                {projection.budget_planned > 0 ? (
                  <div data-testid="score-breakdown-adherence">
                    <ScoreBreakdown
                      label="Budget Adherence"
                      score={health_score.budget_adherence}
                      max={40}
                    />
                  </div>
                ) : (
                  <Link href="/finance?tab=budgets" className="text-sm text-primary underline">
                    Set a budget
                  </Link>
                )}
                <div data-testid="score-breakdown-review">
                  <ScoreBreakdown
                    label="Review Cleanliness"
                    score={health_score.review_cleanliness}
                    max={20}
                  />
                </div>
                <div data-testid="score-breakdown-goal">
                  <ScoreBreakdown
                    label="Goal Progress"
                    score={health_score.goal_progress}
                    max={20}
                  />
                </div>
                <div data-testid="score-breakdown-debt">
                  <ScoreBreakdown
                    label="Debt Management"
                    score={health_score.debt_management}
                    max={20}
                  />
                </div>
              </div>
            </div>

            {/* Projection */}
            <div className="mt-4 p-3 rounded-lg bg-muted/10 border border-border/30" data-testid="budget-health-projection">
              <div className="text-sm text-foreground font-medium mb-1">
                {trendIcon} Spending Trend:{" "}
                <span className={trendColor}>
                  {(pace_comparison?.trend || "stable").charAt(0).toUpperCase() +
                    (pace_comparison?.trend || "stable").slice(1)}
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
              <div className="mt-4 space-y-2" data-testid="budget-health-alerts">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Budget Alerts
                  </h4>
                  <Link href="/finance?tab=budgets" className="text-xs text-primary hover:underline">
                    Adjust budgets &rarr;
                  </Link>
                </div>
                {burn_rate_alerts.slice(0, 4).map((alert) => (
                  <div
                    key={alert.category}
                    data-testid={`alert-chip-${alert.category.toLowerCase().replace(/\s+/g, "-")}`}
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

            {/* Predictive Spending Limits & Safe Daily Allowance Guardrails */}
            {predictive_spending_limits && predictive_spending_limits.length > 0 && (
              <div
                className="mt-5 pt-4 border-t border-border/40 space-y-3"
                data-testid="predictive-spending-limits"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Predictive Spending Limits
                      </h4>
                      {predictive_limits_summary?.days_remaining !== undefined && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/20 text-muted-foreground border border-border/40"
                          data-testid="badge-days-remaining"
                        >
                          {predictive_limits_summary.days_remaining}d remaining
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Dynamic daily allowances and target caps based on active burn pace
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {predictive_limits_summary?.categories_at_risk ? (
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20"
                        data-testid="badge-categories-at-risk"
                      >
                        {predictive_limits_summary.categories_at_risk} at risk
                      </span>
                    ) : null}
                    {predictive_limits_summary?.total_safe_daily_spend !== undefined && (
                      <span
                        className="text-xs font-medium text-emerald-400"
                        data-testid="metric-total-safe-daily"
                      >
                        {formatMoney(predictive_limits_summary.total_safe_daily_spend, { maximumFractionDigits: 0 })}/day total safe
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {predictive_spending_limits.map((limit) => {
                    const slug = limit.category.toLowerCase().replace(/\s+/g, "-");
                    const burnPct =
                      limit.planned > 0
                        ? Math.min(100, Math.round((limit.spent / limit.planned) * 100))
                        : 0;
                    const statusBadgeClass =
                      limit.status === "critical"
                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                        : limit.status === "caution"
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";

                    return (
                      <div
                        key={limit.category}
                        data-testid={`predictive-limit-${slug}`}
                        className="p-3 rounded-xl bg-card/60 border border-border/50 hover:border-border transition-all flex flex-col justify-between gap-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {limit.category}
                          </span>
                          <span
                            data-testid={`badge-status-${slug}`}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${statusBadgeClass}`}
                          >
                            {limit.status === "critical"
                              ? "Critical"
                              : limit.status === "caution"
                                ? "Caution"
                                : "On Track"}
                          </span>
                        </div>

                        {/* Metric grid */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-muted/15 p-2 rounded-lg border border-border/30">
                            <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">
                              Safe Daily
                            </span>
                            <span
                              data-testid={`metric-safe-daily-${slug}`}
                              className={`font-semibold ${
                                limit.safe_daily_spend > 0 ? "text-emerald-400" : "text-muted-foreground"
                              }`}
                            >
                              {formatMoney(limit.safe_daily_spend, { maximumFractionDigits: 0 })}/day
                            </span>
                          </div>

                          <div className="bg-muted/15 p-2 rounded-lg border border-border/30">
                            <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">
                              Dynamic Cap
                            </span>
                            <span
                              data-testid={`metric-recommended-cap-${slug}`}
                              className="font-semibold text-foreground"
                            >
                              {formatMoney(limit.recommended_cap, { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        </div>

                        {/* Burn rate progress */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>
                              {formatMoney(limit.spent, { maximumFractionDigits: 0 })} / {formatMoney(limit.planned, { maximumFractionDigits: 0 })}
                            </span>
                            <span>{burnPct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/20 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                limit.status === "critical"
                                  ? "bg-red-500"
                                  : limit.status === "caution"
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                              style={{ width: `${burnPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Reduction required callout if overshoot risk */}
                        {limit.overshoot_risk && limit.daily_reduction_required > 0 && (
                          <div
                            data-testid={`metric-reduction-required-${slug}`}
                            className="text-[10px] text-red-400 font-medium flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20"
                          >
                            <span>⚠️</span>
                            <span>
                              Reduce spend by {formatMoney(limit.daily_reduction_required, { maximumFractionDigits: 0 })}/day to stay on budget
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Proactive Savings Recommendations & Actionable Opportunities */}
            {proactive_savings_recommendations && proactive_savings_recommendations.length > 0 && (
              <div
                className="mt-5 pt-4 border-t border-border/40 space-y-3"
                data-testid="proactive-savings-recommendations"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Proactive Savings Recommendations
                      </h4>
                      {savings_potential_summary?.total_monthly_savings ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          data-testid="badge-total-potential-savings"
                        >
                          Save up to {formatMoney(savings_potential_summary.total_monthly_savings, { maximumFractionDigits: 0 })}/mo
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Concrete adjustments to recover budget overrun, trim discretionary drift, and boost health score
                    </p>
                  </div>

                  {savings_potential_summary?.potential_score_improvement ? (
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30 flex items-center gap-1"
                      data-testid="badge-potential-score-bump"
                    >
                      <span>+{savings_potential_summary.potential_score_improvement} pts score potential</span>
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2.5">
                  {proactive_savings_recommendations.map((rec) => {
                    const slug = rec.id;
                    const diffBadgeClass =
                      rec.difficulty === "easy"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : rec.difficulty === "moderate"
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : "bg-purple-500/15 text-purple-400 border-purple-500/30";

                    return (
                      <div
                        key={rec.id}
                        data-testid={`rec-card-${slug}`}
                        className="p-3 rounded-xl bg-card/60 border border-border/50 hover:border-border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              {rec.title}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider border ${diffBadgeClass}`}
                              data-testid={`badge-rec-difficulty-${slug}`}
                            >
                              {rec.difficulty}
                            </span>
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              data-testid={`badge-rec-savings-${slug}`}
                            >
                              +{formatMoney(rec.impact_monthly_savings, { maximumFractionDigits: 0 })}/mo
                            </span>
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20"
                              data-testid={`badge-rec-score-${slug}`}
                            >
                              +{rec.score_impact_pts} pts
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {rec.reasoning}
                          </p>
                        </div>

                        <div className="shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2.5 flex items-center gap-1.5 border-border/70 hover:border-primary hover:text-primary transition-all"
                            disabled={createTaskMutation.isPending && applyingRecId === rec.id}
                            onClick={() => handleApplyRecommendation(rec)}
                            data-testid={`btn-apply-recommendation-${slug}`}
                          >
                            {createTaskMutation.isPending && applyingRecId === rec.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <PlusCircle className="w-3.5 h-3.5 text-primary" />
                                <span>Add to Tasks</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </motion.div>
  );
}

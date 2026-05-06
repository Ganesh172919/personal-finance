/**
 * @fileoverview Financial Command Center
 *
 * The "Today in FinWise" dashboard hero — a unified daily-use decision cockpit
 * that aggregates cash runway, budget burn rate, upcoming bills, priority chips,
 * and proactive signals into a single glanceable view.
 *
 * DESIGN:
 * - Time-of-day adaptive greeting (morning/afternoon/evening)
 * - Priority signal chips color-coded by urgency (act_now/review_this_week/safe)
 * - Cash runway gauge with days remaining
 * - Budget burn rate bar with projection line
 * - Upcoming bills mini-table
 * - Animated card entrance with framer-motion stagger
 *
 * DATA:
 * Fetches from GET /api/financial-data/command-center via React Query.
 *
 * @module components/CommandCenter
 */

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { getCommandCenter } from "@/lib/api/transactions";
import type { CommandCenterResponse, PriorityLevel } from "@/lib/api/transactions";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const GREETINGS = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
} as const;

const priorityConfig: Record<
  PriorityLevel,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  act_now: {
    label: "Act Now",
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-500",
  },
  review_this_week: {
    label: "Review",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-500",
  },
  safe_to_ignore: {
    label: "On Track",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    dot: "bg-emerald-500",
  },
};

/** Circular gauge component for scores/percentages */
const CircularGauge = ({
  value,
  max,
  label,
  color = "stroke-primary",
  size = 80,
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
  size?: number;
}) => {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, Math.max(0, value / max));
  const offset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          className="text-muted/20"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          className={color}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div className="text-center -mt-[calc(50%+10px)]">
        <div className="text-lg font-bold text-foreground">
          {value !== null ? value : "—"}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-5">
        {label}
      </div>
    </div>
  );
};

export default function CommandCenter() {
  const { formatMoney } = useOrgFormatters();

  const { data, isLoading, error } = useQuery<CommandCenterResponse>({
    queryKey: ["/api/financial-data/command-center"],
    queryFn: getCommandCenter,
    refetchInterval: 5 * 60 * 1000, // 5 min
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="command-center-skeleton">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-5 h-36 animate-pulse bg-card/50" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return null; // Graceful fallback — don't block dashboard
  }

  const {
    time_of_day,
    cash_runway,
    budget_burn,
    upcoming_bills,
    debt_pressure,
    pending_tasks,
    goals_snapshot,
    priority_signals,
  } = data;

  const burnColor =
    budget_burn.burn_rate_pct > 90
      ? "stroke-red-500"
      : budget_burn.burn_rate_pct > 70
        ? "stroke-amber-500"
        : "stroke-emerald-500";

  const runwayColor =
    (cash_runway.days_remaining ?? 999) < 14
      ? "text-red-400"
      : (cash_runway.days_remaining ?? 999) < 30
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5"
      data-testid="command-center"
    >
      {/* ── Greeting + Priority Signals ─────────────────── */}
      <motion.div variants={cardVariants}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {GREETINGS[time_of_day]} 👋
            </h2>
            <p className="text-sm text-muted-foreground">
              Here's your financial snapshot for today.
            </p>
          </div>
          {priority_signals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {priority_signals.slice(0, 4).map((signal) => {
                const config = priorityConfig[signal.priority];
                return (
                  <Badge
                    key={signal.id}
                    className={`${config.bg} ${config.text} ${config.border} border cursor-default`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dot} mr-1.5 inline-block`} />
                    {signal.title}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── KPI Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cash Runway */}
        <motion.div variants={cardVariants}>
          <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50 hover:border-border transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cash Runway
              </h3>
              <span className="text-lg">💰</span>
            </div>
            <div className={`text-3xl font-bold ${runwayColor}`}>
              {cash_runway.days_remaining !== null
                ? `${cash_runway.days_remaining}d`
                : "∞"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatMoney(cash_runway.liquid_balance, { maximumFractionDigits: 0 })} liquid
            </div>
            <div className="text-xs text-muted-foreground">
              ~{formatMoney(cash_runway.avg_daily_expense, { maximumFractionDigits: 0 })}/day avg spend
            </div>
          </Card>
        </motion.div>

        {/* Budget Burn Rate */}
        <motion.div variants={cardVariants}>
          <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50 hover:border-border transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Budget Burn
              </h3>
              <CircularGauge
                value={Math.round(budget_burn.burn_rate_pct)}
                max={100}
                label="%"
                color={burnColor}
                size={56}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatMoney(budget_burn.total_spent, { maximumFractionDigits: 0 })} spent</span>
                <span>{formatMoney(budget_burn.total_planned, { maximumFractionDigits: 0 })} planned</span>
              </div>
              <Progress
                value={Math.min(100, budget_burn.burn_rate_pct)}
                className="h-2"
              />
              <div className="text-xs text-muted-foreground">
                Day {budget_burn.day_of_month}/{budget_burn.days_in_month}
                {!budget_burn.on_pace && budget_burn.overshoot_amount > 0 && (
                  <span className="text-amber-400 ml-1">
                    • ~{formatMoney(budget_burn.overshoot_amount, { maximumFractionDigits: 0 })} projected overshoot
                  </span>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Pending Tasks */}
        <motion.div variants={cardVariants}>
          <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50 hover:border-border transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tasks
              </h3>
              <span className="text-lg">📋</span>
            </div>
            <div className="text-3xl font-bold text-foreground">
              {pending_tasks.open}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {pending_tasks.due_soon > 0 && (
                <span className="text-amber-400">
                  {pending_tasks.due_soon} due soon
                </span>
              )}
              {pending_tasks.overdue > 0 && (
                <span className="text-red-400 ml-2">
                  {pending_tasks.overdue} overdue
                </span>
              )}
              {pending_tasks.due_soon === 0 && pending_tasks.overdue === 0 && (
                <span className="text-emerald-400">All clear</span>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Goals & Debt */}
        <motion.div variants={cardVariants}>
          <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50 hover:border-border transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Goals
              </h3>
              <span className="text-lg">🎯</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {goals_snapshot.on_track}
              </span>
              <span className="text-sm text-muted-foreground">
                / {goals_snapshot.total} on track
              </span>
            </div>
            <Progress
              value={goals_snapshot.overall_progress_pct}
              className="h-2 mt-2"
            />
            {debt_pressure.debt_count > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                <span
                  className={
                    debt_pressure.pressure_level === "act_now"
                      ? "text-red-400"
                      : debt_pressure.pressure_level === "review_this_week"
                        ? "text-amber-400"
                        : "text-muted-foreground"
                  }
                >
                  {formatMoney(debt_pressure.total_minimum_due, { maximumFractionDigits: 0 })} min. payments
                </span>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* ── Priority Signals Detail ─────────────────────── */}
      {priority_signals.length > 0 && (
        <motion.div variants={cardVariants}>
          <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Priority Actions
            </h3>
            <div className="space-y-2">
              {priority_signals.map((signal) => {
                const config = priorityConfig[signal.priority];
                return (
                  <motion.div
                    key={signal.id}
                    className={`flex items-start gap-3 p-3 rounded-lg ${config.bg} border ${config.border}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className={`w-2 h-2 rounded-full ${config.dot} mt-1.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${config.text}`}>
                        {signal.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {signal.detail}
                      </div>
                    </div>
                    {signal.action_href && (
                      <a
                        href={signal.action_href}
                        className={`text-xs ${config.text} hover:underline shrink-0 mt-0.5`}
                      >
                        View →
                      </a>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Upcoming Bills ──────────────────────────────── */}
      {upcoming_bills.length > 0 && (
        <motion.div variants={cardVariants}>
          <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              📅 Upcoming Bills (Next 7 Days)
            </h3>
            <div className="space-y-2">
              {upcoming_bills.slice(0, 5).map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                >
                  <div>
                    <div className="text-sm text-foreground">{bill.name}</div>
                    <div className="text-xs text-muted-foreground">{bill.due_date}</div>
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {bill.amount_estimate > 0
                      ? formatMoney(bill.amount_estimate, { maximumFractionDigits: 0 })
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

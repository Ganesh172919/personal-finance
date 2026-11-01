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
 * MINDMAP FLOW
 * ------------
 * ```
 * CommandCenter UI Component
 * ├── 1. Data Ingestion (React Query)
 * │   └── getCommandCenter() query with refetchOnWindowFocus
 * ├── 2. Hero Header Banner
 * │   ├── Time-of-day Adaptive Greeting (Morning / Afternoon / Evening)
 * │   └── High-level Net Worth & Active Month Indicator
 * ├── 3. Priority Signal Strips
 * │   ├── Act Now (Red badge: overdue bills, exhausted budget)
 * │   ├── Review This Week (Amber badge: approaching thresholds)
 * │   └── Safe & On-Track (Green badge: healthy savings pace)
 * ├── 4. Primary Financial Gauges
 * │   ├── Cash Runway Gauge (Remaining liquid days projection)
 * │   ├── Budget Burn Rate (Pace vs days left in current calendar month)
 * │   └── Upcoming Scheduled Bills List
 * └── 5. Motion & UX Polish
 *     ├── Framer Motion Staggered Entrance Animations
 *     └── Organization Currency & Date Formatters (useOrgFormatters)
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |                 CommandCenter Mounts on Dashboard             |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |    useQuery(['commandCenter']) -> GET /api/.../command-center |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |               Header: Time-of-day Dynamic Greeting            |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                    Priority Signal Chips                      |
 *   |  [ ! Act Now (2) ]  [ ⚠ Review This Week (1) ]  [ ✓ Safe (4) ]|
 *   +-------------------------------+-------------------------------+
 *                                   |
 *            +----------------------+----------------------+
 *            |                      |                      |
 *            v                      v                      v
 *     [Runway Gauge]         [Burn Rate Bar]        [Upcoming Bills]
 *     e.g. 142 days          e.g. 48% used (Day 15)  Rent due in 3d
 *            |                      |                      |
 *            +----------------------+----------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   | Framer-Motion Animated Render with Organization Currencies    |
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module components/CommandCenter
 */

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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

  const { data, isLoading, error, refetch } = useQuery<CommandCenterResponse>({
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

  if (error) {
    return (
      <Card className="p-4 border-dashed border-border/80 bg-card/40 flex items-center justify-between" data-testid="command-center-error">
        <p className="text-sm text-muted-foreground">
          Financial Command Center is temporarily unavailable.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-xs text-primary font-medium"
        >
          Retry
        </Button>
      </Card>
    );
  }

  if (!data) {
    return null; // Graceful fallback — don't block dashboard
  }

  const {
    time_of_day,
    cash_runway,
    consolidated_netting,
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
          <Card data-testid="kpi-cash-runway" className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50 hover:border-border transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cash Runway
              </h3>
              <span className="text-lg">💰</span>
            </div>
            <div className={`text-3xl font-bold ${runwayColor}`}>
              {cash_runway.days_remaining !== null
                ? `${cash_runway.days_remaining}d`
                : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {cash_runway.balance_available === false
                ? "Add an account balance"
                : `${formatMoney(cash_runway.liquid_balance, { maximumFractionDigits: 0 })} liquid`}
            </div>
            <div className="text-xs text-muted-foreground">
              ~{formatMoney(cash_runway.avg_daily_expense, { maximumFractionDigits: 0 })}/day avg spend
            </div>
            {/* Consolidated Net Cash sub-metric */}
            <div className="flex items-center justify-between text-xs mt-2.5 pt-2 border-t border-border/40" data-testid="kpi-consolidated-netting">
              <span className="text-muted-foreground flex items-center gap-1">
                <span>Net:</span>
                <span className="font-semibold text-foreground" data-testid="metric-net-liquid-cash">
                  {formatMoney(
                    consolidated_netting?.net_liquid_cash ??
                      cash_runway.net_liquid_balance ??
                      cash_runway.liquid_balance,
                    { maximumFractionDigits: 0 }
                  )}
                </span>
                {consolidated_netting?.net_runway_days !== undefined &&
                  consolidated_netting?.net_runway_days !== null && (
                    <span className="text-[11px] text-muted-foreground ml-0.5" data-testid="metric-net-runway-days">
                      ({consolidated_netting.net_runway_days}d)
                    </span>
                  )}
              </span>
              <Badge
                data-testid="badge-netting-status"
                className={
                  (consolidated_netting?.netting_status || "surplus") === "deficit"
                    ? "bg-red-500/15 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0"
                    : (consolidated_netting?.netting_status || "surplus") === "balanced"
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0"
                      : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0"
                }
              >
                {(consolidated_netting?.netting_status || "surplus").toUpperCase()}
              </Badge>
            </div>
          </Card>
        </motion.div>

        {/* Budget Burn Rate */}
        <motion.div variants={cardVariants}>
          <Card data-testid="kpi-budget-burn" className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50 hover:border-border transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Budget Burn
              </h3>
              {budget_burn.total_planned > 0 ? <CircularGauge
                value={Math.round(budget_burn.burn_rate_pct)}
                max={100}
                label="%"
                color={burnColor}
                size={56}
              /> : <Link href="/finance?tab=budgets" className="text-sm text-primary underline">Set a budget</Link>}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatMoney(budget_burn.total_spent, { maximumFractionDigits: 0 })} spent</span>
                <span>{formatMoney(budget_burn.total_planned, { maximumFractionDigits: 0 })} planned</span>
              </div>
              {budget_burn.total_planned > 0 && <Progress
                value={Math.min(100, budget_burn.burn_rate_pct)}
                className="h-2"
              />}
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
          <Card data-testid="kpi-pending-tasks" className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50 hover:border-border transition-colors">
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
          <Card data-testid="kpi-goals-debt" className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50 hover:border-border transition-colors">
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

      {/* ── Multi-Account Consolidated Netting Cockpit Strip ── */}
      {consolidated_netting && (
        <motion.div variants={cardVariants}>
          <Card
            data-testid="card-consolidated-netting"
            className="p-5 bg-gradient-to-br from-card via-card to-card/90 border-border/60 hover:border-border transition-colors shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚖️</span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    Multi-Account Consolidated Netting
                    <Badge
                      data-testid="badge-consolidated-netting-status"
                      className={
                        consolidated_netting.netting_status === "deficit"
                          ? "bg-red-500/15 text-red-400 border-red-500/30 text-[10px] px-2 py-0.5"
                          : consolidated_netting.netting_status === "balanced"
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-2 py-0.5"
                            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0.5"
                      }
                    >
                      {consolidated_netting.netting_status === "deficit"
                        ? "DEFICIT WARNING"
                        : consolidated_netting.netting_status === "balanced"
                          ? "BALANCED POSITION"
                          : "SURPLUS RESERVE"}
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time consolidated balance netting across liquid cash, investments, credit cards, and debt obligations.
                  </p>
                </div>
              </div>
              <Link
                href="/finance?tab=accounts"
                className="text-xs text-primary hover:underline font-medium flex items-center gap-1 self-start sm:self-auto"
                data-testid="link-manage-accounts"
              >
                Manage Accounts →
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 pb-3 border-y border-border/40">
              <div data-testid="netting-liquid-assets">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Liquid Assets
                </div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">
                  {formatMoney(consolidated_netting.liquid_assets, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[11px] text-muted-foreground">Cash, checking, savings</div>
              </div>

              <div data-testid="netting-investment-assets">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Investments
                </div>
                <div className="text-lg font-bold text-foreground mt-0.5">
                  {formatMoney(consolidated_netting.investment_assets, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[11px] text-muted-foreground">Brokerage & portfolios</div>
              </div>

              <div data-testid="netting-liabilities">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Credit & Debts
                </div>
                <div className="text-lg font-bold text-red-400 mt-0.5">
                  {formatMoney(consolidated_netting.total_liabilities, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatMoney(consolidated_netting.credit_liabilities, { maximumFractionDigits: 0 })} cards + {formatMoney(consolidated_netting.profile_debts, { maximumFractionDigits: 0 })} loans
                </div>
              </div>

              <div data-testid="netting-net-worth">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Net Worth
                </div>
                <div
                  className={`text-lg font-bold mt-0.5 ${
                    consolidated_netting.net_worth < 0
                      ? "text-red-400"
                      : "text-foreground"
                  }`}
                >
                  {formatMoney(consolidated_netting.net_worth, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Assets minus liabilities
                </div>
              </div>
            </div>

            {/* Proportional Asset-to-Liability Bar */}
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Net Liquid Cash:{" "}
                  <strong className={consolidated_netting.net_liquid_cash < 0 ? "text-red-400" : "text-emerald-400"}>
                    {formatMoney(consolidated_netting.net_liquid_cash, { maximumFractionDigits: 0 })}
                  </strong>
                </span>
                <span>
                  {consolidated_netting.total_assets > 0
                    ? `${Math.min(100, Math.round((consolidated_netting.total_liabilities / consolidated_netting.total_assets) * 100))}% liability ratio`
                    : "0% liability ratio"}
                </span>
              </div>
              <Progress
                value={
                  consolidated_netting.total_assets > 0
                    ? Math.min(100, (consolidated_netting.total_liabilities / consolidated_netting.total_assets) * 100)
                    : 0
                }
                className="h-2"
              />
            </div>

            {consolidated_netting.netting_status === "deficit" && (
              <div
                className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center justify-between"
                data-testid="alert-netting-deficit"
              >
                <span>
                  ⚠️ <strong>Net Liquid Deficit:</strong> Immediate credit card obligations exceed your available liquid cash reserve by{" "}
                  {formatMoney(Math.abs(consolidated_netting.net_liquid_cash), { maximumFractionDigits: 0 })}.
                </span>
                <Link
                  href="/finance?tab=accounts"
                  className="underline font-semibold ml-2 hover:text-red-300 shrink-0"
                >
                  Review Balances
                </Link>
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* ── Priority Signals Detail ─────────────────────── */}
      {priority_signals.length > 0 && (
        <motion.div variants={cardVariants}>
          <Card data-testid="command-center-priority-signals" className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50">
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
                    data-testid={`signal-card-${signal.id}`}
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
                      <Link
                        href={signal.action_href}
                        data-testid={`signal-action-${signal.id}`}
                        className={`text-xs ${config.text} hover:underline shrink-0 mt-0.5`}
                      >
                        View →
                      </Link>
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
          <Card data-testid="command-center-upcoming-bills" className="p-5 bg-gradient-to-br from-card to-card/80 border-border/50">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              📅 Upcoming Bills (Next 7 Days)
            </h3>
            <div className="space-y-2">
              {upcoming_bills.slice(0, 5).map((bill) => (
                <div
                  key={bill.id}
                  data-testid={`upcoming-bill-${bill.id}`}
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

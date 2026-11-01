/**
 * @fileoverview Financial analytics dashboard with charts and stat cards.
 *
 * Presents a multi-chart view of the user's financial data:
 * - Income vs Expense area chart over the last 12 months.
 * - Category breakdown pie chart for the selected period.
 * - Top merchants horizontal bar chart ranked by spend.
 * - Account balance bar chart across all linked accounts.
 * - Stat cards for total income, expenses, savings rate, and net flow.
 *
 * Key data flows:
 * - getIncomeExpenseSummary({ months }) provides monthly income/expense
 *   series for the area chart and stat calculations.
 * - getCategoryTrends({ months }) returns category-level breakdowns
 *   for the pie chart.
 * - getAccountBalances() fetches current balances per account.
 * - getTopMerchants({ months, limit }) surfaces the highest-spend
 *   merchants for the bar chart.
 *
 * A month-range selector lets users adjust the lookback window.
 * All charts use Recharts with a shared color palette.
 *
 * Accessible from the sidebar under "Analytics" for authenticated users.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calendar,
  Clock,
  Flame,
  PiggyBank,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/feedback/EmptyState";
import { InlineLoader } from "@/components/feedback/InlineLoader";
import { PageIntro } from "@/components/layout/PageIntro";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  getAccountBalances,
  getCategoryTrends,
  getIncomeExpenseSummary,
  getSpendingHeatmap,
  getTopMerchants,
  type IncomeExpenseMonth,
} from "@/lib/api/v1/analytics";

const CHART_COLORS = [
  "hsl(160 68% 42%)",
  "hsl(204 86% 56%)",
  "hsl(39 90% 57%)",
  "hsl(4 74% 58%)",
  "hsl(191 78% 42%)",
  "hsl(215 16% 47%)",
  "hsl(28 89% 58%)",
  "hsl(173 61% 39%)",
];

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function AnalyticsTooltip({ active, payload, label }: any) {
  const { formatMoney } = useOrgFormatters();
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/70 bg-popover/95 p-3 text-sm shadow-xl backdrop-blur">
      <p className="mb-2 font-medium text-foreground">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => (
          <div key={`${entry.name}-${index}`} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-medium text-foreground">{formatMoney(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone,
  trendLabel,
  trendDirection,
  delay,
  testId,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof TrendingUp;
  tone: "income" | "expense" | "wealth" | "savings";
  trendLabel?: string;
  trendDirection?: "up" | "down";
  delay: number;
  testId?: string;
}) {
  const toneClasses = {
    income: {
      panel: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      glow: "from-emerald-500/14 to-transparent",
    },
    expense: {
      panel: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
      glow: "from-rose-500/14 to-transparent",
    },
    wealth: {
      panel: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
      glow: "from-sky-500/14 to-transparent",
    },
    savings: {
      panel: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
      glow: "from-amber-500/14 to-transparent",
    },
  }[tone];

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card
        className="relative overflow-hidden border-border/70 bg-card/90 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)]"
        data-testid={testId}
      >
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${toneClasses.glow}`} />
        <CardContent className="relative p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {title}
              </p>
              <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClasses.panel}`}>
                <Icon className="h-5 w-5" />
              </div>
              {trendLabel ? (
                <div
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
                    trendDirection === "up"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {trendDirection === "up" ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {trendLabel}
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function AnalyticsLoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-36 rounded-[calc(var(--radius)+4px)] bg-muted/65 loading-shimmer" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="h-[24rem] rounded-[calc(var(--radius)+4px)] bg-muted/65 loading-shimmer" />
        <div className="h-[24rem] rounded-[calc(var(--radius)+4px)] bg-muted/65 loading-shimmer" />
      </div>
      <InlineLoader label="Loading analytics workspace..." />
    </div>
  );
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState(12);
  const { formatMoney, currency } = useOrgFormatters();
  const formatCurrency = (amount: number) => formatMoney(amount);
  const formatCompactCurrency = (amount: number) =>
    formatMoney(amount, { notation: "compact", maximumFractionDigits: 1 });

  const incomeExpenseQuery = useQuery({
    queryKey: ["analytics", "income-expense", timeRange],
    queryFn: () => getIncomeExpenseSummary(timeRange),
    staleTime: 60_000,
  });

  const categoryQuery = useQuery({
    queryKey: ["analytics", "category-trends", timeRange],
    queryFn: () => getCategoryTrends(timeRange),
    staleTime: 60_000,
  });

  const balancesQuery = useQuery({
    queryKey: ["analytics", "account-balances"],
    queryFn: () => getAccountBalances(),
    staleTime: 60_000,
  });

  const merchantsQuery = useQuery({
    queryKey: ["analytics", "top-merchants", timeRange],
    queryFn: () => getTopMerchants({ limit: 8, months: timeRange }),
    staleTime: 60_000,
  });

  const incomeExpenseData = incomeExpenseQuery.data?.data ?? [];
  const latestMonth: IncomeExpenseMonth | undefined = incomeExpenseData[incomeExpenseData.length - 1];
  const prevMonth: IncomeExpenseMonth | undefined = incomeExpenseData[incomeExpenseData.length - 2];
  const totalIncome = incomeExpenseData.reduce((sum, month) => sum + month.income, 0);
  const totalExpense = incomeExpenseData.reduce((sum, month) => sum + month.expense, 0);
  const avgSavingsRate =
    incomeExpenseData.length > 0
      ? Math.round(
          incomeExpenseData.reduce((sum, month) => sum + month.savings_rate, 0) /
            incomeExpenseData.length,
        )
      : 0;
  const accounts = balancesQuery.data?.accounts ?? [];
  const chartAccounts = accounts.filter(account => account.currency === currency);
  const hasOtherCurrencies = chartAccounts.length !== accounts.length;
  const netWorth = balancesQuery.data?.summary?.net_worth ?? 0;

  const categoryData = categoryQuery.data?.data ?? [];
  const aggregatedCategories = new Map<string, number>();
  for (const month of categoryData) {
    for (const [category, amount] of Object.entries(month.categories)) {
      aggregatedCategories.set(category, (aggregatedCategories.get(category) || 0) + amount);
    }
  }

  const pieData = Array.from(aggregatedCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const merchants = merchantsQuery.data?.merchants ?? [];

  const chartData = incomeExpenseData.map((month) => ({
    month: formatMonth(month.month),
    Income: month.income,
    Expense: month.expense,
    Net: month.net,
  }));

  const spendingTrend =
    latestMonth && prevMonth ? (latestMonth.expense > prevMonth.expense ? "up" : "down") : undefined;
  const spendingChange =
    latestMonth && prevMonth && prevMonth.expense > 0
      ? `${Math.abs(Math.round(((latestMonth.expense - prevMonth.expense) / prevMonth.expense) * 100))}%`
      : undefined;

  const savingsTrend =
    latestMonth && prevMonth
      ? latestMonth.savings_rate >= prevMonth.savings_rate
        ? "up"
        : "down"
      : undefined;

  const [heatmapRange, setHeatmapRange] = useState(90);

  const heatmapQuery = useQuery({
    queryKey: ["analytics", "spending-heatmap", heatmapRange],
    queryFn: () => getSpendingHeatmap(heatmapRange),
    staleTime: 60_000,
  });

  const heatmapItems = heatmapQuery.data?.data ?? [];

  // Day of week analysis & spending velocity
  const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

  const dayStats = DAYS_OF_WEEK.map((name) => ({
    name,
    shortName: name.slice(0, 3),
    total: 0,
    count: 0,
    activeDatesCount: 0,
    avgDailySpend: 0,
    pctOfTotal: 0,
    isPeak: false,
  }));

  let totalHeatmapSpend = 0;
  let peakSingleDay: { date: string; total: number; count: number } | null = null;

  for (const item of heatmapItems) {
    const amount = Number(item.total || 0);
    const count = Number(item.count || 0);
    totalHeatmapSpend += amount;

    if (!peakSingleDay || amount > peakSingleDay.total) {
      peakSingleDay = { date: item.date, total: amount, count };
    }

    const [y, m, d] = item.date.split("-").map(Number);
    if (y && m && d) {
      const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const dayIdx = (utcDay + 6) % 7;
      dayStats[dayIdx].total += amount;
      dayStats[dayIdx].count += count;
      dayStats[dayIdx].activeDatesCount += 1;
    }
  }

  let maxDayTotal = 0;
  for (const day of dayStats) {
    if (day.total > maxDayTotal) {
      maxDayTotal = day.total;
    }
  }

  let peakDayName = "N/A";
  let peakDayStat = dayStats[0];
  for (const day of dayStats) {
    day.pctOfTotal = totalHeatmapSpend > 0 ? Math.round((day.total / totalHeatmapSpend) * 100) : 0;
    day.avgDailySpend = day.activeDatesCount > 0 ? day.total / day.activeDatesCount : 0;
    if (maxDayTotal > 0 && day.total === maxDayTotal) {
      day.isPeak = true;
      peakDayName = day.name;
      peakDayStat = day;
    }
  }

  const weekdaySpend = dayStats.slice(0, 5).reduce((acc, d) => acc + d.total, 0);
  const weekdayPct = totalHeatmapSpend > 0 ? Math.round((weekdaySpend / totalHeatmapSpend) * 100) : 0;
  const weekendPct = totalHeatmapSpend > 0 ? 100 - weekdayPct : 0;

  const dailyBurnRate = heatmapRange > 0 ? totalHeatmapSpend / heatmapRange : 0;

  const liquidCash = accounts
    .filter((acc) => ["checking", "savings"].includes(acc.type?.toLowerCase()) && acc.currency === currency)
    .reduce((acc, a) => acc + Math.max(0, a.balance), 0);

  const runwayDays = dailyBurnRate > 0 && liquidCash > 0 ? Math.floor(liquidCash / dailyBurnRate) : null;
  const runwayMonths = runwayDays !== null ? (runwayDays / 30.4375).toFixed(1) : null;

  const isLoading =
    incomeExpenseQuery.isLoading ||
    categoryQuery.isLoading ||
    balancesQuery.isLoading ||
    merchantsQuery.isLoading ||
    heatmapQuery.isLoading;

  const hasAnyData =
    incomeExpenseData.length > 0 ||
    pieData.length > 0 ||
    merchants.length > 0 ||
    accounts.length > 0 ||
    heatmapItems.length > 0;

  if ([incomeExpenseQuery, categoryQuery, balancesQuery, merchantsQuery, heatmapQuery].some(query => query.isError)) {
    return (
      <div className="page-grid flex-1 p-4 sm:p-6" data-testid="analytics-page">
        <Card className="mx-auto w-full max-w-xl p-6" role="alert">
          <h1 className="text-xl font-semibold">Analytics could not load</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Some financial records are unavailable. Retry to see the complete totals.
          </p>
          <Button className="mt-4" onClick={() => {
            for (const query of [incomeExpenseQuery, categoryQuery, balancesQuery, merchantsQuery, heatmapQuery]) {
              if (query.isError) void query.refetch();
            }
          }}>Retry analytics</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-grid flex-1 overflow-auto" data-testid="analytics-page">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <PageIntro
          icon={BarChart3}
          eyebrow="Insight Studio"
          title="Financial analytics that highlight movement, not just totals"
          description="Track whether your cash flow, category mix, and balances are getting healthier over time. Switch the window and use the charts to find drift before it becomes a pattern."
          stats={[
            {
              label: "Coverage",
              value: `${timeRange} month${timeRange === 1 ? "" : "s"}`,
            },
            {
              label: "Accounts tracked",
              value: String(accounts.length),
            },
            {
              label: "Net worth snapshot",
              value: hasOtherCurrencies ? "Not combined" : formatCompactCurrency(netWorth),
            },
          ]}
          actions={
            <>
              <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-background/80 p-1">
                {[3, 6, 12].map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                      timeRange === range
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    data-testid={`range-${range}m`}
                  >
                    {range}M
                  </button>
                ))}
              </div>
              <Badge variant="outline" className="h-fit rounded-full px-3 py-2 text-xs">
                Based on saved records
              </Badge>
            </>
          }
        />

        {isLoading ? (
          <AnalyticsLoadingState />
        ) : !hasAnyData ? (
          <Card className="surface-panel border-border/70 p-8" data-testid="analytics-empty-state">
            <EmptyState
              title="Not enough analytics data yet"
              description="Add transactions and accounts to unlock trend lines, category breakdowns, and account comparisons here."
              icon={BarChart3}
              action={<Button onClick={() => setTimeRange(12)}>Keep 12-month view ready</Button>}
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <AnalyticsStatCard
                title="Total income"
                value={formatCurrency(totalIncome)}
                subtitle={`Across the last ${timeRange} months`}
                icon={TrendingUp}
                tone="income"
                delay={0}
                testId="stat-total-income"
              />
              <AnalyticsStatCard
                title="Total expenses"
                value={formatCurrency(totalExpense)}
                subtitle={
                  latestMonth
                    ? `${formatMonth(latestMonth.month)} closed at ${formatCompactCurrency(latestMonth.expense)}`
                    : "Waiting for monthly expense data"
                }
                icon={TrendingDown}
                tone="expense"
                trendLabel={spendingChange}
                trendDirection={spendingTrend}
                delay={0.08}
                testId="stat-total-expenses"
              />
              <AnalyticsStatCard
                title="Net worth"
                value={hasOtherCurrencies ? "Not combined" : formatCurrency(netWorth)}
                subtitle={hasOtherCurrencies
                  ? "Accounts use different currencies; no exchange rates applied"
                  : `${accounts.length} account${accounts.length === 1 ? "" : "s"} represented`}
                icon={Wallet}
                tone="wealth"
                delay={0.16}
                testId="stat-net-worth"
              />
              <AnalyticsStatCard
                title="Average savings rate"
                value={`${avgSavingsRate}%`}
                subtitle={
                  latestMonth
                    ? `Latest month landed at ${latestMonth.savings_rate}%`
                    : "Waiting for monthly savings data"
                }
                icon={PiggyBank}
                tone="savings"
                trendLabel={latestMonth && prevMonth ? `${Math.abs(latestMonth.savings_rate - prevMonth.savings_rate)} pts` : undefined}
                trendDirection={savingsTrend}
                delay={0.24}
                testId="stat-savings-rate"
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
                <Card data-testid="card-income-expenses" className="surface-panel h-full border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Income vs expenses
                    </CardTitle>
                    <CardDescription>
                      Compare inflow, outflow, and how much room is left over each month.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={340}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="analytics-income" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.26} />
                              <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="analytics-expense" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(340 75% 55%)" stopOpacity={0.24} />
                              <stop offset="95%" stopColor="hsl(340 75% 55%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/70" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            className="fill-muted-foreground"
                            tickFormatter={(value) => formatCompactCurrency(value)}
                          />
                          <Tooltip content={<AnalyticsTooltip />} />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="Income"
                            stroke="hsl(142 71% 45%)"
                            fill="url(#analytics-income)"
                            strokeWidth={2.5}
                          />
                          <Area
                            type="monotone"
                            dataKey="Expense"
                            stroke="hsl(340 75% 55%)"
                            fill="url(#analytics-expense)"
                            strokeWidth={2.5}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState
                        title="No income and expense trend yet"
                        description="Monthly trend lines will appear here after transaction history has enough dated entries."
                        icon={Calendar}
                        className="py-14"
                      />
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
              >
                <Card data-testid="card-category-distribution" className="surface-panel h-full border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                      Spending by category
                    </CardTitle>
                    <CardDescription>
                      See which categories are consuming the biggest share of your spend.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={340}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={65}
                            outerRadius={108}
                            paddingAngle={3}
                            dataKey="value"
                            label={({ name, percent }) =>
                              `${name} ${(percent * 100).toFixed(0)}%`
                            }
                            labelLine={false}
                          >
                            {pieData.map((_, index) => (
                              <Cell
                                key={index}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<AnalyticsTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState
                        title="Category signals are still forming"
                        description="Once transactions include categories, this view will highlight where your money is concentrating."
                        icon={ShoppingBag}
                        className="py-14"
                      />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
              >
                <Card data-testid="card-top-merchants" className="surface-panel h-full border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Top merchants
                    </CardTitle>
                    <CardDescription>
                      The merchants absorbing the most budget in this time window.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {merchants.length > 0 ? (
                      <div className="space-y-4">
                        {merchants.map((merchant, index) => {
                          const maxTotal = merchants[0]?.total || 1;
                          const width = (merchant.total / maxTotal) * 100;

                          return (
                            <motion.div
                              key={merchant.merchant_id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{
                                        backgroundColor:
                                          CHART_COLORS[index % CHART_COLORS.length],
                                      }}
                                    />
                                    <span className="truncate text-sm font-medium text-foreground">
                                      {merchant.name}
                                    </span>
                                    <Badge variant="secondary" className="rounded-full text-[10px]">
                                      {merchant.count}x
                                    </Badge>
                                  </div>
                                </div>
                                <span className="text-sm font-semibold text-foreground">
                                  {formatCurrency(merchant.total)}
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-muted">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{
                                    backgroundColor:
                                      CHART_COLORS[index % CHART_COLORS.length],
                                  }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${width}%` }}
                                  transition={{ duration: 0.45, delay: index * 0.06 }}
                                />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState
                        title="No merchant leaderboard yet"
                        description="Merchant rankings will show up once transactions with merchant names are available."
                        icon={Building2}
                        className="py-12"
                      />
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
              >
                <Card data-testid="card-account-balances" className="surface-panel h-full border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      Account balances
                    </CardTitle>
                    <CardDescription>
                      Balances in {currency}, with liabilities clearly separated.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {hasOtherCurrencies && (
                      <p className="mb-4 text-sm text-muted-foreground">
                        Only {currency} accounts are shown. Other currencies are excluded; no exchange rates are applied.
                      </p>
                    )}
                    {chartAccounts.length > 0 ? (
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart
                          data={chartAccounts.map((account) => ({
                            name: account.name,
                            Balance: account.balance,
                            fill:
                              account.type === "credit"
                                ? "hsl(340 75% 55%)"
                                : "hsl(173 80% 40%)",
                          }))}
                          layout="vertical"
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-border/70"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 11 }}
                            className="fill-muted-foreground"
                            tickFormatter={(value) => formatCompactCurrency(value)}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 11 }}
                            className="fill-muted-foreground"
                            width={132}
                          />
                          <Tooltip content={<AnalyticsTooltip />} />
                          <Bar dataKey="Balance" radius={[0, 5, 5, 0]}>
                            {chartAccounts.map((account, index) => (
                              <Cell
                                key={`${account.name}-${index}`}
                                fill={
                                  account.type === "credit"
                                    ? "hsl(340 75% 55%)"
                                    : "hsl(173 80% 40%)"
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState
                        title="No account balances available"
                        description="Link or create accounts to compare balances and liabilities here."
                        icon={Wallet}
                        className="py-14"
                      />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card
                data-testid="card-spending-velocity"
                className="surface-panel border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]"
              >
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Spending velocity & day-of-week heatmap
                      </CardTitle>
                      <CardDescription>
                        Analyze which days drive peak spending, your daily burn rate, and projected cash runway.
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-background/80 p-1">
                      {[30, 90, 180, 365].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setHeatmapRange(days)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                            heatmapRange === days
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                          data-testid={`heatmap-range-${days}`}
                        >
                          {days}D
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Flame className="h-3.5 w-3.5 text-rose-500" />
                          Daily burn rate
                        </span>
                      </div>
                      <p className="text-xl font-bold tracking-tight text-foreground" data-testid="metric-daily-burn-rate">
                        {formatCurrency(dailyBurnRate)}
                        <span className="text-xs font-normal text-muted-foreground"> / day</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {totalHeatmapSpend > 0
                          ? `${formatCompactCurrency(totalHeatmapSpend)} over ${heatmapRange} days`
                          : "No expense records in range"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Zap className="h-3.5 w-3.5 text-amber-500" />
                          Peak spending day
                        </span>
                        {peakDayName !== "N/A" && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                            data-testid="badge-peak-day"
                          >
                            Peak Day
                          </Badge>
                        )}
                      </div>
                      <p className="text-xl font-bold tracking-tight text-foreground" data-testid="metric-peak-day">
                        {peakDayName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {peakDayStat && peakDayStat.total > 0
                          ? `${formatCurrency(peakDayStat.total)} (${peakDayStat.pctOfTotal}% of total spend)`
                          : "No expense activity"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          Weekday vs. weekend
                        </span>
                      </div>
                      <p className="text-xl font-bold tracking-tight text-foreground" data-testid="metric-weekday-weekend-ratio">
                        {weekdayPct}% <span className="text-sm font-normal text-muted-foreground">/</span> {weekendPct}%
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {weekdayPct >= 65
                          ? "Heavily concentrated on weekdays"
                          : weekendPct >= 40
                          ? "High weekend leisure expenditure"
                          : "Evenly balanced across the week"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Wallet className="h-3.5 w-3.5 text-sky-500" />
                          Cash runway
                        </span>
                      </div>
                      <p className="text-xl font-bold tracking-tight text-foreground" data-testid="metric-cash-runway">
                        {runwayDays !== null ? `${runwayDays} days` : "Indefinite"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {runwayMonths !== null
                          ? `~${runwayMonths} months based on liquid cash`
                          : "Based on available checking and savings"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3" data-testid="dow-heatmap-container">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground px-1">
                      <span className="font-semibold uppercase tracking-wider text-[11px]">
                        Day of week spending heatmap
                      </span>
                      <div className="flex items-center gap-3">
                        <span data-testid="metric-active-days">
                          {heatmapItems.length} active spending days in {heatmapRange}D
                        </span>
                        {peakSingleDay && (
                          <span className="hidden sm:inline" data-testid="metric-peak-single-day">
                            Peak date: {peakSingleDay.date} ({formatCurrency(peakSingleDay.total)})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-7">
                      {dayStats.map((day) => {
                        const maxVal = maxDayTotal || 1;
                        const barHeightPct = Math.max(8, Math.round((day.total / maxVal) * 100));

                        return (
                          <div
                            key={day.name}
                            data-testid={`dow-bar-${day.name.toLowerCase()}`}
                            className={`relative flex flex-col justify-between rounded-xl border p-3 transition-all ${
                              day.isPeak
                                ? "border-primary/50 bg-primary/5 shadow-sm"
                                : "border-border/60 bg-card/60 hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1 mb-2">
                              <span className="text-xs font-semibold text-foreground">{day.shortName}</span>
                              {day.isPeak && (
                                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                  TOP
                                </span>
                              )}
                            </div>

                            <div className="space-y-2">
                              <p className="text-sm font-bold text-foreground">
                                {formatCurrency(day.total)}
                              </p>

                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    day.isPeak ? "bg-primary" : "bg-primary/50"
                                  }`}
                                  style={{ width: `${barHeightPct}%` }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>{day.count} tx</span>
                                <span>{day.pctOfTotal}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <p className="pb-4 text-center text-xs text-muted-foreground">
              Analytics are based on transaction history across the last {timeRange} months and
              update when the workspace is refreshed or the selected window changes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

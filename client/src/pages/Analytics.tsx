import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calendar,
  PiggyBank,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  getAccountBalances,
  getCategoryTrends,
  getIncomeExpenseSummary,
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function AnalyticsTooltip({ active, payload, label }: any) {
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
            <span className="font-medium text-foreground">{formatCurrency(entry.value)}</span>
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
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof TrendingUp;
  tone: "income" | "expense" | "wealth" | "savings";
  trendLabel?: string;
  trendDirection?: "up" | "down";
  delay: number;
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
      <Card className="relative overflow-hidden border-border/70 bg-card/90 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)]">
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

  const isLoading =
    incomeExpenseQuery.isLoading ||
    categoryQuery.isLoading ||
    balancesQuery.isLoading ||
    merchantsQuery.isLoading;

  const hasAnyData =
    incomeExpenseData.length > 0 || pieData.length > 0 || merchants.length > 0 || accounts.length > 0;

  return (
    <div className="page-grid flex-1 overflow-auto">
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
              value: formatCompactCurrency(netWorth),
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
                  >
                    {range}M
                  </button>
                ))}
              </div>
              <Badge variant="outline" className="h-fit rounded-full px-3 py-2 text-xs">
                Refreshes every minute
              </Badge>
            </>
          }
        />

        {isLoading ? (
          <AnalyticsLoadingState />
        ) : !hasAnyData ? (
          <Card className="surface-panel border-border/70 p-8">
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
              />
              <AnalyticsStatCard
                title="Net worth"
                value={formatCurrency(netWorth)}
                subtitle={`${accounts.length} account${accounts.length === 1 ? "" : "s"} represented`}
                icon={Wallet}
                tone="wealth"
                delay={0.16}
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
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="surface-panel h-full border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]">
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
                <Card className="surface-panel h-full border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]">
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
                <Card className="surface-panel h-full border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]">
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
                <Card className="surface-panel h-full border-border/70 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.5)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      Account balances
                    </CardTitle>
                    <CardDescription>
                      Assets at a glance, with liabilities clearly separated.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {accounts.length > 0 ? (
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart
                          data={accounts.map((account) => ({
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
                            {accounts.map((account, index) => (
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

            <p className="pb-4 text-center text-xs text-muted-foreground">
              Analytics are based on transaction history across the last {timeRange} months and
              refresh automatically on a rolling cadence.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

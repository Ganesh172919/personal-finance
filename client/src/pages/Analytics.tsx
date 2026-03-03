import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  ShoppingBag,
  Calendar,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Separator } from "@/components/ui/Separator";
import {
  getIncomeExpenseSummary,
  getCategoryTrends,
  getAccountBalances,
  getTopMerchants,
  type IncomeExpenseMonth,
} from "@/lib/api/v1/analytics";

// ─── Constants ──────────────────────────────────────────

const CHART_COLORS = [
  "hsl(262, 83%, 58%)",  // violet
  "hsl(173, 80%, 40%)",  // teal
  "hsl(340, 75%, 55%)",  // rose
  "hsl(43, 96%, 56%)",   // amber
  "hsl(199, 89%, 48%)",  // sky
  "hsl(142, 71%, 45%)",  // green
  "hsl(25, 95%, 53%)",   // orange
  "hsl(280, 65%, 60%)",  // purple
  "hsl(0, 72%, 51%)",    // red
  "hsl(210, 40%, 60%)",  // slate
];

const PIE_COLORS = [
  "hsl(262, 83%, 58%)",
  "hsl(173, 80%, 40%)",
  "hsl(340, 75%, 55%)",
  "hsl(43, 96%, 56%)",
  "hsl(199, 89%, 48%)",
  "hsl(142, 71%, 45%)",
  "hsl(25, 95%, 53%)",
  "hsl(280, 65%, 60%)",
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ─── Stat Card ──────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
  color = "primary",
  index = 0,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  color?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Card className="relative overflow-hidden group hover:shadow-lg transition-shadow duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-gradient-to-br from-primary/5 to-transparent" />
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {title}
              </p>
              <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${color}/10`}>
                <Icon className={`w-5 h-5 text-${color}`} />
              </div>
              {trend && trendLabel && (
                <div className={`flex items-center gap-0.5 text-xs font-medium ${
                  trend === "up" ? "text-emerald-500" : trend === "down" ? "text-rose-500" : "text-muted-foreground"
                }`}>
                  {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {trendLabel}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Custom Tooltip ─────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-xl p-3 text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page Component ─────────────────────────────────────

export default function Analytics() {
  const [timeRange, setTimeRange] = useState(12);

  // ─── Data Fetches ───────────────────────────────────────
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

  // ─── Computed Data ──────────────────────────────────────
  const incomeExpenseData = incomeExpenseQuery.data?.data ?? [];
  const latestMonth: IncomeExpenseMonth | undefined = incomeExpenseData[incomeExpenseData.length - 1];
  const prevMonth: IncomeExpenseMonth | undefined = incomeExpenseData[incomeExpenseData.length - 2];

  const totalIncome = incomeExpenseData.reduce((sum, m) => sum + m.income, 0);
  const totalExpense = incomeExpenseData.reduce((sum, m) => sum + m.expense, 0);
  const avgSavingsRate = incomeExpenseData.length > 0
    ? Math.round(incomeExpenseData.reduce((sum, m) => sum + m.savings_rate, 0) / incomeExpenseData.length)
    : 0;

  const spendingTrend = latestMonth && prevMonth
    ? latestMonth.expense > prevMonth.expense ? "up" : "down"
    : undefined;
  const spendingChange = latestMonth && prevMonth && prevMonth.expense > 0
    ? `${Math.abs(Math.round(((latestMonth.expense - prevMonth.expense) / prevMonth.expense) * 100))}%`
    : undefined;

  const netWorth = balancesQuery.data?.summary?.net_worth ?? 0;
  const accounts = balancesQuery.data?.accounts ?? [];

  // Category pie chart data
  const categoryData = categoryQuery.data?.data ?? [];
  const allCategories = new Map<string, number>();
  for (const month of categoryData) {
    for (const [cat, amount] of Object.entries(month.categories)) {
      allCategories.set(cat, (allCategories.get(cat) || 0) + amount);
    }
  }
  const pieData = Array.from(allCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const merchants = merchantsQuery.data?.merchants ?? [];

  // Chart-ready income/expense data
  const chartData = incomeExpenseData.map((m) => ({
    month: formatMonth(m.month),
    Income: m.income,
    Expense: m.expense,
    Net: m.net,
  }));

  const isLoading = incomeExpenseQuery.isLoading && categoryQuery.isLoading && balancesQuery.isLoading;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="px-6 lg:px-8 py-6 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-2xl font-bold text-foreground flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              Financial Analytics
            </motion.h1>
            <p className="text-sm text-muted-foreground mt-1">
              Deep insights into your spending, income, and financial health
            </p>
          </div>

          {/* Time range selector */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
            {[3, 6, 12].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  timeRange === range
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {range}M
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Loading analytics…</p>
          </div>
        </div>
      ) : (
        <div className="px-6 lg:px-8 py-6 space-y-8">
          {/* ─── Stat Cards ──────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Income"
              value={formatCurrency(totalIncome)}
              subtitle={`Last ${timeRange} months`}
              icon={TrendingUp}
              color="primary"
              index={0}
            />
            <StatCard
              title="Total Expenses"
              value={formatCurrency(totalExpense)}
              subtitle={latestMonth ? `${formatMonth(latestMonth.month)}: ${formatCurrency(latestMonth.expense)}` : undefined}
              icon={TrendingDown}
              trend={spendingTrend as "up" | "down" | undefined}
              trendLabel={spendingChange}
              color="primary"
              index={1}
            />
            <StatCard
              title="Net Worth"
              value={formatCurrency(netWorth)}
              subtitle={`${accounts.length} account${accounts.length !== 1 ? "s" : ""}`}
              icon={Wallet}
              color="primary"
              index={2}
            />
            <StatCard
              title="Avg Savings Rate"
              value={`${avgSavingsRate}%`}
              subtitle={latestMonth ? `This month: ${latestMonth.savings_rate}%` : undefined}
              icon={PiggyBank}
              trend={latestMonth && prevMonth ? (latestMonth.savings_rate > prevMonth.savings_rate ? "up" : "down") : undefined}
              color="primary"
              index={3}
            />
          </div>

          {/* ─── Income vs Expense Chart ─────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Income vs Expenses
                </CardTitle>
                <CardDescription>Monthly comparison with net savings</CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(340, 75%, 55%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(340, 75%, 55%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area type="monotone" dataKey="Income" stroke="hsl(142, 71%, 45%)" fill="url(#incomeGrad)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Expense" stroke="hsl(340, 75%, 55%)" fill="url(#expenseGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                    No transaction data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── Category Breakdown + Top Merchants ──────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Pie */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-primary" />
                    Spending by Category
                  </CardTitle>
                  <CardDescription>Where your money goes</CardDescription>
                </CardHeader>
                <CardContent>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {pieData.map((_, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                      No category data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Top Merchants */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Top Merchants
                  </CardTitle>
                  <CardDescription>Your most frequent spending destinations</CardDescription>
                </CardHeader>
                <CardContent>
                  {merchants.length > 0 ? (
                    <div className="space-y-3">
                      {merchants.map((merchant, index) => {
                        const maxTotal = merchants[0]?.total || 1;
                        const pct = (merchant.total / maxTotal) * 100;
                        return (
                          <motion.div
                            key={merchant.merchant_id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.05 * index }}
                            className="group"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                />
                                <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                                  {merchant.name}
                                </span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {merchant.count}x
                                </Badge>
                              </div>
                              <span className="text-sm font-semibold text-foreground">
                                {formatCurrency(merchant.total)}
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ delay: 0.1 * index, duration: 0.5 }}
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                      No merchant data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* ─── Account Balances ────────────────────────── */}
          {accounts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    Account Balances
                  </CardTitle>
                  <CardDescription>
                    Assets: {formatCurrency(balancesQuery.data?.summary?.total_assets ?? 0)} •
                    Liabilities: {formatCurrency(balancesQuery.data?.summary?.total_liabilities ?? 0)} •
                    Net: {formatCurrency(netWorth)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={accounts.map((a) => ({
                        name: a.name,
                        Balance: a.balance,
                        fill: a.type === "credit" ? "hsl(340, 75%, 55%)" : "hsl(173, 80%, 40%)",
                      }))}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={120} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Balance" radius={[0, 4, 4, 0]}>
                        {accounts.map((a, idx) => (
                          <Cell
                            key={idx}
                            fill={a.type === "credit" ? "hsl(340, 75%, 55%)" : "hsl(173, 80%, 40%)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <Separator />

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center pb-4">
            Analytics data is based on your transactions from the last {timeRange} months.
            Data refreshes every minute.
          </p>
        </div>
      )}
    </div>
  );
}

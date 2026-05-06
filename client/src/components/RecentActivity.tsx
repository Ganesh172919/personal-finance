/**
 * @fileoverview RecentActivity — dashboard card showing the five most recent transactions
 * with type-specific icons, colour coding, and a "View All" link to the transactions page.
 *
 * WHAT IT DOES
 *  - Fetches the last 5 transactions from `/api/transactions/recent` via React Query.
 *  - Renders each transaction with an icon indicating type (income = green down-left arrow,
 *    expense = red up-right arrow, investment = blue refresh icon), description, category,
 *    date, and signed amount.
 *  - Clicking "View All" navigates to `/transactions`.
 *
 * KEY PROPS & DATA FLOW
 *  - No props — data is fully server-fetched.
 *  - Uses `useOrgFormatters` for locale-aware money and date formatting.
 *
 * ARCHITECTURE NOTES
 *  - One of the main dashboard grid cards alongside GoalProgress, InvestmentPortfolio, etc.
 *  - Framer Motion stagger (0.1 s per row) for a polished entry animation.
 *  - Purely presentational; transaction mutations are handled in the Transactions page.
 */
import { getRecentTransactions } from "@/lib/apiClient";
import { ArrowUpRight, ArrowDownLeft, RefreshCcw } from "lucide-react";
import { useLocation } from "wouter";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";

export function RecentActivity() {
  const [, navigate] = useLocation();
  const { formatMoney, formatDate } = useOrgFormatters();

  const { data } = useQuery({
    queryKey: ["/api/transactions/recent"],
    queryFn: () => getRecentTransactions(5),
  });

  const recentTransactions = data?.transactions || [];

  return (
    <Card className="p-6 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
        <button
          type="button"
          className="text-sm text-muted-foreground cursor-pointer hover:text-primary"
          onClick={() => navigate("/transactions")}
        >
          View All
        </button>
      </div>

      <div className="flex-1 space-y-4">
        {recentTransactions.length === 0 ? (
           <div className="text-center py-8 text-muted-foreground">
             No recent transactions found.
           </div>
        ) : (
          recentTransactions.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-2 rounded-full ${
                    t.type === "income"
                      ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                      : t.type === "investment"
                      ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                  }`}
                >
                  {t.type === "income" ? (
                    <ArrowDownLeft className="w-4 h-4" />
                  ) : t.type === "investment" ? (
                    <RefreshCcw className="w-4 h-4" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">{t.description}</p>
                  <p className="text-xs text-muted-foreground">{t.category} • {formatDate(t.date, { month: "short", day: "numeric" })}</p>
                </div>
              </div>
              <div
                className={`font-semibold ${
                  t.type === "income"
                    ? "text-green-600 dark:text-green-400"
                    : "text-foreground"
                }`}
              >
                {t.type === "income" ? "+" : "-"}
                {formatMoney(Math.abs(t.amount), { maximumFractionDigits: 0 })}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </Card>
  );
}

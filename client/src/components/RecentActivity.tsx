import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { useQuery } from "@tanstack/react-query";
import { getRecentTransactions } from "@/lib/apiClient";
import { ArrowUpRight, ArrowDownLeft, RefreshCcw } from "lucide-react";
import { useLocation } from "wouter";

export function RecentActivity() {
  const [, navigate] = useLocation();

  const { data } = useQuery({
    queryKey: ["/api/transactions/recent"],
    queryFn: () => getRecentTransactions(5),
  });

  const recentTransactions = data?.transactions || [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
  };

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
                  <p className="text-xs text-muted-foreground">{t.category} • {formatDate(t.date)}</p>
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
                {formatCurrency(t.amount)}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </Card>
  );
}

import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { IFinancialProfile } from "@/types";
import { ArrowUpRight, ArrowDownLeft, RefreshCcw } from "lucide-react";

export function RecentActivity() {
  const { user } = useAuth();
  const userId = user?.id || localStorage.getItem("userId");

  const { data: profile } = useQuery<IFinancialProfile>({
    queryKey: [`/api/financial-profiles/${userId}`],
    enabled: !!userId,
  });

  const transactions = profile?.transactions || [];
  // Sort by date descending and take top 5
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

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
        <span className="text-sm text-muted-foreground cursor-pointer hover:text-primary">View All</span>
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

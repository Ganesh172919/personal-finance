import { motion } from "framer-motion";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { IFinancialProfile } from "@/types";

export default function Transactions() {
  const { user } = useAuth();
  const userId = user?.id || localStorage.getItem("userId");

  const { data: profile } = useQuery<IFinancialProfile>({
    queryKey: [`/api/financial-profiles/${userId}`],
    enabled: !!userId,
  });

  const transactions = useMemo(() => {
    const allTransactions = profile?.transactions || [];
    return [...allTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [profile?.transactions]);

  const formatAmount = (amount: number, type: "income" | "expense" | "investment") => {
    const prefix = type === "income" ? "+" : "-";
    return `${prefix}${new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))}`;
  };

  const formatDate = (date: string | Date) =>
    new Date(date).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="transactions-page">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        <h1 className="text-3xl font-bold text-foreground mb-2">Transactions</h1>
        <p className="text-muted-foreground mb-8">
          Review your latest income, expenses, and investment entries.
        </p>

        <Card className="p-6">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions found yet.
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction, index) => (
                <motion.div
                  key={`${transaction.description}-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/50"
                >
                  <div>
                    <p className="font-medium text-foreground">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.category} - {formatDate(transaction.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold ${
                        transaction.type === "income"
                          ? "text-green-600 dark:text-green-400"
                          : "text-foreground"
                      }`}
                    >
                      {formatAmount(transaction.amount, transaction.type)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{transaction.type}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

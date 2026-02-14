import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Utensils, Car, Film, ShoppingBag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { IFinancialProfile } from "@/types";

interface SpendingCategory {
  name: string;
  amount: number;
  percentage: number;
  icon: typeof Utensils;
  color: string;
  budgetUsed: number;
}

const CATEGORY_COLORS = [
  "hsl(158 64% 52%)",
  "hsl(221 83% 53%)",
  "hsl(46 95% 53%)",
  "hsl(0 84% 60%)",
  "hsl(271 81% 56%)",
  "hsl(24 95% 53%)",
];

const getCategoryIcon = (categoryName: string) => {
  const lower = categoryName.toLowerCase();

  if (lower.includes("food") || lower.includes("dining") || lower.includes("grocery")) {
    return Utensils;
  }

  if (lower.includes("transport") || lower.includes("travel") || lower.includes("fuel")) {
    return Car;
  }

  if (lower.includes("movie") || lower.includes("entertainment") || lower.includes("fun")) {
    return Film;
  }

  return ShoppingBag;
};

export function SpendingAnalysis() {
  const { data: profile } = useQuery<IFinancialProfile>({
    queryKey: ["/api/financial-profiles/me"],
  });

  const transactions = profile?.transactions || [];
  const expenseTransactions = transactions.filter(t => t.type === "expense");

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const monthlyTotals = new Map<string, number>();
  expenseTransactions.forEach(transaction => {
    const key = new Date(transaction.date).toISOString().slice(0, 7);
    const current = monthlyTotals.get(key) || 0;
    monthlyTotals.set(key, current + Math.abs(transaction.amount));
  });

  const currentMonthTotal = monthlyTotals.get(currentMonthKey) || 0;
  const previousMonthTotal = monthlyTotals.get(previousMonthKey) || 0;

  const sourceTransactions =
    currentMonthTotal > 0
      ? expenseTransactions.filter(t => new Date(t.date).toISOString().slice(0, 7) === currentMonthKey)
      : expenseTransactions;

  const totalSpending = sourceTransactions.reduce((sum, transaction) => {
    return sum + Math.abs(transaction.amount);
  }, 0);

  const spendingChange =
    previousMonthTotal > 0
      ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
      : 0;

  const categoryMap = new Map<string, number>();
  sourceTransactions.forEach(transaction => {
    const current = categoryMap.get(transaction.category) || 0;
    categoryMap.set(transaction.category, current + Math.abs(transaction.amount));
  });

  const categories: SpendingCategory[] = Array.from(categoryMap.entries())
    .map(([name, amount], index) => {
      const percentage = totalSpending > 0 ? (amount / totalSpending) * 100 : 0;
      const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];

      return {
        name,
        amount,
        percentage,
        icon: getCategoryIcon(name),
        color,
        budgetUsed: Math.min(100, Math.round(percentage * 1.5)),
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  return (
    <Card className="p-6" data-testid="spending-analysis">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Spending Analysis</h3>
        <Select defaultValue="this-month">
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="chart-container rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <motion.div
              className="text-2xl font-bold text-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              â‚¹{Math.round(totalSpending).toLocaleString("en-IN")}
            </motion.div>
            <div className="text-sm text-muted-foreground">Total Spending</div>
          </div>
          <div className="text-right">
            <motion.div
              className={`text-lg font-semibold ${spendingChange <= 0 ? "text-chart-1" : "text-chart-4"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {spendingChange > 0 ? "+" : ""}
              {spendingChange.toFixed(1)}%
            </motion.div>
            <div className="text-xs text-muted-foreground">vs last month</div>
          </div>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="text-sm text-muted-foreground">No expense transactions yet.</div>
      ) : (
        <div className="space-y-3">
          {categories.map((category, index) => (
            <motion.div
              key={category.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 + 0.7 }}
              className="flex justify-between items-center p-3 bg-accent rounded-lg hover:bg-accent/80 transition-colors cursor-pointer"
              whileHover={{ scale: 1.02 }}
              data-testid={`category-${category.name.toLowerCase().replace(/\s/g, "-")}`}
            >
              <div className="flex items-center space-x-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${category.color}20` }}
                >
                  <category.icon className="w-4 h-4" style={{ color: category.color }} />
                </div>
                <div>
                  <div className="font-medium text-sm text-foreground">{category.name}</div>
                  <div className="text-xs text-muted-foreground">
                    â‚¹{Math.round(category.amount).toLocaleString("en-IN")} â€¢ {category.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="w-16 bg-muted rounded-full h-2">
                <motion.div
                  className="h-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${category.budgetUsed}%` }}
                  transition={{ delay: index * 0.2 + 1, duration: 1 }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}

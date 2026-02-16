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
import { getTransactionsSummary, TransactionsSummaryResponse } from "@/lib/apiClient";

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
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const toDate = now;

  const toYmd = (date: Date) => date.toISOString().slice(0, 10);
  const fromYmd = toYmd(fromDate);
  const toYmdValue = toYmd(toDate);

  const { data } = useQuery<TransactionsSummaryResponse>({
    queryKey: ["/api/transactions/summary", fromYmd, toYmdValue],
    queryFn: () =>
      getTransactionsSummary({
        from: fromYmd,
        to: toYmdValue,
        groupBy: "month",
        topCategories: 6,
      }),
  });

  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const currentMonthTotal = data?.monthly?.find(row => row.month === currentMonthKey)?.expense || 0;
  const previousMonthTotal = data?.monthly?.find(row => row.month === previousMonthKey)?.expense || 0;

  const totalSpending =
    currentMonthTotal > 0
      ? currentMonthTotal
      : (data?.top_categories || []).reduce((sum, category) => sum + category.amount, 0);

  const spendingChange =
    previousMonthTotal > 0
      ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
      : 0;

  const categories: SpendingCategory[] = (data?.top_categories || [])
    .slice(0, 6)
    .map((category, index) => {
      const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
      return {
        name: category.category,
        amount: category.amount,
        percentage: category.percentage,
        icon: getCategoryIcon(category.category),
        color,
        budgetUsed: Math.min(100, Math.round(category.percentage * 1.5)),
      };
    });

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

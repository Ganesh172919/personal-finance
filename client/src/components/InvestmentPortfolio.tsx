import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getPortfolioSummary, PortfolioSummaryResponse } from "@/lib/apiClient";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const allocationColor = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("equity")) return "hsl(158 64% 52%)";
  if (lower.includes("debt")) return "hsl(221 83% 53%)";
  if (lower.includes("gold")) return "hsl(46 95% 53%)";
  return "hsl(0 84% 60%)";
};

export function InvestmentPortfolio() {
  const { data } = useQuery<PortfolioSummaryResponse>({
    queryKey: ["/api/portfolio/summary", 12],
    queryFn: () => getPortfolioSummary({ months: 12 }),
  });

  const totalValue = Number(data?.summary?.total_invested || 0);
  const monthlySip = Number(data?.summary?.monthly_sip_estimate || 0);
  const monthChange = Number(data?.summary?.month_over_month_change_pct || 0);

  const allocations = (data?.allocations || []).map(item => ({
    name: item.name,
    percentage: item.percentage,
    color: allocationColor(item.name),
  }));

  const holdings = (data?.holdings || []).slice(0, 4).map(item => ({
    name: item.name,
    category: item.asset_class,
    value: item.invested_amount,
    weight: item.weight_percentage,
  }));

  return (
    <Card className="p-6" data-testid="investment-portfolio">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Investment Portfolio</h3>
        <Button
          variant="ghost"
          className="text-primary hover:text-primary/80 text-sm font-medium"
        >
          Manage
        </Button>
      </div>

      <div className="chart-container rounded-lg p-4 mb-6 relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <motion.div
              className="text-2xl font-bold text-chart-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {formatCurrency(totalValue)}
            </motion.div>
            <div className="text-sm text-muted-foreground">Total Invested Capital</div>
          </div>
          <div className="text-right">
            <motion.div
              className={`text-lg font-semibold ${monthChange >= 0 ? "text-chart-1" : "text-chart-4"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {monthChange >= 0 ? "+" : ""}
              {monthChange.toFixed(1)}%
            </motion.div>
            <div className="text-xs text-muted-foreground">MoM invested change</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-4">
          Monthly SIP estimate: {formatCurrency(monthlySip)}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {allocations.length === 0 ? (
            <div className="text-sm text-muted-foreground col-span-2">No investment allocations yet.</div>
          ) : (
            allocations.map((allocation, index) => (
              <motion.div
                key={allocation.name}
                className="space-y-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.8 }}
                data-testid={`allocation-${allocation.name.toLowerCase()}`}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: allocation.color }}
                  />
                  <span className="text-sm text-foreground">
                    {allocation.name} ({allocation.percentage.toFixed(1)}%)
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium text-muted-foreground">Top Holdings</div>
        <div className="space-y-2">
          {holdings.length === 0 ? (
            <div className="text-sm text-muted-foreground">No holdings yet.</div>
          ) : (
            holdings.map((holding, index) => (
              <motion.div
                key={holding.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 + 1.1 }}
                className="flex justify-between items-center p-2 hover:bg-accent rounded transition-colors cursor-pointer"
                whileHover={{ scale: 1.02 }}
                data-testid={`holding-${holding.name.toLowerCase().replace(/\s/g, "-")}`}
              >
                <div>
                  <div className="font-medium text-sm text-foreground">{holding.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {holding.category} • {formatCurrency(holding.value)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-chart-1">
                    {holding.weight.toFixed(1)}%
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

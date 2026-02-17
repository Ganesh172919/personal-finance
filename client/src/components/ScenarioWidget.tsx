import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useMutation } from "@tanstack/react-query";
import { processScenario, ScenarioResponse } from "@/lib/apiClient";
import { useLocation } from "wouter";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

export function ScenarioWidget() {
  const [amount, setAmount] = useState("");
  const [results, setResults] = useState<ScenarioResponse | null>(null);
  const [, navigate] = useLocation();

  const scenarioMutation = useMutation({
    mutationFn: async (expense: number) => {
      return processScenario({
        scenario_type: "expense",
        amount: expense,
      });
    },
    onSuccess: (data) => {
      setResults(data);
    },
  });

  const handleCalculate = () => {
    const expense = Number(amount);
    if (expense > 0) {
      scenarioMutation.mutate(expense);
    }
  };

  return (
    <Card className="p-6" data-testid="scenario-widget">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Quick Scenario</h3>
        <Button
          variant="ghost"
          className="text-primary hover:text-primary/80 text-sm font-medium"
          onClick={() => navigate("/scenarios")}
        >
          Full View
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex space-x-2">
          <Input
            type="number"
            placeholder="Enter amount (INR)"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            className="flex-1"
            data-testid="input-scenario-amount"
          />
          <Button
            onClick={handleCalculate}
            disabled={scenarioMutation.isPending}
            data-testid="button-calculate-scenario"
          >
            Calculate
          </Button>
        </div>

        {scenarioMutation.isPending && (
          <motion.div
            className="text-sm text-muted-foreground"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            AI agents are analyzing your scenario...
          </motion.div>
        )}

        {results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
            data-testid="scenario-results"
          >
            <div className="text-sm text-muted-foreground">If I spend {formatCurrency(Number(amount))}:</div>

            <div className="space-y-3">
              <motion.div
                className="flex justify-between items-center p-3 bg-accent rounded-lg"
                whileHover={{ scale: 1.02 }}
              >
                <span className="text-sm text-foreground">Remaining Budget</span>
                <span className="font-medium text-chart-3">{formatCurrency(results.newBudget)}</span>
              </motion.div>
              <motion.div
                className="flex justify-between items-center p-3 bg-accent rounded-lg"
                whileHover={{ scale: 1.02 }}
              >
                <span className="text-sm text-foreground">Savings Impact</span>
                <span className="font-medium text-chart-4">{formatCurrency(results.savingsImpact)}</span>
              </motion.div>
              <motion.div
                className="flex justify-between items-center p-3 bg-accent rounded-lg"
                whileHover={{ scale: 1.02 }}
              >
                <span className="text-sm">Goal Delay</span>
                <span className="font-medium text-chart-4">+{results.goalDelay} months</span>
              </motion.div>
            </div>

            {results.adjustments.length > 0 && (
              <div className="border-t border-border pt-4">
                <div className="text-xs text-muted-foreground mb-2">Suggested adjustments:</div>
                <div className="space-y-2">
                  {results.adjustments.map((adjustment, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-2 text-sm"
                    >
                      <span className="text-chart-4">−</span>
                      <span>
                        {adjustment.category}: -{formatCurrency(adjustment.reduction)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </Card>
  );
}

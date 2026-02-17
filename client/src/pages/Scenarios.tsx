import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Calculator, TrendingDown, TrendingUp, Target } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { processScenario, ScenarioResponse } from "@/lib/apiClient";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function Scenarios() {
  const [scenarioType, setScenarioType] = useState<"expense" | "income" | "investment">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [months, setMonths] = useState("12");
  const [expectedReturn, setExpectedReturn] = useState("10");
  const [results, setResults] = useState<ScenarioResponse | null>(null);

  const scenarioMutation = useMutation({
    mutationFn: processScenario,
    onSuccess: (data) => {
      setResults(data);
    },
  });

  const handleCalculate = () => {
    const numericAmount = Number(amount);
    const numericMonths = Number(months);
    const numericReturn = Number(expectedReturn);

    if (!numericAmount || numericAmount <= 0) return;

    scenarioMutation.mutate({
      scenario_type: scenarioType,
      amount: numericAmount,
      description,
      assumptions: {
        months: Number.isFinite(numericMonths) && numericMonths > 0 ? numericMonths : undefined,
        expected_return_pct:
          scenarioType === "investment" && Number.isFinite(numericReturn) ? numericReturn : undefined,
      },
    });
  };

  const scenarioTypes = [
    { value: "expense", label: "New Expense", icon: TrendingDown },
    { value: "income", label: "Income Change", icon: TrendingUp },
    { value: "investment", label: "Investment Plan", icon: Target },
  ];

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="scenarios-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">What-If Scenarios</h1>
          <p className="text-muted-foreground">
            Model profile-aware scenarios before changing your real plan.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-6 flex items-center">
              <Calculator className="w-5 h-5 mr-2 text-primary" />
              Scenario Builder
            </h3>

            <div className="space-y-6">
              <div>
                <Label className="text-sm font-medium mb-2 block">Scenario Type</Label>
                <Select value={scenarioType} onValueChange={(value: any) => setScenarioType(value)}>
                  <SelectTrigger data-testid="select-scenario-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarioTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center space-x-2">
                          <type.icon className="w-4 h-4" />
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">Amount</Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  data-testid="input-scenario-amount"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Horizon (months)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={months}
                    onChange={event => setMonths(event.target.value)}
                    data-testid="input-scenario-months"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Return % (invest)</Label>
                  <Input
                    type="number"
                    value={expectedReturn}
                    onChange={event => setExpectedReturn(event.target.value)}
                    disabled={scenarioType !== "investment"}
                    data-testid="input-scenario-return"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">Description</Label>
                <Input
                  placeholder="e.g., Salary raise, car EMI, SIP increase"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  data-testid="input-scenario-description"
                />
              </div>

              <Button
                onClick={handleCalculate}
                disabled={!amount || scenarioMutation.isPending}
                className="w-full"
                data-testid="button-calculate-scenario"
              >
                {scenarioMutation.isPending ? "Analyzing..." : "Calculate Impact"}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-6">Impact Analysis</h3>

            {scenarioMutation.isPending && (
              <motion.div
                className="text-center py-8"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <div className="text-muted-foreground">Analyzing scenario...</div>
              </motion.div>
            )}

            {results && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
                data-testid="scenario-results-detailed"
              >
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-accent rounded-lg p-4">
                    <div className="text-sm text-muted-foreground mb-1">Monthly Surplus</div>
                    <div className="text-xl font-bold text-foreground">
                      {formatCurrency(results.delta.new_monthly_surplus)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Baseline {formatCurrency(results.baseline.monthly_surplus)}
                    </div>
                  </div>

                  <div className="bg-accent rounded-lg p-4">
                    <div className="text-sm text-muted-foreground mb-1">Savings Change</div>
                    <div
                      className={`text-xl font-bold ${
                        results.delta.savings_change_horizon < 0 ? "text-chart-4" : "text-chart-1"
                      }`}
                    >
                      {results.delta.savings_change_horizon < 0 ? "−" : "+"}
                      {formatCurrency(Math.abs(results.delta.savings_change_horizon))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Over {results.assumptions.months} months
                    </div>
                  </div>

                  <div className="bg-accent rounded-lg p-4">
                    <div className="text-sm text-muted-foreground mb-1">Goal Timeline Impact</div>
                    <div className="text-xl font-bold text-chart-4">
                      {results.delta.goal_timeline_delta_months >= 0 ? "+" : ""}
                      {results.delta.goal_timeline_delta_months} months
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Delay (+) or acceleration (−)
                    </div>
                  </div>
                </div>

                {typeof results.delta.projected_investment_value === "number" && (
                  <div className="bg-accent rounded-lg p-4">
                    <div className="text-sm text-muted-foreground mb-1">Projected Investment Value</div>
                    <div className="text-xl font-bold text-chart-1">
                      {formatCurrency(results.delta.projected_investment_value)}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-foreground mb-2">Assumptions</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Horizon: {results.assumptions.months} months</div>
                    <div>Expected return: {results.assumptions.expected_return_pct}%</div>
                    <div>Inflation: {results.assumptions.inflation_pct}%</div>
                  </div>
                </div>

                {results.recommendations?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Recommendations</h4>
                    <ul className="list-disc ml-5 text-sm text-muted-foreground space-y-1">
                      {results.recommendations.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}

            {!results && !scenarioMutation.isPending && (
              <div className="text-center py-8 text-muted-foreground">
                Enter a scenario to see profile-aware impact.
              </div>
            )}
          </Card>
        </div>
      </motion.div>
    </div>
  );
}

import { useState } from "react";
import { motion } from "framer-motion";
import { Star, BarChart3, GraduationCap, TrendingUp, CreditCard, PiggyBank } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { IAgentOutput } from "@/types";
import { useLocation } from "wouter";
import { InsightDetailModal } from "./InsightDetailModal"; // Make sure this is imported

export function ActionableInsights() {
  const { user } = useAuth();
  const userId = user?.id || localStorage.getItem("userId");
  const [, navigate] = useLocation();

  // This state manages the modal
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);

  const { data: insights = [] } = useQuery<IAgentOutput[]>({
    queryKey: [`/api/agent-outputs/user`, userId], // Correct array-based queryKey
    enabled: !!userId,
  });

  const getInsightIcon = (agentType: string) => {
    switch (agentType) {
      case "master": return Star;
      case "budget_planner": return BarChart3;
      case "financial_educator": return GraduationCap;
      case "investment_advisor": return TrendingUp;
      case "debt_optimizer": return CreditCard;
      case "income_expense_analyzer": return PiggyBank;
      default: return Star;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return "hsl(0 0% 100%)";
      case "medium": return "hsl(0 0% 82%)";
      case "low": return "hsl(0 0% 66%)";
      default: return "hsl(0 0% 90%)";
    }
  };

  // This handles the "Take Action" button
  const handleAction = (e: React.MouseEvent, actionType: string | undefined, _id?: string) => {
    e.stopPropagation(); // Stop the click from opening the modal
    if (!actionType) return;

    const actionRouteMap: Record<string, string> = {
      "invest": "/portfolio",
      "review_budget": "/dashboard",
      "start_learning": "/dashboard",
      "optimize_spending": "/dashboard",
      "manage_debt": "/dashboard",
      "increase_savings": "/dashboard",
      "review": "/dashboard"
    };
    const route = actionRouteMap[actionType] || "/dashboard";
    navigate(route);
  };

  const handleViewAll = () => {
    navigate("/all-insights");
  };

  const handleCardClick = (insightId: string) => {
    setSelectedInsightId(insightId);
  };

  return (
    <div className="w-full">
      <Card className="p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
              AI-generated insights
            </p>
            <h3 className="text-lg font-semibold text-foreground">What deserves your attention now</h3>
            <p className="text-sm text-muted-foreground">
              Recommendations are ranked to help you act before financial friction builds up.
            </p>
          </div>
          <Button variant="ghost" className="self-start rounded-full sm:self-auto" onClick={handleViewAll}>
            View all
          </Button>
        </div>

        <div className="space-y-4" data-testid="insights-container">
          {insights.length === 0 ? (
            <div className="rounded-[calc(var(--radius)-2px)] border border-dashed border-border/80 bg-background/60 px-6 py-10 text-center">
              <div className="mx-auto max-w-md space-y-2">
                <h4 className="text-base font-semibold text-foreground">No insights yet</h4>
                <p className="text-sm text-muted-foreground">
                  Ask the copilot a planning question or upload more activity to generate tailored guidance.
                </p>
              </div>
            </div>
          ) : (
            insights.slice(0, 4).map((insight, index) => {
              const Icon = getInsightIcon(insight.agentType);
              const color = getPriorityColor(insight.priority || "medium");
              const isHighPriority = insight.priority?.toLowerCase() === "high";
              const actionType = insight.outputData?.actionType || insight.outputData?.action;

              return (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`cursor-pointer rounded-[calc(var(--radius)-2px)] border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-26px_rgba(15,23,42,0.55)] ${
                    isHighPriority
                      ? "border-white/20 bg-white/5"
                      : "border-border/70 bg-background/70"
                  }`}
                  data-testid={`insight-${insight.id}`}
                  onClick={() => handleCardClick(insight.id)}
                >
                  <div className="flex items-start space-x-3">
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <div className="font-medium text-sm text-foreground">
                          {insight.outputData?.title || "Financial Insight"}
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                          style={{
                            backgroundColor: `${color}1A`,
                            color,
                          }}
                        >
                          {insight.priority || "medium"}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-3 leading-6">
                        {insight.outputData?.description || "Analysis completed"}
                      </div>
                      {insight.actionable && actionType && (
                        <Button
                          size="sm"
                          onClick={(e) => handleAction(e, actionType, insight.id)}
                          style={{
                            backgroundColor: color,
                            color: "black",
                          }}
                          className="rounded-full hover:opacity-90"
                          data-testid={`button-${actionType}`}
                        >
                          {actionType === "invest" ? "View Portfolio" :
                           actionType === "review_budget" ? "Review Budget" :
                           actionType === "start_learning" ? "Start Learning" :
                           actionType === "optimize_spending" ? "Optimize Spending" :
                           actionType === "manage_debt" ? "Manage Debt" :
                           actionType === "increase_savings" ? "Increase Savings" :
                           "Take Action"}
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </Card>
      
      {/* This renders the modal when selectedInsightId is set */}
      <InsightDetailModal
        isOpen={!!selectedInsightId}
        onClose={() => setSelectedInsightId(null)}
        insightId={selectedInsightId}
      />
    </div>
  );
}

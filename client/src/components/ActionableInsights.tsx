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
      case "high": return "hsl(0 84% 60%)";
      case "medium": return "hsl(46 95% 53%)";
      case "low": return "hsl(158 64% 52%)";
      default: return "hsl(221 83% 53%)";
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
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">AI-Generated Insights</h3>
          <Button
            variant="ghost"
            className="text-primary hover:text-primary/80 text-sm font-medium"
            onClick={handleViewAll}
          >
            View All
          </Button>
        </div>

        <div className="space-y-4" data-testid="insights-container">
          {insights.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No insights available yet. Try asking the AI for financial advice!
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
                  // === FIX 2: Added cursor-pointer and onClick handler ===
                  className={`rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${
                    isHighPriority
                      ? "bg-destructive/10 border border-destructive/30"
                      : "bg-accent"
                  }`}
                  data-testid={`insight-${insight.id}`}
                  onClick={() => handleCardClick(insight.id)} // This opens the modal
                >
                  <div className="flex items-start space-x-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm mb-1">
                        {insight.outputData?.title || "Financial Insight"}
                      </div>
                      <div className="text-sm text-muted-foreground mb-3">
                        {insight.outputData?.description || "Analysis completed"}
                      </div>
                      {insight.actionable && actionType && (
                        <Button
                          size="sm"
                          onClick={(e) => handleAction(e, actionType, insight.id)}
                          style={{
                            backgroundColor: color,
                            color: isHighPriority ? 'white' : 'black'
                          }}
                          className="text-white hover:opacity-90"
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
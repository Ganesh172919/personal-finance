/**
 * @fileoverview All AI-Generated Insights page.
 *
 * Displays every AI-generated insight for the current user with rich filtering,
 * search, priority badges, and actionable routing. Each insight card shows
 * an icon mapped to the originating agent type, priority level, relative date,
 * and an optional "Take Action" button that navigates to the relevant page
 * (e.g. Portfolio, Scenarios, Goals & Debts, Financial Story).
 *
 * Key data flows:
 * - Fetches all agent outputs via /api/agent-outputs/user using the userId
 *   from useAuth (or localStorage fallback).
 * - Client-side search and priority filtering.
 * - Maps action types to internal routes for quick navigation.
 * - Opens an InsightDetailModal when a card is clicked for full plan inspection.
 *
 * Accessible from the dashboard ("View all insights") and navigation menu.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Star,
  BarChart3,
  GraduationCap,
  TrendingUp,
  CreditCard,
  PiggyBank,
  Search,
  Sparkles,
  ArrowRight,
  Clock,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { IAgentOutput } from "@/types";
import { useLocation } from "wouter";
import { InsightDetailModal } from "@/components/InsightDetailModal";

const AGENT_LABELS: Record<string, string> = {
  master: "Master Orchestrator",
  budget_planner: "Budget Planner",
  financial_educator: "Financial Educator",
  investment_advisor: "Investment Advisor",
  debt_optimizer: "Debt Optimizer",
  income_expense_analyzer: "Income & Expense",
};

function formatInsightDate(timestamp: Date | string | undefined): string {
  if (!timestamp) return "";
  try {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function AllInsights() {
  const { user } = useAuth();
  const userId = user?.id || (user as any)?._id || localStorage.getItem("userId");
  const [, navigate] = useLocation();

  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: insights = [], isLoading } = useQuery<IAgentOutput[]>({
    queryKey: [`/api/agent-outputs/user`, userId],
    enabled: !!userId,
  });

  const getInsightIcon = (agentType: string) => {
    switch (agentType) {
      case "master":
        return Star;
      case "budget_planner":
        return BarChart3;
      case "financial_educator":
        return GraduationCap;
      case "investment_advisor":
        return TrendingUp;
      case "debt_optimizer":
        return CreditCard;
      case "income_expense_analyzer":
        return PiggyBank;
      default:
        return Sparkles;
    }
  };

  const handleAction = (e: React.MouseEvent, actionType: string | undefined) => {
    e.stopPropagation();
    if (!actionType) return;

    const actionRouteMap: Record<string, string> = {
      invest: "/portfolio",
      review_budget: "/scenarios",
      start_learning: "/financial-story",
      optimize_spending: "/scenarios",
      manage_debt: "/goals-and-debts",
      increase_savings: "/goals-and-debts",
      review: "/dashboard",
    };
    const route = actionRouteMap[actionType] || "/dashboard";
    navigate(route);
  };

  const handleCardClick = (insightId: string) => {
    setSelectedInsightId(insightId);
  };

  const highPriorityCount = useMemo(
    () => insights.filter((i) => i.priority?.toLowerCase() === "high").length,
    [insights]
  );

  const actionableCount = useMemo(
    () => insights.filter((i) => i.actionable || i.outputData?.actionType || i.outputData?.action).length,
    [insights]
  );

  const filteredInsights = useMemo(() => {
    return insights.filter((insight) => {
      // Priority filter
      if (priorityFilter !== "all" && insight.priority?.toLowerCase() !== priorityFilter) {
        return false;
      }
      // Agent filter
      if (agentFilter !== "all" && insight.agentType !== agentFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const title = (insight.outputData?.title || "").toLowerCase();
        const desc = (insight.outputData?.description || "").toLowerCase();
        const agent = (AGENT_LABELS[insight.agentType] || insight.agentType).toLowerCase();
        return title.includes(query) || desc.includes(query) || agent.includes(query);
      }
      return true;
    });
  }, [insights, priorityFilter, agentFilter, searchQuery]);

  const clearFilters = () => {
    setPriorityFilter("all");
    setAgentFilter("all");
    setSearchQuery("");
  };

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="all-insights-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto space-y-6"
      >
        {/* Header & Metrics */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <h1 className="text-3xl font-bold text-foreground">All AI-Generated Insights</h1>
              <Badge variant="outline" className="text-xs">
                {insights.length} total
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Comprehensive guidance, optimization recommendations, and strategic plans produced by your AI advisor team.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/chat")}
              className="text-xs"
              data-testid="button-ask-copilot-header"
            >
              <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-primary" />
              Ask Copilot
            </Button>
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="p-3.5 flex items-center space-x-3 bg-card/60">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Insights</div>
              <div className="text-lg font-bold text-foreground" data-testid="metric-total-insights">
                {insights.length}
              </div>
            </div>
          </Card>

          <Card className="p-3.5 flex items-center space-x-3 bg-card/60">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">High Priority</div>
              <div className="text-lg font-bold text-destructive" data-testid="metric-high-priority">
                {highPriorityCount}
              </div>
            </div>
          </Card>

          <Card className="p-3.5 flex items-center space-x-3 bg-card/60 col-span-2 sm:col-span-1">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 flex-shrink-0">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Actionable Plans</div>
              <div className="text-lg font-bold text-emerald-500" data-testid="metric-actionable-plans">
                {actionableCount}
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar & Filters */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search insights by title, agent, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
                data-testid="input-search-insights"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-[180px] text-xs h-9" data-testid="select-agent-filter">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  <SelectItem value="master">Master Orchestrator</SelectItem>
                  <SelectItem value="budget_planner">Budget Planner</SelectItem>
                  <SelectItem value="investment_advisor">Investment Advisor</SelectItem>
                  <SelectItem value="debt_optimizer">Debt Optimizer</SelectItem>
                  <SelectItem value="financial_educator">Financial Educator</SelectItem>
                  <SelectItem value="income_expense_analyzer">Income & Expense</SelectItem>
                </SelectContent>
              </Select>

              {(priorityFilter !== "all" || agentFilter !== "all" || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-filters"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Priority Quick Filter Pills */}
          <div className="flex items-center space-x-1.5 pt-1 text-xs">
            <span className="text-muted-foreground font-medium mr-1">Priority:</span>
            <Button
              type="button"
              variant={priorityFilter === "all" ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setPriorityFilter("all")}
              data-testid="filter-priority-all"
            >
              All ({insights.length})
            </Button>
            <Button
              type="button"
              variant={priorityFilter === "high" ? "destructive" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setPriorityFilter("high")}
              data-testid="filter-priority-high"
            >
              High ({highPriorityCount})
            </Button>
            <Button
              type="button"
              variant={priorityFilter === "medium" ? "secondary" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setPriorityFilter("medium")}
              data-testid="filter-priority-medium"
            >
              Medium ({insights.filter((i) => i.priority?.toLowerCase() === "medium").length})
            </Button>
            <Button
              type="button"
              variant={priorityFilter === "low" ? "outline" : "outline"}
              size="sm"
              className={`h-7 px-2.5 text-xs ${
                priorityFilter === "low" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" : ""
              }`}
              onClick={() => setPriorityFilter("low")}
              data-testid="filter-priority-low"
            >
              Low ({insights.filter((i) => i.priority?.toLowerCase() === "low").length})
            </Button>
          </div>
        </Card>

        {/* Insights Container */}
        <div className="space-y-3" data-testid="insights-container">
          {isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-primary animate-pulse" />
              <div>Loading AI insights...</div>
            </div>
          )}

          {!isLoading && insights.length === 0 && (
            <Card className="p-12 text-center text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <div className="text-foreground font-semibold text-lg mb-1">No Insights Available Yet</div>
              <p className="text-sm max-w-md mx-auto mb-4">
                Ask FinWise Copilot for financial advice or run a scenario simulation to generate tailored recommendations.
              </p>
              <Button size="sm" onClick={() => navigate("/chat")} data-testid="button-chat-empty-state">
                <MessageSquare className="w-4 h-4 mr-1.5" />
                Ask Copilot
              </Button>
            </Card>
          )}

          {!isLoading && insights.length > 0 && filteredInsights.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              <div className="text-foreground font-medium mb-1">No Matching Insights</div>
              <p className="text-xs mb-3">No insights found matching your current filter criteria.</p>
              <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs">
                Reset Filters
              </Button>
            </Card>
          )}

          {!isLoading &&
            filteredInsights.map((insight) => {
              const Icon = getInsightIcon(insight.agentType);
              const priority = insight.priority?.toLowerCase() || "medium";
              const isHigh = priority === "high";
              const isMedium = priority === "medium";
              const actionType = insight.outputData?.actionType || insight.outputData?.action;
              const formattedDate = formatInsightDate(insight.timestamp);

              return (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl p-4 cursor-pointer border transition-all duration-200 hover:shadow-md ${
                    isHigh
                      ? "bg-destructive/5 border-destructive/30 hover:border-destructive/50"
                      : "bg-card border-border hover:border-primary/40"
                  }`}
                  data-testid={`insight-${insight.id}`}
                  onClick={() => handleCardClick(insight.id)}
                >
                  <div className="flex items-start space-x-3.5">
                    {/* Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isHigh
                          ? "bg-destructive text-destructive-foreground"
                          : isMedium
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm text-foreground">
                            {insight.outputData?.title || "Financial Insight"}
                          </span>
                          <Badge
                            variant={isHigh ? "destructive" : isMedium ? "secondary" : "outline"}
                            className="text-[10px] px-1.5 py-0 capitalize"
                          >
                            {priority}
                          </Badge>
                        </div>

                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                          <span className="text-[11px] font-medium bg-accent px-2 py-0.5 rounded">
                            {AGENT_LABELS[insight.agentType] || insight.agentType}
                          </span>
                          {formattedDate && (
                            <span className="flex items-center text-[11px]">
                              <Clock className="w-3 h-3 mr-1" />
                              {formattedDate}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                        {insight.outputData?.description || insight.outputData?.response || "Analysis completed."}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-muted-foreground hover:underline">
                          Click to view full analysis & plan
                        </span>

                        {actionType && (
                          <Button
                            size="sm"
                            variant={isHigh ? "destructive" : "default"}
                            onClick={(e) => handleAction(e, actionType)}
                            className="text-xs h-7 px-2.5"
                            data-testid={`button-${actionType}`}
                          >
                            {actionType === "invest"
                              ? "View Portfolio"
                              : actionType === "review_budget"
                              ? "Review Budget"
                              : actionType === "start_learning"
                              ? "Start Learning"
                              : actionType === "optimize_spending"
                              ? "Optimize Spending"
                              : actionType === "manage_debt"
                              ? "Manage Debt"
                              : actionType === "increase_savings"
                              ? "Increase Savings"
                              : "Take Action"}
                            <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
        </div>

        {/* Modal for detail view */}
        <InsightDetailModal
          isOpen={!!selectedInsightId}
          onClose={() => setSelectedInsightId(null)}
          insightId={selectedInsightId}
        />
      </motion.div>
    </div>
  );
}

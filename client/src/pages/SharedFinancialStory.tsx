/**
 * @fileoverview Public read-only view of a shared financial story snapshot.
 *
 * Renders a financial story generated via createFinancialStoryShare()
 * without requiring authentication.  The share token is extracted from
 * the URL route parameter and used to fetch the public payload.
 *
 * Key data flows:
 * - getPublicFinancialStoryShare(token) fetches the snapshot payload
 *   containing goals, milestones, currency, and locale info.
 * - Money formatting uses the payload's locale and currency with
 *   Intl.NumberFormat for correct regional display.
 * - Milestone icons are mapped per agent type (budget planner, debt
 *   optimizer, investment advisor, etc.).
 *
 * No mutation or write operations; purely presentational.  Shows a
 * loading spinner while fetching and an error state if the token is
 * invalid or expired.
 *
 * Routed at /share/financial-story/:token; linked from the FinancialStory
 * page's "Share" action.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Star, BarChart3, CreditCard, PiggyBank, TrendingUp, GraduationCap, Clock } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { getPublicFinancialStoryShare } from "@/lib/apiClient";
import type { PublicSharePayloadFinancialStory } from "@/lib/api/v1/shares";

const milestoneIcons: Record<string, any> = {
  master: Star,
  budget_planner: BarChart3,
  debt_optimizer: CreditCard,
  income_expense_analyzer: PiggyBank,
  investment_advisor: TrendingUp,
  financial_educator: GraduationCap,
  default: Star,
};

const formatMilestoneDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
};

const formatIsoDate = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function SharedFinancialStory() {
  const [, params] = useRoute("/share/financial-story/:token");
  const token = params?.token || "";

  const shareQuery = useQuery({
    queryKey: ["public-share-financial-story", token],
    queryFn: () => getPublicFinancialStoryShare(token),
    enabled: Boolean(token),
    retry: 1,
  });

  const payload = (shareQuery.data?.payload || null) as PublicSharePayloadFinancialStory | null;

  const locale = payload?.locale || "en-US";
  const currency = payload?.currency || "USD";

  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [locale, currency]
  );

  const formatMoney = (value: number) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    return moneyFormatter.format(num);
  };

  if (shareQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!payload || shareQuery.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6 max-w-lg">
          <div className="text-lg font-semibold text-foreground">Share link unavailable</div>
          <div className="text-sm text-muted-foreground mt-2">
            This link may have expired or been revoked.
          </div>
          {shareQuery.data?.request_id ? (
            <div className="text-xs text-muted-foreground mt-2">Request ID: {shareQuery.data.request_id}</div>
          ) : null}
        </Card>
      </div>
    );
  }

  const goals = Array.isArray(payload.goals) ? payload.goals : [];
  const milestones = Array.isArray(payload.milestones) ? payload.milestones : [];

  const healthPercentage = Number(payload.summary?.health_percentage || 0);

  return (
    <div className="min-h-screen p-6 overflow-auto" data-testid="shared-financial-story">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Shared Financial Story</h1>
          <p className="text-muted-foreground">
            Snapshot generated {payload.generated_at ? formatIsoDate(payload.generated_at) : "recently"}.
          </p>
          {shareQuery.data?.expires_at ? (
            <p className="text-xs text-muted-foreground mt-1">
              Link expires {formatIsoDate(shareQuery.data.expires_at)}.
            </p>
          ) : null}
        </div>

        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">Overall Financial Health</h3>
            <div className="text-2xl font-bold text-primary">{healthPercentage}%</div>
          </div>

          <Progress value={healthPercentage} className="mb-4" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-chart-1">{Number(payload.summary?.goals_active || goals.length)}</div>
              <div className="text-sm text-muted-foreground">Goals Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-chart-2">
                {Number(payload.summary?.milestones_count || milestones.length)}
              </div>
              <div className="text-sm text-muted-foreground">Milestones</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-chart-3">
                {formatMoney(Number(payload.summary?.total_assets || 0))}
              </div>
              <div className="text-sm text-muted-foreground">Total Assets</div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {goals.map((goal, index) => {
            const target = Number(goal.target || 0);
            const current = Number(goal.current || 0);
            const progress = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
            return (
              <motion.div
                key={`${goal.name}-${index}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="p-5 hover:shadow-lg transition-shadow duration-300">
                  <h4 className="font-semibold text-foreground mb-1">{goal.name}</h4>
                  {goal.deadline ? (
                    <div className="text-xs text-muted-foreground flex items-center mb-3">
                      <Clock className="w-3 h-3 mr-1" />
                      Deadline: {String(goal.deadline)}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mb-3">Priority: {Number(goal.priority || 1)}</div>
                  )}

                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-foreground">{formatMoney(current)}</span>
                      <span className="text-foreground">{formatMoney(target)}</span>
                    </div>
                    <Progress value={progress} className="h-3" />
                    <div className="text-xs text-muted-foreground mt-1">{Math.round(progress)}% complete</div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-6">Milestones</h3>
          {milestones.length === 0 ? (
            <div className="text-sm text-muted-foreground">No milestones included in this share.</div>
          ) : (
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-px bg-border"></div>
              <div className="space-y-6">
                {milestones.map((milestone, index) => {
                  const Icon = milestoneIcons[milestone.agent_type] || milestoneIcons.default;
                  return (
                    <motion.div
                      key={`${milestone.timestamp}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="relative flex items-start space-x-4"
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center relative z-10 bg-primary">
                        <Icon className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-foreground">{milestone.title}</h4>
                          <div className="text-xs text-muted-foreground">{formatMilestoneDate(milestone.timestamp)}</div>
                        </div>
                        <p className="text-sm text-muted-foreground">{milestone.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}


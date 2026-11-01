/**
 * @fileoverview GoalProgress — dashboard card that lists all user financial goals
 * with animated progress bars and deadline countdowns.
 *
 * WHAT IT DOES
 *  - Fetches the user's financial profile via React Query and extracts `goals[]`.
 *  - Renders each goal as an animated row: name, current/target amounts, a color-coded
 *    progress bar (green >= 80 %, blue >= 50 %, yellow below), and months remaining.
 *  - Shows an empty-state message when no goals have been set.
 *
 * KEY PROPS & DATA FLOW
 *  - No props — data is fetched from `GET /api/financial-profiles/me`.
 *  - Uses `useOrgFormatters` for currency display that adapts to the organisation locale.
 *
 * ARCHITECTURE NOTES
 *  - Typically rendered on the main Dashboard page alongside FinancialVitals, RecentActivity, etc.
 *  - Framer Motion stagger (0.2 s per goal) and progress bar easing create a polished reveal.
 *  - Purely presentational once data is loaded; mutations are handled elsewhere.
 */
import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { GoalProgressSkeleton } from "@/components/ui/CardSkeleton";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { IFinancialProfile, IFinancialGoal } from "@/types";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { useToast } from "@/hooks/useToast";
import { createTask } from "@/lib/api/tasks";

export function GoalProgress() {
  const { formatMoney } = useOrgFormatters();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery<IFinancialProfile>({
    queryKey: ["/api/financial-profiles/me"],
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createTask>[0]) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task Created", description: "Catch-up task added to your Tasks workspace." });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to create action task.";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const goals = useMemo(() => (profile?.goals || []) as IFinancialGoal[], [profile?.goals]);

  const driftAnalysis = useMemo(() => {
    let totalRequiredMonthly = 0;
    let overdueCount = 0;
    const now = new Date();

    for (const g of goals) {
      const target = Number(g.target) || 0;
      const current = Number(g.current) || 0;
      const remaining = Math.max(0, target - current);
      if (remaining <= 0) continue;

      const diffTime = new Date(g.deadline).getTime() - now.getTime();
      const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.4375));

      if (diffMonths <= 0) {
        overdueCount++;
      } else {
        totalRequiredMonthly += Math.ceil(remaining / diffMonths);
      }
    }

    const rawIncome =
      Number((profile as any)?.monthlyIncome) ||
      (Number(profile?.annual_income) ? Number(profile?.annual_income) / 12 : 0);
    const monthlyIncome = Math.round(rawIncome);
    const monthlyExpenses =
      Number(profile?.monthly_expenses) || Number((profile as any)?.monthlyExpenses) || 0;
    const hasIncomeData = monthlyIncome > 0;
    const monthlySurplus = hasIncomeData ? Math.max(0, monthlyIncome - monthlyExpenses) : 0;

    const monthlyGap = hasIncomeData ? Math.max(0, totalRequiredMonthly - monthlySurplus) : 0;
    const hasDrift = overdueCount > 0 || (hasIncomeData && totalRequiredMonthly > 0 && monthlyGap > 0);

    return {
      hasDrift,
      overdueCount,
      totalRequiredMonthly,
      monthlySurplus,
      monthlyGap,
      hasIncomeData,
    };
  }, [goals, profile]);

  if (isLoading) {
    return <GoalProgressSkeleton />;
  }

  const handleCreateCatchupTask = () => {
    const { overdueCount, totalRequiredMonthly, monthlySurplus, monthlyGap } = driftAnalysis;

    createTaskMutation.mutate({
      title:
        overdueCount > 0
          ? `Adjust milestone timeline & catch up overdue goals`
          : `Close ${formatMoney(monthlyGap, { maximumFractionDigits: 0 })}/mo goal savings gap`,
      why:
        overdueCount > 0
          ? `${overdueCount} goal missed its target completion date. Realign target dates or increase savings.`
          : `Active goals need ${formatMoney(totalRequiredMonthly, { maximumFractionDigits: 0 })}/mo vs monthly surplus of ${formatMoney(monthlySurplus, { maximumFractionDigits: 0 })}/mo.`,
      steps: [
        "Review discretionary spending categories to trim unnecessary outflow",
        `Allocate extra ${formatMoney(monthlyGap > 0 ? monthlyGap : 100, { maximumFractionDigits: 0 })}/mo toward primary goal reserves`,
        "Automate recurring transfer on payday to enforce savings discipline",
        "Review funding progress at next monthly close",
      ],
      priority: "high",
      expected_impact: "Restores goal funding trajectory and prevents milestone slippage.",
      kind: "goal",
      bucket: 30,
      due_days: 7,
    });
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return "hsl(158 64% 52%)";
    if (progress >= 50) return "hsl(221 83% 53%)";
    return "hsl(46 95% 53%)";
  };

  const getGoalPacing = (goal: IFinancialGoal) => {
    const target = Number(goal.target) || 0;
    const current = Number(goal.current) || 0;
    const progress = target > 0 ? (current / target) * 100 : 0;
    const remaining = Math.max(0, target - current);

    const deadlineDate = new Date(goal.deadline);
    const now = new Date();
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.4375));

    let statusText = "";
    let badge: { label: string; variant: "default" | "secondary" | "destructive" | "outline" } = {
      label: "In Progress",
      variant: "secondary",
    };

    if (remaining <= 0) {
      statusText = "Target reached! 🎉";
      badge = { label: "Achieved", variant: "default" };
    } else if (diffMonths <= 0) {
      statusText = `Overdue • Need ${formatMoney(remaining, { maximumFractionDigits: 0 })}`;
      badge = { label: "Overdue", variant: "destructive" };
    } else {
      const monthlyNeeded = Math.ceil(remaining / diffMonths);
      statusText = `Need ${formatMoney(monthlyNeeded, { maximumFractionDigits: 0 })}/mo • ${diffMonths} ${diffMonths === 1 ? "mo" : "mos"} left`;
      badge = { label: "On Track", variant: "outline" };
    }

    return { progress, remaining, statusText, badge };
  };

  if (goals.length === 0) {
    return (
      <Card className="p-6" data-testid="goal-progress">
        <h3 className="text-lg font-semibold text-foreground mb-6">Goal Progress</h3>
        <div className="text-center py-6 text-muted-foreground flex flex-col items-center gap-3">
          <p>No goals set yet. Start by defining your financial targets!</p>
          <Link href="/goals-debts">
            <Button size="sm" variant="outline" className="cursor-pointer">
              Set your first goal
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6" data-testid="goal-progress">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Goal Progress</h3>
        <Link href="/goals-debts">
          <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground hover:text-foreground">
            Manage →
          </Button>
        </Link>
      </div>

      {driftAnalysis.hasDrift && (
        <div
          className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          data-testid="goal-drift-banner"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                Milestone Drift Detected
                {driftAnalysis.monthlyGap > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                    -{formatMoney(driftAnalysis.monthlyGap, { maximumFractionDigits: 0 })}/mo gap
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {driftAnalysis.overdueCount > 0
                  ? `${driftAnalysis.overdueCount} goal${driftAnalysis.overdueCount > 1 ? "s are" : " is"} overdue. Pacing requires ${formatMoney(driftAnalysis.totalRequiredMonthly, { maximumFractionDigits: 0 })}/mo.`
                  : `Active goals need ${formatMoney(driftAnalysis.totalRequiredMonthly, { maximumFractionDigits: 0 })}/mo vs ${formatMoney(driftAnalysis.monthlySurplus, { maximumFractionDigits: 0 })}/mo surplus.`}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs shrink-0 self-start sm:self-center"
            onClick={handleCreateCatchupTask}
            disabled={createTaskMutation.isPending}
          >
            {createTaskMutation.isPending ? "Scheduling..." : "+ Catch-up Plan"}
          </Button>
        </div>
      )}

      <div className="space-y-5">
        {goals.map((goal: IFinancialGoal, index: number) => {
          const { progress, statusText, badge } = getGoalPacing(goal);
          const progressColor = getProgressColor(progress);

          return (
            <motion.div
              key={goal.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15 }}
              data-testid={`goal-${goal.name.toLowerCase().replace(/\s/g, "-")}`}
              className="space-y-1.5"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{goal.name}</span>
                  <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0 h-4">
                    {badge.label}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground font-medium">
                  {formatMoney(goal.current, { maximumFractionDigits: 0 })} / {formatMoney(goal.target, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="relative">
                <div className="w-full bg-muted rounded-full h-2">
                  <motion.div
                    className="h-2 rounded-full transition-all duration-1000"
                    style={{ backgroundColor: progressColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    transition={{
                      delay: index * 0.2 + 0.5,
                      duration: 1.2,
                      ease: "easeOut",
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{Math.round(progress)}% complete</span>
                <span>{statusText}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

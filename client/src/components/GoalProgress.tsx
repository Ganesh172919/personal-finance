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
import { Card } from "@/components/ui/Card";
import { useQuery } from "@tanstack/react-query";
import { IFinancialProfile, IFinancialGoal } from "@/types";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";

export function GoalProgress() {
  const { formatMoney } = useOrgFormatters();
  const { data: profile } = useQuery<IFinancialProfile>({
    queryKey: ["/api/financial-profiles/me"],
  });

  const goals = profile?.goals || [];

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return "hsl(158 64% 52%)";
    if (progress >= 50) return "hsl(221 83% 53%)";
    return "hsl(46 95% 53%)";
  };

  const getTimeToDeadline = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));

    if (diffMonths <= 0) return "Overdue";
    if (diffMonths === 1) return "1 month remaining";
    return `${diffMonths} months remaining`;
  };

  if (goals.length === 0) {
    return (
      <Card className="p-6" data-testid="goal-progress">
        <h3 className="text-lg font-semibold text-foreground mb-6">Goal Progress</h3>
        <div className="text-center py-8 text-muted-foreground">
          No goals set yet. Start by adding your financial goals!
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6" data-testid="goal-progress">
      <h3 className="text-lg font-semibold mb-6 text-foreground">Goal Progress</h3>

      <div className="space-y-6">
        {goals.map((goal: IFinancialGoal, index: number) => {
          const progress = (goal.current / goal.target) * 100;
          const progressColor = getProgressColor(progress);

          return (
            <motion.div
              key={goal.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.2 }}
              data-testid={`goal-${goal.name.toLowerCase().replace(/\s/g, "-")}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-foreground">{goal.name}</span>
                <span className="text-sm text-muted-foreground">
                  {formatMoney(goal.current, { maximumFractionDigits: 0 })} / {formatMoney(goal.target, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="relative">
                <div className="w-full bg-muted rounded-full h-2">
                  <motion.div
                    className="h-2 rounded-full transition-all duration-1000"
                    style={{ backgroundColor: progressColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{
                      delay: index * 0.3 + 1,
                      duration: 1.5,
                      ease: "easeOut",
                    }}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {Math.round(progress)}% complete •{" "}
                {getTimeToDeadline(goal.deadline)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

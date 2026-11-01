/**
 * @fileoverview CRUD management page for financial goals and debts.
 *
 * Displays two tabbed sections -- Goals and Debts -- each with inline
 * create/edit forms and a list of existing records sourced from the
 * user's financial profile.
 *
 * Key data flows:
 * - GET /api/financial-profiles/me loads goals and debts arrays.
 * - createGoal / updateGoal / createDebt / updateDebt / deleteGoal /
 *   deleteDebt mutate individual records, then invalidate the profile
 *   query to refetch.
 *
 * Form state is local; editing is toggled by selecting a record id.
 * Money values are formatted via useOrgFormatters for tenant-aware
 * currency display.
 *
 * Part of the onboarding flow (step 2-3) and also accessible standalone
 * from the sidebar under "Goals & Debts".
 */

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Gift, Scale, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useToast } from "@/hooks/useToast";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import {
  ApiError,
  createDebt,
  createGoal,
  createTask,
  deleteDebt,
  deleteGoal,
  DebtPayload,
  GoalPayload,
  updateDebt,
  updateGoal,
} from "@/lib/apiClient";
import type { IDebt, IFinancialGoal, IFinancialProfile } from "@/types";

type GoalForm = {
  name: string;
  target: string;
  current: string;
  deadline: string;
  priority: string;
};

type DebtForm = {
  name: string;
  balance: string;
  interest_rate: string;
  minimum_payment: string;
  type: string;
};

const EMPTY_GOAL: GoalForm = {
  name: "",
  target: "",
  current: "0",
  deadline: "",
  priority: "1",
};

const EMPTY_DEBT: DebtForm = {
  name: "",
  balance: "",
  interest_rate: "",
  minimum_payment: "",
  type: "Loan",
};

interface DebtSim {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minPayment: number;
}

function simulatePayoff(activeDebts: DebtSim[], extraMonthly: number, strategy: "avalanche" | "snowball" | "minimum") {
  if (activeDebts.length === 0) {
    return { months: 0, totalInterest: 0, negativeAmortization: false };
  }

  const debts = activeDebts.map(d => ({
    ...d,
    currentBalance: d.balance,
  }));

  let totalInterest = 0;
  let months = 0;
  const maxMonths = 360;
  let negativeAmortization = false;

  while (months < maxMonths) {
    const remainingDebts = debts.filter(d => d.currentBalance > 0.01);
    if (remainingDebts.length === 0) break;
    months++;

    for (const d of remainingDebts) {
      const monthlyRate = (d.apr / 100) / 12;
      const interest = d.currentBalance * monthlyRate;
      totalInterest += interest;
      d.currentBalance += interest;

      if (strategy === "minimum" && d.minPayment <= interest) {
        negativeAmortization = true;
      }
    }

    let extraCash = extraMonthly;
    for (const d of remainingDebts) {
      const payment = Math.min(d.currentBalance, d.minPayment);
      d.currentBalance -= payment;
    }

    if (strategy !== "minimum" && extraCash > 0) {
      const sorted = [...debts.filter(d => d.currentBalance > 0.01)].sort((a, b) => {
        if (strategy === "avalanche") {
          return b.apr - a.apr;
        }
        return a.currentBalance - b.currentBalance;
      });

      for (const d of sorted) {
        if (extraCash <= 0) break;
        const extraPaid = Math.min(d.currentBalance, extraCash);
        d.currentBalance -= extraPaid;
        extraCash -= extraPaid;
      }
    }
  }

  return {
    months: months >= maxMonths ? maxMonths : months,
    totalInterest: Math.round(totalInterest),
    negativeAmortization,
  };
}

export default function GoalsAndDebts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatMoney } = useOrgFormatters();

  const { data: profile, isLoading, isError, refetch } = useQuery<IFinancialProfile>({
    queryKey: ["/api/financial-profiles/me"],
  });

  const goals = useMemo(() => (profile?.goals || []) as IFinancialGoal[], [profile?.goals]);
  const debts = useMemo(() => (profile?.debts || []) as IDebt[], [profile?.debts]);

  const [goalForm, setGoalForm] = useState<GoalForm>(EMPTY_GOAL);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const [debtForm, setDebtForm] = useState<DebtForm>(EMPTY_DEBT);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [extraPayment, setExtraPayment] = useState<number>(100);

  const [rebalanceSurplus, setRebalanceSurplus] = useState<number>(500);
  const [rebalanceStrategy, setRebalanceStrategy] = useState<"priority" | "urgency" | "balanced">("priority");
  const [isWindfallOpen, setIsWindfallOpen] = useState<boolean>(false);
  const [windfallAmount, setWindfallAmount] = useState<number>(1000);
  const [isApplyingWindfall, setIsApplyingWindfall] = useState<boolean>(false);

  const invalidateProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
  };

  const goalMutation = useMutation({
    mutationFn: async (payload: { id?: string; body: GoalPayload }) => {
      if (payload.id) return updateGoal(payload.id, payload.body);
      return createGoal(payload.body);
    },
    onSuccess: async () => {
      await invalidateProfile();
      setGoalForm(EMPTY_GOAL);
      setEditingGoalId(null);
      toast({ title: "Saved", description: "Goal updated successfully." });
    },
    onError: (error: unknown) => {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "Failed to save goal.";
      toast({
        title: "Error",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: async () => {
      await invalidateProfile();
      toast({ title: "Deleted", description: "Goal removed." });
    },
  });

  const debtMutation = useMutation({
    mutationFn: async (payload: { id?: string; body: DebtPayload }) => {
      if (payload.id) return updateDebt(payload.id, payload.body);
      return createDebt(payload.body);
    },
    onSuccess: async () => {
      await invalidateProfile();
      setDebtForm(EMPTY_DEBT);
      setEditingDebtId(null);
      toast({ title: "Saved", description: "Debt updated successfully." });
    },
    onError: (error: unknown) => {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "Failed to save debt.";
      toast({
        title: "Error",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    },
  });

  const deleteDebtMutation = useMutation({
    mutationFn: deleteDebt,
    onSuccess: async () => {
      await invalidateProfile();
      toast({ title: "Deleted", description: "Debt removed." });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createTask>[0]) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task Created", description: "Action task added to your Tasks workspace." });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to create action task.";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const handleCreateGoalTask = (goal: IFinancialGoal, analysis: ReturnType<typeof getGoalProgress>) => {
    createTaskMutation.mutate({
      title: `Save for ${goal.name}`,
      why: `Target: ${formatCurrency(goal.target)} by ${String(goal.deadline).slice(0, 10)}. Pacing: ${analysis.paceNote}.`,
      steps: [
        "Review available monthly cash flow",
        `Set up recurring deposit or transfer toward ${goal.name}`,
        "Track milestone progress in FinWise",
      ],
      priority: goal.priority >= 8 ? "high" : goal.priority >= 4 ? "medium" : "low",
      expected_impact: `Ensures ${goal.name} reaches target deadline on schedule.`,
      kind: "goal",
      bucket: 30,
      due_days: 14,
    });
  };

  const handleCreateDebtTask = (debt: IDebt) => {
    createTaskMutation.mutate({
      title: `Accelerate payoff for ${debt.name}`,
      why: `Liability of ${formatCurrency(debt.balance)} carries ${debt.interest_rate}% APR. Prioritizing extra payments saves maximum interest.`,
      steps: [
        `Allocate extra monthly surplus toward ${debt.name}`,
        "Ensure minimum payments are scheduled on all other accounts",
        "Lower principal balance rapidly to reduce interest charges",
      ],
      priority: "high",
      expected_impact: "Minimizes interest charges and shortens total payoff time.",
      kind: "debt",
      bucket: 7,
      due_days: 7,
    });
  };

  const handleCreateSnowballTask = (debt: IDebt) => {
    createTaskMutation.mutate({
      title: `Snowball payoff: Clear ${debt.name}`,
      why: `Lowest liability balance of ${formatCurrency(debt.balance)}. Paying this off first builds immediate debt-freedom momentum.`,
      steps: [
        `Direct surplus cash towards clearing the remaining ${formatCurrency(debt.balance)} on ${debt.name}`,
        "Pay minimum payments on all other debts",
        `Celebrate payoff and roll its ${formatCurrency(debt.minimum_payment)}/mo payment into the next smallest debt`,
      ],
      priority: "medium",
      expected_impact: "Clears an entire debt account quickly to free up monthly cash flow.",
      kind: "debt",
      bucket: 7,
      due_days: 7,
    });
  };

  const handleCreateAcceleratedPlanTask = (
    strategy: "avalanche" | "snowball",
    debt: IDebt,
    extraAmount: number,
    monthsSaved: number,
    interestSaved: number
  ) => {
    const strategyName = strategy === "avalanche" ? "Avalanche" : "Snowball";
    createTaskMutation.mutate({
      title: `${strategyName} Plan: Pay extra ${formatCurrency(extraAmount)}/mo on ${debt.name}`,
      why: `Applying an extra ${formatCurrency(extraAmount)}/mo reduces total payoff duration by ~${monthsSaved} months and saves ~${formatCurrency(interestSaved)} in interest.`,
      steps: [
        `Set up recurring auto-pay of ${formatCurrency(Number(debt.minimum_payment || 0) + extraAmount)}/mo on ${debt.name}`,
        "Maintain required minimum payments on all remaining debts",
        "Re-evaluate payoff schedule in 30 days in FinWise",
      ],
      priority: "high",
      expected_impact: `Saves ${formatCurrency(interestSaved)} in interest and eliminates debt ${monthsSaved} months sooner.`,
      kind: "debt",
      bucket: 30,
      due_days: 14,
    });
  };

  const submitGoal = async (event: FormEvent) => {
    event.preventDefault();

    const target = Number(goalForm.target);
    const current = Number(goalForm.current || 0);
    const priority = Number(goalForm.priority || 1);

    if (!goalForm.name.trim()) {
      toast({ title: "Validation Error", description: "Goal name is required.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      toast({ title: "Validation Error", description: "Target amount must be greater than zero.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(current) || current < 0) {
      toast({ title: "Validation Error", description: "Current savings cannot be negative.", variant: "destructive" });
      return;
    }
    if (!goalForm.deadline) {
      toast({ title: "Validation Error", description: "Please select a target deadline date.", variant: "destructive" });
      return;
    }

    await goalMutation.mutateAsync({
      id: editingGoalId || undefined,
      body: {
        name: goalForm.name.trim(),
        target,
        current: Number.isFinite(current) ? current : 0,
        deadline: goalForm.deadline,
        priority: Number.isFinite(priority) ? priority : 1,
      },
    });
  };

  const submitDebt = async (event: FormEvent) => {
    event.preventDefault();

    const balance = Number(debtForm.balance);
    const interestRate = Number(debtForm.interest_rate);
    const minimumPayment = Number(debtForm.minimum_payment);

    if (!debtForm.name.trim()) {
      toast({ title: "Validation Error", description: "Debt name is required.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(balance) || balance < 0) {
      toast({ title: "Validation Error", description: "Balance must be a non-negative number.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100) {
      toast({ title: "Validation Error", description: "Interest rate must be between 0% and 100%.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(minimumPayment) || minimumPayment < 0) {
      toast({ title: "Validation Error", description: "Minimum payment cannot be negative.", variant: "destructive" });
      return;
    }

    await debtMutation.mutateAsync({
      id: editingDebtId || undefined,
      body: {
        name: debtForm.name.trim(),
        balance: Number.isFinite(balance) ? balance : 0,
        interest_rate: Number.isFinite(interestRate) ? interestRate : 0,
        minimum_payment: Number.isFinite(minimumPayment) ? minimumPayment : 0,
        type: debtForm.type.trim() || "Loan",
      },
    });
  };

  const startEditGoal = (goal: any) => {
    setEditingGoalId(String(goal.id || goal._id));
    setGoalForm({
      name: String(goal.name || ""),
      target: String(goal.target ?? ""),
      current: String(goal.current ?? "0"),
      deadline: String(goal.deadline || "").slice(0, 10),
      priority: String(goal.priority ?? "1"),
    });
  };

  const startEditDebt = (debt: any) => {
    setEditingDebtId(String(debt.id || debt._id));
    setDebtForm({
      name: String(debt.name || ""),
      balance: String(debt.balance ?? ""),
      interest_rate: String(debt.interest_rate ?? ""),
      minimum_payment: String(debt.minimum_payment ?? ""),
      type: String(debt.type || "Loan"),
    });
  };

  const formatCurrency = (value: number) => formatMoney(value);

  const goalsSummary = useMemo(() => {
    const totalTarget = goals.reduce((sum, g) => sum + (Number(g.target) || 0), 0);
    const totalCurrent = goals.reduce((sum, g) => sum + (Number(g.current) || 0), 0);
    const overallProgress = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;
    return { totalTarget, totalCurrent, overallProgress };
  }, [goals]);

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

  const handleCreateCatchupTask = () => {
    const { overdueCount, totalRequiredMonthly, monthlySurplus, monthlyGap } = driftAnalysis;

    createTaskMutation.mutate({
      title:
        overdueCount > 0
          ? `Adjust milestone timeline & catch up overdue goals`
          : `Close ${formatCurrency(monthlyGap)}/mo goal funding gap`,
      why:
        overdueCount > 0
          ? `${overdueCount} goal missed its target completion date. Realign target dates or allocate funds.`
          : `Active goals require ${formatCurrency(totalRequiredMonthly)}/mo vs estimated monthly surplus of ${formatCurrency(monthlySurplus)}/mo.`,
      steps: [
        "Audit discretionary spending categories to trim unnecessary outflow",
        `Allocate extra ${formatCurrency(monthlyGap > 0 ? monthlyGap : 100)}/mo toward primary goal reserves`,
        "Automate recurring transfer on payday to lock in required savings",
        "Reassess pacing milestone at next monthly close",
      ],
      priority: "high",
      expected_impact: "Restores goal funding trajectory and prevents milestone slippage.",
      kind: "goal",
      bucket: 30,
      due_days: 7,
    });
  };

  const multiGoalRebalance = useMemo(() => {
    const activeGoals = goals.filter(g => {
      const target = Number(g.target) || 0;
      const current = Number(g.current) || 0;
      return target > 0 && target - current > 0.01;
    });

    if (activeGoals.length < 2) return null;

    const now = new Date().getTime();

    // Compute raw weights
    const goalWeights = activeGoals.map(g => {
      const target = Number(g.target) || 0;
      const current = Number(g.current) || 0;
      const remaining = Math.max(0, target - current);
      const diffTime = new Date(g.deadline).getTime() - now;
      const diffMonths = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.4375)));

      let weight = 1;
      if (rebalanceStrategy === "priority") {
        weight = Math.max(1, Number(g.priority) || 1);
      } else if (rebalanceStrategy === "urgency") {
        weight = Math.max(0.1, 12 / diffMonths);
      } else {
        weight = 1;
      }

      return {
        goal: g,
        target,
        current,
        remaining,
        diffMonths,
        weight,
      };
    });

    const totalWeight = goalWeights.reduce((sum, item) => sum + item.weight, 0);

    const safeSurplus = Math.max(0, Number(rebalanceSurplus) || 0);
    const safeWindfall = Math.max(0, Number(windfallAmount) || 0);

    let allocatedMonthlySum = 0;
    let allocatedWindfallSum = 0;

    const items = goalWeights.map(item => {
      const ratio = totalWeight > 0 ? item.weight / totalWeight : 1 / goalWeights.length;

      const unconstrainedMonthly = Math.round(safeSurplus * ratio);
      const monthlyAllocation = Math.min(item.remaining, unconstrainedMonthly);
      allocatedMonthlySum += monthlyAllocation;

      const unconstrainedWindfall = Math.round(safeWindfall * ratio);
      const windfallAllocation = Math.min(item.remaining, unconstrainedWindfall);
      allocatedWindfallSum += windfallAllocation;

      const monthsToTarget = monthlyAllocation > 0 ? Math.ceil(item.remaining / monthlyAllocation) : item.diffMonths;
      const requiredMonthly = Math.ceil(item.remaining / item.diffMonths);
      const monthsSaved = monthlyAllocation > requiredMonthly ? Math.max(0, item.diffMonths - monthsToTarget) : 0;

      return {
        ...item,
        ratio,
        monthlyAllocation,
        windfallAllocation,
        monthsToTarget,
        monthsSaved,
      };
    });

    return {
      items,
      totalWeight,
      allocatedMonthlySum,
      allocatedWindfallSum,
    };
  }, [goals, rebalanceSurplus, rebalanceStrategy, windfallAmount]);

  const handleScheduleMultiGoalPlanTask = () => {
    if (!multiGoalRebalance || multiGoalRebalance.items.length === 0) return;

    const { items, allocatedMonthlySum } = multiGoalRebalance;
    const strategyLabel =
      rebalanceStrategy === "priority"
        ? "Priority-Weighted"
        : rebalanceStrategy === "urgency"
        ? "Urgency-Paced"
        : "Balanced Velocity";

    const steps = items.map(
      item =>
        `Direct ${formatCurrency(item.monthlyAllocation)}/mo to ${item.goal.name} (remaining: ${formatCurrency(item.remaining)})`
    );
    steps.push("Review multi-goal pacing at the end of each billing cycle in FinWise");

    createTaskMutation.mutate({
      title: `Multi-Goal Plan (${strategyLabel}): Allocate ${formatCurrency(allocatedMonthlySum)}/mo across ${items.length} goals`,
      why: `Optimizes savings velocity using ${strategyLabel} distribution for ${items.length} active goals totaling ${formatCurrency(allocatedMonthlySum)}/month.`,
      steps,
      priority: "high",
      expected_impact: `Fund all ${items.length} goals simultaneously without missing milestone deadlines.`,
      kind: "goal",
      bucket: 30,
      due_days: 7,
    });
  };

  const handleApplyWindfall = async () => {
    if (!multiGoalRebalance || multiGoalRebalance.items.length === 0) return;
    setIsApplyingWindfall(true);

    try {
      const updates = multiGoalRebalance.items
        .filter(item => item.windfallAllocation > 0)
        .map(item => {
          const id = (item.goal as any).id || (item.goal as any)._id;
          const newCurrent = Math.round(((Number(item.goal.current) || 0) + item.windfallAllocation) * 100) / 100;
          return goalMutation.mutateAsync({
            id: String(id),
            body: {
              name: item.goal.name,
              target: Number(item.goal.target),
              current: newCurrent,
              deadline: String(item.goal.deadline).slice(0, 10),
              priority: Number(item.goal.priority || 1),
            },
          });
        });

      await Promise.all(updates);
      setIsWindfallOpen(false);
      toast({
        title: "Windfall Distributed",
        description: `Successfully applied ${formatCurrency(multiGoalRebalance.allocatedWindfallSum)} across ${updates.length} savings goals.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to apply windfall.";
      toast({ title: "Distribution Error", description: msg, variant: "destructive" });
    } finally {
      setIsApplyingWindfall(false);
    }
  };

  const debtsSummary = useMemo(() => {
    const totalBalance = debts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);
    const totalMinPayment = debts.reduce((sum, d) => sum + (Number(d.minimum_payment) || 0), 0);
    const weightedApr =
      totalBalance > 0
        ? debts.reduce((sum, d) => sum + (Number(d.balance) || 0) * (Number(d.interest_rate) || 0), 0) / totalBalance
        : 0;
    const activeDebts = debts.filter(d => (Number(d.balance) || 0) > 0);
    const highestAprDebt = [...activeDebts].sort((a, b) => (Number(b.interest_rate) || 0) - (Number(a.interest_rate) || 0))[0];
    const lowestBalanceDebt = [...activeDebts].sort((a, b) => (Number(a.balance) || 0) - (Number(b.balance) || 0))[0];

    return { totalBalance, totalMinPayment, weightedApr, highestAprDebt, lowestBalanceDebt };
  }, [debts]);

  const activeDebtsSim = useMemo(() => {
    return debts
      .filter(d => (Number(d.balance) || 0) > 0)
      .map((d, idx) => ({
        id: String((d as any).id || (d as any)._id || idx),
        name: d.name,
        balance: Number(d.balance) || 0,
        apr: Number(d.interest_rate) || 0,
        minPayment: Number(d.minimum_payment) || 0,
      }));
  }, [debts]);

  const simulation = useMemo(() => {
    if (activeDebtsSim.length === 0) return null;
    const baseline = simulatePayoff(activeDebtsSim, 0, "minimum");
    const avalanche = simulatePayoff(activeDebtsSim, extraPayment, "avalanche");
    const snowball = simulatePayoff(activeDebtsSim, extraPayment, "snowball");

    return {
      baseline,
      avalanche: {
        ...avalanche,
        monthsSaved: Math.max(0, baseline.months - avalanche.months),
        interestSaved: Math.max(0, baseline.totalInterest - avalanche.totalInterest),
      },
      snowball: {
        ...snowball,
        monthsSaved: Math.max(0, baseline.months - snowball.months),
        interestSaved: Math.max(0, baseline.totalInterest - snowball.totalInterest),
      },
    };
  }, [activeDebtsSim, extraPayment]);

  const getGoalProgress = (goal: IFinancialGoal) => {
    const target = Number(goal.target) || 0;
    const current = Number(goal.current) || 0;
    const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const remaining = Math.max(0, target - current);

    const deadlineDate = new Date(goal.deadline);
    const now = new Date();
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.4375));

    let paceNote = "";
    let status: "achieved" | "overdue" | "on_track" = "on_track";
    let statusBadge: { label: string; variant: "default" | "secondary" | "destructive" | "outline" } = {
      label: "In Progress",
      variant: "secondary",
    };

    if (remaining <= 0) {
      status = "achieved";
      statusBadge = { label: "Achieved", variant: "default" };
      paceNote = "Goal target achieved! 🎉";
    } else if (diffMonths <= 0) {
      status = "overdue";
      statusBadge = { label: "Overdue", variant: "destructive" };
      paceNote = `Overdue — need ${formatCurrency(remaining)} to complete`;
    } else {
      status = "on_track";
      const monthlyNeeded = Math.ceil(remaining / diffMonths);
      statusBadge = { label: "On Track", variant: "outline" };
      paceNote = `Need ${formatCurrency(monthlyNeeded)}/mo for ${diffMonths} ${diffMonths === 1 ? "month" : "months"}`;
    }

    const priorityBadge =
      goal.priority >= 8
        ? { label: `Priority ${goal.priority} (High)`, className: "text-red-500 border-red-200 dark:border-red-800" }
        : goal.priority >= 4
        ? { label: `Priority ${goal.priority} (Medium)`, className: "text-amber-500 border-amber-200 dark:border-amber-800" }
        : { label: `Priority ${goal.priority} (Low)`, className: "text-blue-500 border-blue-200 dark:border-blue-800" };

    const progressBarColor =
      progress >= 100
        ? "bg-emerald-500"
        : progress >= 80
        ? "bg-emerald-500"
        : progress >= 50
        ? "bg-blue-500"
        : "bg-amber-500";

    return { progress, remaining, paceNote, status, statusBadge, priorityBadge, progressBarColor };
  };

  const getDebtAnalysis = (debt: IDebt) => {
    const balance = Number(debt.balance) || 0;
    const apr = Number(debt.interest_rate) || 0;
    const minPayment = Number(debt.minimum_payment) || 0;

    if (balance <= 0) {
      return { status: "paid", label: "Paid off! 🎉", isWarning: false };
    }
    if (minPayment <= 0) {
      return { status: "warning", label: "No minimum payment specified", isWarning: true };
    }

    const monthlyRate = apr / 100 / 12;
    const monthlyInterest = balance * monthlyRate;

    if (minPayment <= monthlyInterest) {
      return {
        status: "negative_amortization",
        label: `⚠️ Min payment doesn't cover monthly interest (${formatCurrency(monthlyInterest)}/mo). Balance will grow.`,
        isWarning: true,
      };
    }

    if (monthlyRate === 0) {
      const months = Math.ceil(balance / minPayment);
      return {
        status: "ok",
        label: `~${months} months to payoff at minimum payment`,
        isWarning: false,
      };
    }

    const n = -Math.log(1 - (balance * monthlyRate) / minPayment) / Math.log(1 + monthlyRate);
    const months = Math.ceil(n);
    const totalPaid = months * minPayment;
    const totalInterest = Math.max(0, totalPaid - balance);

    return {
      status: "ok",
      label: `~${months} months to payoff (${formatCurrency(totalInterest)} total interest)`,
      isWarning: false,
    };
  };

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="goals-debts-page">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Goals & Debts</h1>
          <p className="text-muted-foreground">
            Keep your targets and liabilities updated so FinWise can generate better plans.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : isError && !profile ? (
          <div role="alert" className="space-y-3 rounded-lg border border-border p-4">
            <p>Goals and debts could not be loaded. Try again before making changes.</p>
            <Button onClick={() => void refetch()}>Try again</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Goals</h2>

              <form className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6" onSubmit={submitGoal}>
                <div className="md:col-span-2">
                  <Label htmlFor="goal-name">Name</Label>
                  <Input
                    id="goal-name"
                    value={goalForm.name}
                    onChange={e => setGoalForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Emergency fund"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="goal-target">Target</Label>
                  <Input
                    id="goal-target"
                    type="number"
                    step="0.01"
                    min="0"
                    value={goalForm.target}
                    onChange={e => setGoalForm(prev => ({ ...prev, target: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="goal-current">Current</Label>
                  <Input
                    id="goal-current"
                    type="number"
                    step="0.01"
                    min="0"
                    value={goalForm.current}
                    onChange={e => setGoalForm(prev => ({ ...prev, current: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="goal-deadline">Deadline</Label>
                  <Input
                    id="goal-deadline"
                    type="date"
                    value={goalForm.deadline}
                    onChange={e => setGoalForm(prev => ({ ...prev, deadline: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="goal-priority">Priority (1-10)</Label>
                  <Input
                    id="goal-priority"
                    type="number"
                    min="1"
                    max="10"
                    value={goalForm.priority}
                    onChange={e => setGoalForm(prev => ({ ...prev, priority: e.target.value }))}
                    required
                  />
                </div>

                <div className="md:col-span-2 flex gap-3">
                  <Button type="submit" disabled={goalMutation.isPending}>
                    {editingGoalId ? "Save Goal" : "Add Goal"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingGoalId(null);
                      setGoalForm(EMPTY_GOAL);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>

              {goals.length === 0 ? (
                <div className="text-muted-foreground text-sm">No goals yet.</div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Funded: </span>
                      <span className="font-semibold text-foreground">{formatCurrency(goalsSummary.totalCurrent)}</span>
                      <span className="text-muted-foreground"> of {formatCurrency(goalsSummary.totalTarget)}</span>
                    </div>
                    <Badge variant="outline" className="font-medium">
                      {goalsSummary.overallProgress}% Overall
                    </Badge>
                  </div>

                  {driftAnalysis.hasDrift && (
                    <div
                      className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                      data-testid="goal-drift-alert"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            Milestone Pacing Drift Detected
                            {driftAnalysis.monthlyGap > 0 && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                                -{formatCurrency(driftAnalysis.monthlyGap)}/mo gap
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-[11px]">
                            {driftAnalysis.overdueCount > 0
                              ? `${driftAnalysis.overdueCount} goal${driftAnalysis.overdueCount > 1 ? "s are" : " is"} overdue. Pacing requires ${formatCurrency(driftAnalysis.totalRequiredMonthly)}/mo.`
                              : `Active goals need ${formatCurrency(driftAnalysis.totalRequiredMonthly)}/mo, exceeding estimated surplus (${formatCurrency(driftAnalysis.monthlySurplus)}/mo).`}
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
                        {createTaskMutation.isPending ? "Scheduling..." : "⚡ Auto-Schedule Task"}
                      </Button>
                    </div>
                  )}

                  {multiGoalRebalance && (
                    <div
                      className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3"
                      data-testid="multi-goal-rebalancing-section"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Scale className="h-4 w-4 text-primary" />
                          <span className="font-semibold text-foreground text-sm">
                            Multi-Goal Portfolio Rebalancing
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {multiGoalRebalance.items.length} active goals
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-primary/30 hover:bg-primary/10 text-primary flex items-center gap-1.5"
                          onClick={() => setIsWindfallOpen(true)}
                          data-testid="windfall-redistribute-trigger-btn"
                        >
                          <Gift className="h-3.5 w-3.5" />
                          Distribute Windfall
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <Label htmlFor="rebalance-surplus-input" className="text-xs text-muted-foreground">
                            Monthly Surplus Allocation
                          </Label>
                          <Input
                            id="rebalance-surplus-input"
                            data-testid="rebalance-surplus-input"
                            type="number"
                            min="0"
                            step="10"
                            value={rebalanceSurplus}
                            onChange={e => setRebalanceSurplus(Math.max(0, Number(e.target.value) || 0))}
                            className="h-8 text-xs mt-1"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground">Allocation Strategy</Label>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={rebalanceStrategy === "priority" ? "default" : "outline"}
                              className="h-8 px-2.5 text-xs flex-1"
                              onClick={() => setRebalanceStrategy("priority")}
                              data-testid="strategy-priority-btn"
                            >
                              Priority
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={rebalanceStrategy === "urgency" ? "default" : "outline"}
                              className="h-8 px-2.5 text-xs flex-1"
                              onClick={() => setRebalanceStrategy("urgency")}
                              data-testid="strategy-urgency-btn"
                            >
                              Urgency
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={rebalanceStrategy === "balanced" ? "default" : "outline"}
                              className="h-8 px-2.5 text-xs flex-1"
                              onClick={() => setRebalanceStrategy("balanced")}
                              data-testid="strategy-balanced-btn"
                            >
                              Balanced
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        {multiGoalRebalance.items.map(item => {
                          const id = (item.goal as any).id || (item.goal as any)._id;
                          const pct = Math.round(item.ratio * 100);
                          return (
                            <div
                              key={id}
                              className="p-2.5 rounded bg-background/80 border border-border/60 flex items-center justify-between text-xs gap-2"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-foreground truncate">{item.goal.name}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  Remaining: {formatCurrency(item.remaining)} • {item.diffMonths} mos to target
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-semibold text-primary">
                                  +{formatCurrency(item.monthlyAllocation)}/mo
                                  <span className="text-[10px] text-muted-foreground font-normal ml-1">({pct}%)</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {item.monthsSaved > 0 ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                      {item.monthsSaved} mos sooner
                                    </span>
                                  ) : (
                                    <span>~{item.monthsToTarget} mos payoff</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full h-7 text-xs flex items-center justify-center gap-1.5"
                        onClick={handleScheduleMultiGoalPlanTask}
                        disabled={createTaskMutation.isPending}
                        data-testid="schedule-multi-goal-plan-btn"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        {createTaskMutation.isPending ? "Scheduling..." : "+ Schedule Multi-Goal Savings Plan"}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-3">
                    {goals.map((goal, idx) => {
                      const id = (goal as any).id || (goal as any)._id || String(idx);
                      const analysis = getGoalProgress(goal);
                      const progress = analysis.progress;
                      return (
                        <div key={id} className="p-3.5 rounded-lg bg-accent/50 border border-border/50 flex flex-col gap-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{goal.name}</span>
                                <Badge variant={analysis.statusBadge.variant} className="text-[10px] px-1.5 py-0">
                                  {analysis.statusBadge.label}
                                </Badge>
                                <span className={`text-[10px] border px-1.5 py-0.2 rounded-full font-medium ${analysis.priorityBadge.className}`}>
                                  {analysis.priorityBadge.label}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(goal.current || 0)} / {formatCurrency(goal.target)} ({progress}%)
                              </div>
                              <div className="text-xs text-muted-foreground">Deadline: {String(goal.deadline).slice(0, 10)}</div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => startEditGoal(goal as any)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (!window.confirm("Delete this goal?")) return;
                                  deleteGoalMutation.mutate(String((goal as any).id || (goal as any)._id));
                                }}
                                disabled={deleteGoalMutation.isPending}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${analysis.progressBarColor}`}
                                style={{ width: `${Math.min(100, progress)}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {analysis.paceNote}
                              </span>
                              {analysis.status !== "achieved" && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10"
                                  onClick={() => handleCreateGoalTask(goal, analysis)}
                                  disabled={createTaskMutation.isPending}
                                >
                                  + Create Task
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Debts</h2>

              <form className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6" onSubmit={submitDebt}>
                <div className="md:col-span-2">
                  <Label htmlFor="debt-name">Name</Label>
                  <Input
                    id="debt-name"
                    value={debtForm.name}
                    onChange={e => setDebtForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Credit card"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="debt-balance">Balance</Label>
                  <Input
                    id="debt-balance"
                    type="number"
                    step="0.01"
                    min="0"
                    value={debtForm.balance}
                    onChange={e => setDebtForm(prev => ({ ...prev, balance: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="debt-interest">Interest Rate (%)</Label>
                  <Input
                    id="debt-interest"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={debtForm.interest_rate}
                    onChange={e => setDebtForm(prev => ({ ...prev, interest_rate: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="debt-min">Minimum Payment</Label>
                  <Input
                    id="debt-min"
                    type="number"
                    step="0.01"
                    min="0"
                    value={debtForm.minimum_payment}
                    onChange={e => setDebtForm(prev => ({ ...prev, minimum_payment: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="debt-type">Type</Label>
                  <Input
                    id="debt-type"
                    value={debtForm.type}
                    onChange={e => setDebtForm(prev => ({ ...prev, type: e.target.value }))}
                    placeholder="Loan, Credit Card..."
                    required
                  />
                </div>

                <div className="md:col-span-2 flex gap-3">
                  <Button type="submit" disabled={debtMutation.isPending}>
                    {editingDebtId ? "Save Debt" : "Add Debt"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingDebtId(null);
                      setDebtForm(EMPTY_DEBT);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>

              {debts.length === 0 ? (
                <div className="text-muted-foreground text-sm">No debts recorded.</div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-muted-foreground">Total Liabilities: </span>
                        <span className="font-semibold text-destructive">{formatCurrency(debtsSummary.totalBalance)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Min Monthly: </span>
                        <span className="font-semibold text-foreground">{formatCurrency(debtsSummary.totalMinPayment)}/mo</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Avg APR: </span>
                        <span className="font-semibold text-foreground">{debtsSummary.weightedApr.toFixed(1)}%</span>
                      </div>
                    </div>

                    {debtsSummary.highestAprDebt && debtsSummary.totalBalance > 0 && (
                      <div className="pt-1.5 border-t border-destructive/10 text-[11px] text-muted-foreground leading-relaxed flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-foreground">💡 Avalanche Strategy:</span> Prioritize extra payments on{" "}
                          <span className="font-medium text-foreground">{debtsSummary.highestAprDebt.name}</span> ({debtsSummary.highestAprDebt.interest_rate}% APR) to minimize total interest paid.
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] border-destructive/30 hover:bg-destructive/10 text-destructive"
                          onClick={() => handleCreateDebtTask(debtsSummary.highestAprDebt)}
                          disabled={createTaskMutation.isPending}
                        >
                          + Create Payoff Task
                        </Button>
                      </div>
                    )}

                    {debtsSummary.lowestBalanceDebt && debtsSummary.totalBalance > 0 && debts.length > 1 && (
                      <div className="pt-1.5 border-t border-destructive/10 text-[11px] text-muted-foreground leading-relaxed flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-foreground">🎯 Snowball Strategy:</span> Clear{" "}
                          <span className="font-medium text-foreground">{debtsSummary.lowestBalanceDebt.name}</span> ({formatCurrency(debtsSummary.lowestBalanceDebt.balance)}) first to build quick psychological momentum.
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] border-blue-500/30 hover:bg-blue-500/10 text-blue-500"
                          onClick={() => handleCreateSnowballTask(debtsSummary.lowestBalanceDebt)}
                          disabled={createTaskMutation.isPending}
                        >
                          + Create Snowball Task
                        </Button>
                      </div>
                    )}
                  </div>

                  {simulation && debtsSummary.totalBalance > 0 && (
                    <div className="p-3.5 rounded-lg bg-card border border-border space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <span>⚡</span> Accelerated Payoff Calculator
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            See how adding extra monthly payments fast-tracks your debt-free date.
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Extra:</span>
                          {[50, 100, 250, 500].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setExtraPayment(amt)}
                              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                                extraPayment === amt
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted/50 hover:bg-muted border-border text-muted-foreground"
                              }`}
                            >
                              +{formatCurrency(amt)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        <div className="p-2.5 rounded-md bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Avalanche Payoff</span>
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                              Saves {formatCurrency(simulation.avalanche.interestSaved)}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Debt-free in <span className="font-semibold text-foreground">{simulation.avalanche.months} mos</span>
                            {simulation.avalanche.monthsSaved > 0 && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium"> ({simulation.avalanche.monthsSaved} mos sooner)</span>
                            )}
                          </div>
                          {debtsSummary.highestAprDebt && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full h-6 text-[11px] border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              onClick={() =>
                                handleCreateAcceleratedPlanTask(
                                  "avalanche",
                                  debtsSummary.highestAprDebt,
                                  extraPayment,
                                  simulation.avalanche.monthsSaved,
                                  simulation.avalanche.interestSaved
                                )
                              }
                              disabled={createTaskMutation.isPending}
                            >
                              + Schedule Avalanche Plan
                            </Button>
                          )}
                        </div>

                        <div className="p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-blue-600 dark:text-blue-400">Snowball Payoff</span>
                            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/30">
                              Saves {formatCurrency(simulation.snowball.interestSaved)}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Debt-free in <span className="font-semibold text-foreground">{simulation.snowball.months} mos</span>
                            {simulation.snowball.monthsSaved > 0 && (
                              <span className="text-blue-600 dark:text-blue-400 font-medium"> ({simulation.snowball.monthsSaved} mos sooner)</span>
                            )}
                          </div>
                          {debtsSummary.lowestBalanceDebt && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full h-6 text-[11px] border-blue-500/30 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              onClick={() =>
                                handleCreateAcceleratedPlanTask(
                                  "snowball",
                                  debtsSummary.lowestBalanceDebt,
                                  extraPayment,
                                  simulation.snowball.monthsSaved,
                                  simulation.snowball.interestSaved
                                )
                              }
                              disabled={createTaskMutation.isPending}
                            >
                              + Schedule Snowball Plan
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {debts.map((debt, idx) => {
                      const id = (debt as any).id || (debt as any)._id || String(idx);
                      const analysis = getDebtAnalysis(debt);
                      return (
                        <div key={id} className="p-3.5 rounded-lg bg-accent/50 border border-border/50 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{debt.name}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {debt.type || "Loan"}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Balance: {formatCurrency(debt.balance)} • APR: {debt.interest_rate}% • Min:{" "}
                                {formatCurrency(debt.minimum_payment)}
                              </div>
                              <div className="text-xs text-muted-foreground">Type: {debt.type}</div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => startEditDebt(debt as any)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (!window.confirm("Delete this debt?")) return;
                                  deleteDebtMutation.mutate(String((debt as any).id || (debt as any)._id));
                                }}
                                disabled={deleteDebtMutation.isPending}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>

                          <div
                            className={`text-[11px] px-2 py-1 rounded bg-background/60 border border-border/40 ${
                              analysis.isWarning ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"
                            }`}
                          >
                            {analysis.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        <Dialog open={isWindfallOpen} onOpenChange={setIsWindfallOpen}>
          <DialogContent className="max-w-md" data-testid="dialog-windfall-redistribute">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Distribute Lump-Sum Windfall
              </DialogTitle>
              <DialogDescription>
                Allocate a bonus, tax refund, or cash gift across your active savings goals using your active {rebalanceStrategy} strategy.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="windfall-amount-input">Windfall Amount</Label>
                <Input
                  id="windfall-amount-input"
                  data-testid="windfall-amount-input"
                  type="number"
                  min="1"
                  step="50"
                  value={windfallAmount}
                  onChange={e => setWindfallAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1"
                />
              </div>

              {multiGoalRebalance && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Projected Allocation Breakdown</Label>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {multiGoalRebalance.items.map(item => {
                      const id = (item.goal as any).id || (item.goal as any)._id;
                      return (
                        <div
                          key={id}
                          className="p-2 rounded bg-accent/40 border border-border/50 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-medium text-foreground">{item.goal.name}</span>
                            <div className="text-[10px] text-muted-foreground">
                              Current: {formatCurrency(Number(item.goal.current) || 0)} → New:{" "}
                              {formatCurrency((Number(item.goal.current) || 0) + item.windfallAllocation)}
                            </div>
                          </div>
                          <Badge variant="secondary" className="font-semibold text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency(item.windfallAllocation)}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between pt-1">
                    <span>Total Allocated:</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(multiGoalRebalance.allocatedWindfallSum)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsWindfallOpen(false)}
                  disabled={isApplyingWindfall}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleApplyWindfall}
                  disabled={isApplyingWindfall || !multiGoalRebalance || multiGoalRebalance.allocatedWindfallSum <= 0}
                  data-testid="apply-windfall-btn"
                >
                  {isApplyingWindfall ? "Distributing..." : "Apply Windfall to Goals"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );
}

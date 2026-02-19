import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useToast } from "@/hooks/useToast";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import {
  ApiError,
  createDebt,
  createGoal,
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

export default function GoalsAndDebts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatMoney } = useOrgFormatters();

  const { data: profile, isLoading } = useQuery<IFinancialProfile>({
    queryKey: ["/api/financial-profiles/me"],
  });

  const goals = useMemo(() => (profile?.goals || []) as IFinancialGoal[], [profile?.goals]);
  const debts = useMemo(() => (profile?.debts || []) as IDebt[], [profile?.debts]);

  const [goalForm, setGoalForm] = useState<GoalForm>(EMPTY_GOAL);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const [debtForm, setDebtForm] = useState<DebtForm>(EMPTY_DEBT);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);

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

  const submitGoal = async (event: FormEvent) => {
    event.preventDefault();

    const target = Number(goalForm.target);
    const current = Number(goalForm.current || 0);
    const priority = Number(goalForm.priority || 1);

    if (!goalForm.name.trim() || !Number.isFinite(target) || target < 0 || !goalForm.deadline) return;

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

    if (!debtForm.name.trim()) return;

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
      deadline: String(goal.deadline || ""),
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

  const formatCurrency = (value: number) => formatMoney(value, { maximumFractionDigits: 0 });

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
                <div className="space-y-3">
                  {goals.map((goal, idx) => {
                    const id = (goal as any).id || (goal as any)._id || String(idx);
                    const progress =
                      goal.target > 0 ? Math.min(100, Math.round(((goal.current || 0) / goal.target) * 100)) : 0;
                    return (
                      <div key={id} className="p-3 rounded-lg bg-accent/50 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{goal.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(goal.current || 0)} / {formatCurrency(goal.target)} ({progress}%)
                          </div>
                          <div className="text-xs text-muted-foreground">Deadline: {goal.deadline}</div>
                        </div>
                        <div className="flex gap-2">
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
                    );
                  })}
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
                <div className="space-y-3">
                  {debts.map((debt, idx) => {
                    const id = (debt as any).id || (debt as any)._id || String(idx);
                    return (
                      <div key={id} className="p-3 rounded-lg bg-accent/50 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{debt.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Balance: {formatCurrency(debt.balance)} • APR: {debt.interest_rate}% • Min:{" "}
                            {formatCurrency(debt.minimum_payment)}
                          </div>
                          <div className="text-xs text-muted-foreground">Type: {debt.type}</div>
                        </div>
                        <div className="flex gap-2">
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
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}
      </motion.div>
    </div>
  );
}

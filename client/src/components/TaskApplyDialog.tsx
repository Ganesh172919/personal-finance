import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useToast } from "@/hooks/useToast";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { ApiError, applyTaskEffects, type Task, type TaskEffect, type TaskStatus, updateTaskStatus, type TransactionType } from "@/lib/apiClient";
import type { IDebt, IFinancialGoal, IFinancialProfile } from "@/types";

const makeIdempotencyKey = (taskId: string) => {
  const cryptoAny = globalThis.crypto as any;
  if (cryptoAny?.randomUUID) {
    return `${taskId}-${cryptoAny.randomUUID()}`;
  }
  return `${taskId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

type DraftType = TaskEffect["type"];

const inferTxType = (kind: Task["kind"]): TransactionType => {
  if (kind === "invest") return "investment";
  if (kind === "cashflow") return "income";
  return "expense";
};

export function TaskApplyDialog(props: {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultNote?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currency } = useOrgFormatters({ enabled: props.open });

  const task = props.task;

  const [note, setNote] = useState(props.defaultNote || "");
  const [idempotencyKey, setIdempotencyKey] = useState(() => makeIdempotencyKey(task._id));
  const [effects, setEffects] = useState<TaskEffect[]>([]);

  const [draftType, setDraftType] = useState<DraftType>("transaction");
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState(task.kind === "invest" ? "Investment" : task.kind === "cashflow" ? "Income" : "Other");
  const [txDescription, setTxDescription] = useState(task.title);
  const [txType, setTxType] = useState<TransactionType>(() => inferTxType(task.kind));

  const [goalId, setGoalId] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalMode, setGoalMode] = useState<"increment" | "set">("increment");

  const [debtId, setDebtId] = useState("");
  const [debtAmount, setDebtAmount] = useState("");

  const [profileAnnualIncome, setProfileAnnualIncome] = useState("");
  const [profileMonthlyExpenses, setProfileMonthlyExpenses] = useState("");
  const [profileSavings, setProfileSavings] = useState("");

  const profileQuery = useQuery<IFinancialProfile>({
    queryKey: ["/api/financial-profiles/me"],
    enabled: props.open,
  });

  const goals = useMemo(() => ((profileQuery.data?.goals || []) as IFinancialGoal[]) || [], [profileQuery.data?.goals]);
  const debts = useMemo(() => ((profileQuery.data?.debts || []) as IDebt[]) || [], [profileQuery.data?.debts]);

  useEffect(() => {
    if (!props.open) return;
    setNote(props.defaultNote || "");
    setIdempotencyKey(makeIdempotencyKey(task._id));
    setEffects([]);
    setDraftType("transaction");
    setTxAmount("");
    setTxCategory(task.kind === "invest" ? "Investment" : task.kind === "cashflow" ? "Income" : "Other");
    setTxDescription(task.title);
    setTxType(inferTxType(task.kind));
    setGoalId(goals[0]?.id || "");
    setGoalAmount("");
    setGoalMode("increment");
    setDebtId(debts[0]?.id || "");
    setDebtAmount("");
    setProfileAnnualIncome("");
    setProfileMonthlyExpenses("");
    setProfileSavings("");
  }, [props.open, props.defaultNote, task._id, task.kind, task.title, goals, debts]);

  const addEffect = () => {
    if (draftType === "transaction") {
      const amount = Number(txAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast({ title: "Invalid amount", description: `Enter a valid ${currency} amount.`, variant: "destructive" });
        return;
      }
      if (!txCategory.trim()) {
        toast({ title: "Category required", variant: "destructive" });
        return;
      }
      setEffects((prev) => [
        ...prev,
        {
          type: "transaction",
          transaction: {
            amount,
            category: txCategory.trim(),
            description: txDescription.trim() || task.title,
            tx_type: txType,
          },
        },
      ]);
      setTxAmount("");
      return;
    }

    if (draftType === "goal_progress") {
      const amount = Number(goalAmount);
      if (!goalId) {
        toast({ title: "Select a goal", variant: "destructive" });
        return;
      }
      if (!Number.isFinite(amount) || amount < 0) {
        toast({ title: "Invalid amount", description: "Enter a valid amount.", variant: "destructive" });
        return;
      }
      setEffects((prev) => [...prev, { type: "goal_progress", goal_id: goalId, amount, mode: goalMode }]);
      setGoalAmount("");
      return;
    }

    if (draftType === "debt_payment") {
      const amount = Number(debtAmount);
      if (!debtId) {
        toast({ title: "Select a debt", variant: "destructive" });
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        toast({ title: "Invalid amount", description: "Enter a valid amount.", variant: "destructive" });
        return;
      }
      setEffects((prev) => [...prev, { type: "debt_payment", debt_id: debtId, amount }]);
      setDebtAmount("");
      return;
    }

    if (draftType === "profile_update") {
      const updates: any = {};
      const annualIncome = profileAnnualIncome.trim() ? Number(profileAnnualIncome) : undefined;
      const monthlyExpenses = profileMonthlyExpenses.trim() ? Number(profileMonthlyExpenses) : undefined;
      const savings = profileSavings.trim() ? Number(profileSavings) : undefined;

      if (annualIncome !== undefined) updates.annual_income = annualIncome;
      if (monthlyExpenses !== undefined) updates.monthly_expenses = monthlyExpenses;
      if (savings !== undefined) updates.savings = savings;

      if (Object.keys(updates).length === 0) {
        toast({ title: "Add at least one update", variant: "destructive" });
        return;
      }
      setEffects((prev) => [...prev, { type: "profile_update", updates }]);
      setProfileAnnualIncome("");
      setProfileMonthlyExpenses("");
      setProfileSavings("");
    }
  };

  const removeEffect = (idx: number) => setEffects((prev) => prev.filter((_, i) => i !== idx));

  const applyMutation = useMutation({
    mutationFn: () =>
      applyTaskEffects(task._id, {
        idempotency_key: idempotencyKey,
        note: note.trim() || undefined,
        effects,
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
      props.onOpenChange(false);
      toast({
        title: data.idempotent_replay ? "Task already applied" : "Task applied",
        description: `Transactions: ${data.applied_effects.transactions.length} • Goals: ${data.applied_effects.goals.length} • Debts: ${data.applied_effects.debts.length}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Apply failed",
        description: formatError(error, "Failed to apply task effects."),
        variant: "destructive",
      });
    },
  });

  const markCompletedMutation = useMutation({
    mutationFn: (status: TaskStatus) => updateTaskStatus(task._id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Apply task outcomes</DialogTitle>
          <DialogDescription>
            Convert this task into updates (transactions, goal progress, debt payments, or profile updates).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-sm font-semibold text-foreground">{task.title}</div>
            <div className="text-xs text-muted-foreground mt-1">{task.why}</div>
          </Card>

          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do?" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Effects</Label>
              <Button variant="outline" size="sm" onClick={() => setEffects([])} disabled={effects.length === 0}>
                Clear
              </Button>
            </div>

            {effects.length === 0 ? (
              <div className="text-sm text-muted-foreground">No effects added. You can still apply to mark it done.</div>
            ) : (
              <div className="space-y-2">
                {effects.map((effect, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div className="text-sm">
                      <div className="font-medium text-foreground">{effect.type.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted-foreground">
                        {effect.type === "transaction"
                          ? `${effect.transaction.tx_type} • ${effect.transaction.category} • ${effect.transaction.amount}`
                          : effect.type === "goal_progress"
                            ? `Goal • ${effect.amount} (${effect.mode || "increment"})`
                            : effect.type === "debt_payment"
                              ? `Debt • ${effect.amount}`
                              : `Profile update`}
                      </div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => removeEffect(idx)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">Add effect</div>
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as DraftType)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="transaction">Transaction</option>
                <option value="goal_progress">Goal progress</option>
                <option value="debt_payment">Debt payment</option>
                <option value="profile_update">Profile update</option>
              </select>
            </div>

            {draftType === "transaction" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Amount ({currency})</Label>
                  <Input value={txAmount} onChange={(e) => setTxAmount(e.target.value)} type="number" min="0" step="1" />
                </div>
                <div>
                  <Label>Type</Label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as TransactionType)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="investment">Investment</option>
                  </select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={txCategory} onChange={(e) => setTxCategory(e.target.value)} placeholder="Food, Rent..." />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={txDescription} onChange={(e) => setTxDescription(e.target.value)} placeholder={task.title} />
                </div>
              </div>
            ) : null}

            {draftType === "goal_progress" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label>Goal</Label>
                  <select
                    value={goalId}
                    onChange={(e) => setGoalId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    disabled={goals.length === 0}
                  >
                    <option value="">{goals.length ? "Select goal" : "No goals yet"}</option>
                    {goals.map((g) => (
                      <option key={String(g.id)} value={String(g.id)}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Mode</Label>
                  <select
                    value={goalMode}
                    onChange={(e) => setGoalMode(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="increment">Increment</option>
                    <option value="set">Set</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <Label>Amount</Label>
                  <Input value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} type="number" min="0" step="1" />
                </div>
              </div>
            ) : null}

            {draftType === "debt_payment" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Debt</Label>
                  <select
                    value={debtId}
                    onChange={(e) => setDebtId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    disabled={debts.length === 0}
                  >
                    <option value="">{debts.length ? "Select debt" : "No debts yet"}</option>
                    {debts.map((d) => (
                      <option key={String(d.id)} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} type="number" min="0" step="1" />
                </div>
              </div>
            ) : null}

            {draftType === "profile_update" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Annual income</Label>
                  <Input value={profileAnnualIncome} onChange={(e) => setProfileAnnualIncome(e.target.value)} type="number" min="0" step="1" />
                </div>
                <div>
                  <Label>Monthly expenses</Label>
                  <Input value={profileMonthlyExpenses} onChange={(e) => setProfileMonthlyExpenses(e.target.value)} type="number" min="0" step="1" />
                </div>
                <div>
                  <Label>Savings</Label>
                  <Input value={profileSavings} onChange={(e) => setProfileSavings(e.target.value)} type="number" step="1" />
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button variant="secondary" onClick={addEffect}>
                Add effect
              </Button>
            </div>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => markCompletedMutation.mutate("completed")}
            disabled={markCompletedMutation.isPending}
            title="Mark as completed without applying effects"
          >
            Mark completed
          </Button>
          <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
            Apply outcomes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

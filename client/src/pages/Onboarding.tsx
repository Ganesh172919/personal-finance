import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Papa from "papaparse";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useToast } from "@/hooks/useToast";
import {
  ApiError,
  apiClient,
  createDebt,
  createGoal,
  deleteDebt,
  deleteGoal,
  importTransactions,
} from "@/lib/apiClient";
import type { IDebt, IFinancialGoal, IFinancialProfile } from "@/types";

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 0, label: "Basics" },
  { key: 1, label: "Income" },
  { key: 2, label: "Goals" },
  { key: 3, label: "Debts" },
  { key: 4, label: "Transactions" },
  { key: 5, label: "Review" },
];

const safeNumber = (value: string) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const errorDescription = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

type CsvState = {
  fileName: string;
  columns: string[];
  rawRows: Array<Record<string, string>>;
  mapping: {
    amount: string;
    category: string;
    description: string;
    date: string;
    type: string;
  };
};

const emptyCsvState: CsvState = {
  fileName: "",
  columns: [],
  rawRows: [],
  mapping: { amount: "", category: "", description: "", date: "", type: "" },
};

const pickFirstMatchingColumn = (columns: string[], candidates: string[]) => {
  const normalized = columns.map(col => ({ col, key: col.trim().toLowerCase() }));
  for (const candidate of candidates) {
    const key = candidate.trim().toLowerCase();
    const match = normalized.find(item => item.key === key);
    if (match) return match.col;
  }
  return "";
};

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {STEPS.map((s) => (
        <div
          key={s.key}
          className={`px-3 py-1 rounded-full text-sm ${
            s.key === step ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
          }`}
        >
          {s.label}
        </div>
      ))}
    </div>
  );
}

export default function Onboarding() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery<IFinancialProfile>({
    queryKey: ["/api/financial-profiles/me"],
  });

  const goals = useMemo(() => (profile?.goals || []) as IFinancialGoal[], [profile?.goals]);
  const debts = useMemo(() => (profile?.debts || []) as IDebt[], [profile?.debts]);

  const [step, setStep] = useState<Step>(0);

  const [age, setAge] = useState("");
  const [riskTolerance, setRiskTolerance] = useState<IFinancialProfile["risk_tolerance"]>("moderate");
  const [investmentExperience, setInvestmentExperience] =
    useState<IFinancialProfile["investment_experience"]>("beginner");

  const [annualIncome, setAnnualIncome] = useState("");
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [savings, setSavings] = useState("");

  const [goalForm, setGoalForm] = useState({
    name: "",
    target: "",
    current: "0",
    deadline: "",
    priority: "1",
  });

  const [debtForm, setDebtForm] = useState({
    name: "",
    balance: "",
    interest_rate: "",
    minimum_payment: "",
    type: "Loan",
  });

  const [csv, setCsv] = useState<CsvState>(emptyCsvState);

  useEffect(() => {
    if (!profile) return;
    setAge(String(profile.age ?? ""));
    setRiskTolerance(profile.risk_tolerance || "moderate");
    setInvestmentExperience(profile.investment_experience || "beginner");
    setAnnualIncome(String(profile.annual_income ?? ""));
    setMonthlyExpenses(String(profile.monthly_expenses ?? ""));
    setSavings(String(profile.savings ?? ""));
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: Partial<IFinancialProfile>) =>
      apiClient("/financial-profiles/me", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
    },
  });

  const createGoalMutation = useMutation({
    mutationFn: createGoal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
    },
  });

  const createDebtMutation = useMutation({
    mutationFn: createDebt,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
    },
  });

  const deleteDebtMutation = useMutation({
    mutationFn: deleteDebt,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
    },
  });

  const importTransactionsMutation = useMutation({
    mutationFn: importTransactions,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
      toast({ title: "Imported", description: `Imported ${data.inserted} transactions.` });
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: errorDescription(error, "Failed to import transactions."),
        variant: "destructive",
      });
    },
  });

  const canNext = step < 5;

  const goNext = () => {
    if (!canNext) return;
    setStep((prev) => (Math.min(5, (prev + 1) as Step) as Step));
  };

  const goBack = () => {
    setStep((prev) => (Math.max(0, (prev - 1) as Step) as Step));
  };

  const saveBasics = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await updateProfileMutation.mutateAsync({
        age: safeNumber(age),
        risk_tolerance: riskTolerance,
        investment_experience: investmentExperience,
      } as any);
      toast({ title: "Saved", description: "Basics updated." });
      goNext();
    } catch (error) {
      toast({
        title: "Update Failed",
        description: errorDescription(error, "Failed to update basics."),
        variant: "destructive",
      });
    }
  };

  const saveIncome = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await updateProfileMutation.mutateAsync({
        annual_income: safeNumber(annualIncome),
        monthly_expenses: safeNumber(monthlyExpenses),
        savings: safeNumber(savings),
      } as any);
      toast({ title: "Saved", description: "Income, expenses, and savings updated." });
      goNext();
    } catch (error) {
      toast({
        title: "Update Failed",
        description: errorDescription(error, "Failed to update income/expenses."),
        variant: "destructive",
      });
    }
  };

  const addGoal = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createGoalMutation.mutateAsync({
        name: goalForm.name.trim(),
        target: safeNumber(goalForm.target),
        current: safeNumber(goalForm.current),
        deadline: goalForm.deadline,
        priority: safeNumber(goalForm.priority) || 1,
      });
      setGoalForm({ name: "", target: "", current: "0", deadline: "", priority: "1" });
      toast({ title: "Added", description: "Goal created." });
    } catch (error) {
      toast({
        title: "Goal Failed",
        description: errorDescription(error, "Failed to create goal."),
        variant: "destructive",
      });
    }
  };

  const addDebt = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createDebtMutation.mutateAsync({
        name: debtForm.name.trim(),
        balance: safeNumber(debtForm.balance),
        interest_rate: safeNumber(debtForm.interest_rate),
        minimum_payment: safeNumber(debtForm.minimum_payment),
        type: debtForm.type.trim() || "Loan",
      });
      setDebtForm({ name: "", balance: "", interest_rate: "", minimum_payment: "", type: "Loan" });
      toast({ title: "Added", description: "Debt recorded." });
    } catch (error) {
      toast({
        title: "Debt Failed",
        description: errorDescription(error, "Failed to create debt."),
        variant: "destructive",
      });
    }
  };

  const handleCsvFile = async (file: File) => {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: header => header.trim(),
    });

    const rows = (parsed.data || []).filter(Boolean);
    const columns = (parsed.meta.fields || []).filter(Boolean);

    const mapping = {
      amount: pickFirstMatchingColumn(columns, ["amount", "amt", "value"]),
      category: pickFirstMatchingColumn(columns, ["category", "cat"]),
      description: pickFirstMatchingColumn(columns, ["description", "desc", "narration", "note"]),
      date: pickFirstMatchingColumn(columns, ["date", "txn_date", "transaction_date"]),
      type: pickFirstMatchingColumn(columns, ["type", "txn_type", "transaction_type"]),
    };

    setCsv({
      fileName: file.name,
      columns,
      rawRows: rows.slice(0, 500),
      mapping,
    });
  };

  const previewRows = useMemo(() => {
    if (!csv.rawRows.length) return [];
    const { mapping } = csv;
    if (!mapping.amount || !mapping.category || !mapping.description || !mapping.date || !mapping.type) return [];

    const mapped = csv.rawRows.slice(0, 5).map((row) => {
      const type = String(row[mapping.type] || "").trim().toLowerCase();
      return {
        date: String(row[mapping.date] || "").trim(),
        description: String(row[mapping.description] || "").trim(),
        category: String(row[mapping.category] || "").trim(),
        amount: String(row[mapping.amount] || "").trim(),
        type,
      };
    });

    return mapped;
  }, [csv]);

  const runImport = async () => {
    const { mapping } = csv;
    if (!csv.rawRows.length) return;
    if (!mapping.amount || !mapping.category || !mapping.description || !mapping.date || !mapping.type) {
      toast({
        title: "Mapping required",
        description: "Map all required fields (amount, category, description, date, type).",
        variant: "destructive",
      });
      return;
    }

    const rows = csv.rawRows
      .map((row) => {
        const amount = safeNumber(String(row[mapping.amount] ?? ""));
        const type = String(row[mapping.type] || "").trim().toLowerCase() as any;
        return {
          amount: Math.abs(amount),
          category: String(row[mapping.category] || "").trim() || "Other",
          description: String(row[mapping.description] || "").trim() || "Imported",
          date: String(row[mapping.date] || "").trim(),
          type,
        };
      })
      .filter((row) => row.amount > 0 && row.date && (row.type === "income" || row.type === "expense" || row.type === "investment"));

    if (rows.length === 0) {
      toast({
        title: "No rows to import",
        description: "Check mapping and ensure type values are income/expense/investment.",
        variant: "destructive",
      });
      return;
    }

    await importTransactionsMutation.mutateAsync(rows as any);
  };

  const finish = () => {
    const complete = async () => {
      try {
        await updateProfileMutation.mutateAsync({
          onboardingCompletedAt: new Date().toISOString(),
          onboardingVersion: "v1",
        } as any);
        localStorage.setItem("onboarding_completed", "true");
        navigate("/chat");
      } catch (error) {
        toast({
          title: "Finish failed",
          description: errorDescription(error, "Failed to mark onboarding complete."),
          variant: "destructive",
        });
      }
    };

    void complete();
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading onboarding...</div>;
  }

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="onboarding-page">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to FinWise</h1>
        <p className="text-muted-foreground mb-6">Let's set up your profile so insights and plans are accurate.</p>

        <StepIndicator step={step} />

        {step === 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Basics</h2>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={saveBasics}>
              <div>
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" min="1" max="120" value={age} onChange={e => setAge(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="risk">Risk tolerance</Label>
                <select
                  id="risk"
                  value={riskTolerance}
                  onChange={e => setRiskTolerance(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                >
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div>
                <Label htmlFor="experience">Investment experience</Label>
                <select
                  id="experience"
                  value={investmentExperience}
                  onChange={e => setInvestmentExperience(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="expert">Expert</option>
                </select>
              </div>

              <div className="md:col-span-2 flex gap-3 mt-2">
                <Button type="submit" disabled={updateProfileMutation.isPending}>
                  Save & Continue
                </Button>
                <Button type="button" variant="outline" onClick={finish}>
                  Skip for now
                </Button>
              </div>
            </form>
          </Card>
        )}

        {step === 1 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Income, Expenses & Savings</h2>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={saveIncome}>
              <div>
                <Label htmlFor="annual_income">Annual income</Label>
                <Input
                  id="annual_income"
                  type="number"
                  min="0"
                  value={annualIncome}
                  onChange={e => setAnnualIncome(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="monthly_expenses">Monthly expenses</Label>
                <Input
                  id="monthly_expenses"
                  type="number"
                  min="0"
                  value={monthlyExpenses}
                  onChange={e => setMonthlyExpenses(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="savings">Current savings</Label>
                <Input id="savings" type="number" min="0" value={savings} onChange={e => setSavings(e.target.value)} />
              </div>

              <div className="md:col-span-2 flex gap-3 mt-2">
                <Button type="button" variant="outline" onClick={goBack}>
                  Back
                </Button>
                <Button type="submit" disabled={updateProfileMutation.isPending}>
                  Save & Continue
                </Button>
              </div>
            </form>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-2">Goals</h2>
            <p className="text-muted-foreground mb-4">
              Add at least one goal to get stronger recommendations (optional).
            </p>

            <form className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6" onSubmit={addGoal}>
              <div className="md:col-span-2">
                <Label htmlFor="goal_name">Name</Label>
                <Input
                  id="goal_name"
                  value={goalForm.name}
                  onChange={e => setGoalForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Emergency fund"
                  required
                />
              </div>
              <div>
                <Label htmlFor="goal_target">Target</Label>
                <Input
                  id="goal_target"
                  type="number"
                  min="0"
                  value={goalForm.target}
                  onChange={e => setGoalForm(prev => ({ ...prev, target: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="goal_deadline">Deadline</Label>
                <Input
                  id="goal_deadline"
                  type="date"
                  value={goalForm.deadline}
                  onChange={e => setGoalForm(prev => ({ ...prev, deadline: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="goal_current">Current</Label>
                <Input
                  id="goal_current"
                  type="number"
                  min="0"
                  value={goalForm.current}
                  onChange={e => setGoalForm(prev => ({ ...prev, current: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="goal_priority">Priority (1-10)</Label>
                <Input
                  id="goal_priority"
                  type="number"
                  min="1"
                  max="10"
                  value={goalForm.priority}
                  onChange={e => setGoalForm(prev => ({ ...prev, priority: e.target.value }))}
                  required
                />
              </div>

              <div className="md:col-span-2 flex gap-3">
                <Button type="submit" disabled={createGoalMutation.isPending}>
                  Add Goal
                </Button>
                <Button type="button" variant="outline" onClick={goNext}>
                  Continue
                </Button>
              </div>
            </form>

            {goals.length === 0 ? (
              <div className="text-muted-foreground text-sm">No goals yet.</div>
            ) : (
              <div className="space-y-3">
                {goals.map((goal, idx) => {
                  const id = (goal as any).id || (goal as any)._id || String(idx);
                  return (
                    <div key={id} className="p-3 rounded-lg bg-accent/50 flex justify-between gap-3">
                      <div>
                        <div className="font-medium">{goal.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Target: {goal.target} • Current: {goal.current} • Deadline: {goal.deadline}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteGoalMutation.mutate(String((goal as any).id || (goal as any)._id))}
                        disabled={deleteGoalMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <Button type="button" variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button type="button" onClick={goNext}>
                Next
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-2">Debts</h2>
            <p className="text-muted-foreground mb-4">Add debts so payoff plans are accurate (optional).</p>

            <form className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6" onSubmit={addDebt}>
              <div className="md:col-span-2">
                <Label htmlFor="debt_name">Name</Label>
                <Input
                  id="debt_name"
                  value={debtForm.name}
                  onChange={e => setDebtForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Credit Card"
                  required
                />
              </div>
              <div>
                <Label htmlFor="debt_balance">Balance</Label>
                <Input
                  id="debt_balance"
                  type="number"
                  min="0"
                  value={debtForm.balance}
                  onChange={e => setDebtForm(prev => ({ ...prev, balance: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="debt_interest">Interest rate (%)</Label>
                <Input
                  id="debt_interest"
                  type="number"
                  min="0"
                  max="100"
                  value={debtForm.interest_rate}
                  onChange={e => setDebtForm(prev => ({ ...prev, interest_rate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="debt_minimum">Minimum payment</Label>
                <Input
                  id="debt_minimum"
                  type="number"
                  min="0"
                  value={debtForm.minimum_payment}
                  onChange={e => setDebtForm(prev => ({ ...prev, minimum_payment: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="debt_type">Type</Label>
                <Input
                  id="debt_type"
                  value={debtForm.type}
                  onChange={e => setDebtForm(prev => ({ ...prev, type: e.target.value }))}
                  required
                />
              </div>

              <div className="md:col-span-2 flex gap-3">
                <Button type="submit" disabled={createDebtMutation.isPending}>
                  Add Debt
                </Button>
                <Button type="button" variant="outline" onClick={goNext}>
                  Continue
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
                    <div key={id} className="p-3 rounded-lg bg-accent/50 flex justify-between gap-3">
                      <div>
                        <div className="font-medium">{debt.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Balance: {debt.balance} • APR: {debt.interest_rate}% • Min: {debt.minimum_payment}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteDebtMutation.mutate(String((debt as any).id || (debt as any)._id))}
                        disabled={deleteDebtMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <Button type="button" variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button type="button" onClick={goNext}>
                Next
              </Button>
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-2">Transactions</h2>
            <p className="text-muted-foreground mb-4">
              Import transactions to power summaries and AI context. You can also add them later in Transactions.
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="csv_file">Upload CSV</Label>
                <Input
                  id="csv_file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    handleCsvFile(file).catch((error) =>
                      toast({
                        title: "CSV Failed",
                        description: errorDescription(error, "Failed to parse CSV."),
                        variant: "destructive",
                      })
                    );
                  }}
                />
                {csv.fileName ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    Loaded {csv.rawRows.length} rows from {csv.fileName}
                  </div>
                ) : null}
              </div>

              {csv.columns.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(
                    [
                      ["amount", "Amount"],
                      ["category", "Category"],
                      ["description", "Description"],
                      ["date", "Date"],
                      ["type", "Type"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <Label>{label}</Label>
                      <select
                        value={(csv.mapping as any)[key]}
                        onChange={e =>
                          setCsv(prev => ({
                            ...prev,
                            mapping: { ...prev.mapping, [key]: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                      >
                        <option value="">Select column</option>
                        {csv.columns.map(col => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {previewRows.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Preview</div>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-left">Amount</th>
                          <th className="px-3 py-2 text-left">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-3 py-2">{row.date}</td>
                            <td className="px-3 py-2">{row.description}</td>
                            <td className="px-3 py-2">{row.category}</td>
                            <td className="px-3 py-2">{row.amount}</td>
                            <td className="px-3 py-2">{row.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={goBack}>
                  Back
                </Button>
                <Button type="button" onClick={() => navigate("/transactions")} variant="outline">
                  Add in Transactions
                </Button>
                <Button type="button" onClick={runImport} disabled={importTransactionsMutation.isPending}>
                  Import CSV
                </Button>
                <Button type="button" onClick={goNext}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        )}

        {step === 5 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-2">Review & Finish</h2>
            <p className="text-muted-foreground mb-4">
              Confirm your profile details. You can edit anything later from Onboarding or Goals & Debts.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-md border border-border p-3">
                <div className="font-medium text-foreground mb-1">Basics</div>
                <div className="text-muted-foreground">Age: {profile?.age ?? "—"}</div>
                <div className="text-muted-foreground">Risk tolerance: {profile?.risk_tolerance ?? "—"}</div>
                <div className="text-muted-foreground">Experience: {profile?.investment_experience ?? "—"}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="font-medium text-foreground mb-1">Income & expenses</div>
                <div className="text-muted-foreground">Annual income: {profile?.annual_income ?? 0}</div>
                <div className="text-muted-foreground">Monthly expenses: {profile?.monthly_expenses ?? 0}</div>
                <div className="text-muted-foreground">Savings: {profile?.savings ?? 0}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="font-medium text-foreground mb-1">Counts</div>
                <div className="text-muted-foreground">Goals: {goals.length}</div>
                <div className="text-muted-foreground">Debts: {debts.length}</div>
                <div className="text-muted-foreground">
                  Transactions: {Number(profile?.transactionsCount ?? profile?.transactions?.length ?? 0)}
                </div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="font-medium text-foreground mb-1">Completeness</div>
                <div className="text-muted-foreground">
                  Income: {profile?.completeness?.has_income ? "Yes" : "No"} • Expenses:{" "}
                  {profile?.completeness?.has_expenses ? "Yes" : "No"}
                </div>
                <div className="text-muted-foreground">
                  Goals: {profile?.completeness?.has_goals ? "Yes" : "No"} • Debts:{" "}
                  {profile?.completeness?.has_debts ? "Yes" : "No"}
                </div>
                <div className="text-muted-foreground">
                  Transactions: {profile?.completeness?.has_transactions ? "Yes" : "No"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <Button type="button" variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button type="button" onClick={finish} disabled={updateProfileMutation.isPending}>
                Finish
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

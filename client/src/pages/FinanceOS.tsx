import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useToast } from "@/hooks/useToast";
import { useAppConfig } from "@/hooks/useAppConfig";
import {
  createAccount,
  createRecurringRule,
  getBudgetEnvelopes,
  getForecast,
  listAccounts,
  listBudgetAllocations,
  listMerchants,
  listRecurringCandidates,
  listRecurringRules,
  updateAccount,
  updateRecurringRule,
  upsertBudgetAllocation,
  upsertMerchant,
  type AccountType,
  type RecurringCandidate,
  type RecurringRuleStatus,
} from "@/lib/apiClient";

const defaultPeriodKey = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const toIsoFromDatetimeLocal = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const asDate = new Date(trimmed);
  if (Number.isNaN(asDate.getTime())) return undefined;
  return asDate.toISOString();
};

export default function FinanceOS() {
  const { toast } = useToast();
  const configQuery = useAppConfig();
  const canAdmin = Boolean(configQuery.data?.org?.role && ["owner", "admin"].includes(configQuery.data.org.role));

  const orgCurrency = String((configQuery.data?.org as any)?.currency || "USD");

  const accountsQuery = useQuery({
    queryKey: ["v1/finance/accounts"],
    queryFn: listAccounts,
  });

  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountInstitution, setNewAccountInstitution] = useState("");
  const [newAccountType, setNewAccountType] = useState<AccountType>("checking");
  const [newAccountCurrency, setNewAccountCurrency] = useState(orgCurrency);
  const [newAccountMask, setNewAccountMask] = useState("");

  useEffect(() => {
    setNewAccountCurrency(orgCurrency);
  }, [orgCurrency]);

  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: async () => {
      toast({ title: "Account created" });
      setNewAccountName("");
      setNewAccountInstitution("");
      setNewAccountType("checking");
      setNewAccountCurrency(orgCurrency);
      setNewAccountMask("");
      await accountsQuery.refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Create failed",
        description: error?.message || "Couldn't create account.",
        variant: "destructive",
      });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: (payload: { id: string; status: "active" | "closed" }) => updateAccount(payload.id, { status: payload.status }),
    onSuccess: async () => {
      await accountsQuery.refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "Couldn't update account.",
        variant: "destructive",
      });
    },
  });

  const [merchantQuery, setMerchantQuery] = useState("");

  const merchantsQuery = useQuery({
    queryKey: ["v1/finance/merchants", merchantQuery],
    queryFn: () => listMerchants({ q: merchantQuery.trim() || undefined, limit: 200 }),
  });

  const [merchantName, setMerchantName] = useState("");
  const [merchantCategoryDefault, setMerchantCategoryDefault] = useState("");
  const [merchantAliases, setMerchantAliases] = useState("");

  const upsertMerchantMutation = useMutation({
    mutationFn: upsertMerchant,
    onSuccess: async () => {
      toast({ title: "Merchant saved" });
      setMerchantName("");
      setMerchantCategoryDefault("");
      setMerchantAliases("");
      await merchantsQuery.refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error?.message || "Couldn't save merchant.",
        variant: "destructive",
      });
    },
  });

  const [budgetPeriodKey, setBudgetPeriodKey] = useState(defaultPeriodKey);
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState(orgCurrency);

  useEffect(() => {
    setBudgetCurrency(orgCurrency);
  }, [orgCurrency]);

  const allocationsQuery = useQuery({
    queryKey: ["v1/finance/budgets", budgetPeriodKey],
    queryFn: () => listBudgetAllocations(budgetPeriodKey, { limit: 300 }),
  });

  const totalBudgeted = useMemo(() => {
    const rows = allocationsQuery.data?.allocations || [];
    return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [allocationsQuery.data?.allocations]);

  const upsertBudgetMutation = useMutation({
    mutationFn: (body: { category: string; amount: number; currency?: string }) => upsertBudgetAllocation(budgetPeriodKey, body),
    onSuccess: async () => {
      toast({ title: "Budget updated" });
      setBudgetCategory("");
      setBudgetAmount("");
      await allocationsQuery.refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "Couldn't update budget allocation.",
        variant: "destructive",
      });
    },
  });

  const recurringQuery = useQuery({
    queryKey: ["v1/finance/recurring"],
    queryFn: () => listRecurringRules({ limit: 200 }),
  });

  const [ruleName, setRuleName] = useState("");
  const [ruleCron, setRuleCron] = useState("0 9 1 * *");
  const [ruleStatus, setRuleStatus] = useState<RecurringRuleStatus>("active");
  const [ruleMerchantName, setRuleMerchantName] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [ruleAmountMin, setRuleAmountMin] = useState("");
  const [ruleAmountMax, setRuleAmountMax] = useState("");
  const [ruleNextRunAt, setRuleNextRunAt] = useState("");

  const createRuleMutation = useMutation({
    mutationFn: createRecurringRule,
    onSuccess: async () => {
      toast({ title: "Rule created" });
      setRuleName("");
      setRuleMerchantName("");
      setRuleCategory("");
      setRuleAmountMin("");
      setRuleAmountMax("");
      setRuleNextRunAt("");
      await recurringQuery.refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Create failed",
        description: error?.message || "Couldn't create recurring rule.",
        variant: "destructive",
      });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (payload: { id: string; status: RecurringRuleStatus }) => updateRecurringRule(payload.id, { status: payload.status }),
    onSuccess: async () => {
      await recurringQuery.refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "Couldn't update recurring rule.",
        variant: "destructive",
      });
    },
  });

  const periodKeyNormalized = budgetPeriodKey.trim();
  const periodKeyValid = useMemo(() => /^\d{4}-\d{2}$/.test(periodKeyNormalized), [periodKeyNormalized]);

  const envelopesQuery = useQuery({
    queryKey: ["v1/finance/budgets/envelopes", periodKeyNormalized],
    queryFn: () => getBudgetEnvelopes(periodKeyNormalized),
    enabled: periodKeyValid,
  });

  const [candidateDaysBack, setCandidateDaysBack] = useState("365");
  const [candidateMinOccurrences, setCandidateMinOccurrences] = useState("3");

  const candidatesQuery = useQuery({
    queryKey: ["v1/finance/recurring/candidates", candidateDaysBack, candidateMinOccurrences],
    queryFn: () =>
      listRecurringCandidates({
        days_back: Number(candidateDaysBack) || undefined,
        min_occurrences: Number(candidateMinOccurrences) || undefined,
        limit: 50,
      }),
  });

  const [forecastMonths, setForecastMonths] = useState("3");

  const forecastQuery = useQuery({
    queryKey: ["v1/finance/forecast", periodKeyNormalized, forecastMonths],
    queryFn: () =>
      getForecast({
        period_key: periodKeyNormalized,
        months: Number(forecastMonths) || undefined,
        top_categories: 8,
      }),
    enabled: periodKeyValid,
  });

  const createRuleFromCandidateMutation = useMutation({
    mutationFn: (candidate: RecurringCandidate) => createRecurringRule(candidate.suggested_rule),
    onSuccess: async () => {
      toast({ title: "Rule created", description: "Recurring rule created from candidate." });
      await Promise.allSettled([recurringQuery.refetch(), candidatesQuery.refetch()]);
    },
    onError: (error: any) => {
      toast({
        title: "Create failed",
        description: error?.message || "Couldn't create recurring rule from candidate.",
        variant: "destructive",
      });
    },
  });

  const handleCreateAccount = () => {
    if (!newAccountName.trim()) return;
    createAccountMutation.mutate({
      name: newAccountName.trim(),
      institution: newAccountInstitution.trim() || undefined,
      type: newAccountType,
      currency: newAccountCurrency.trim() || orgCurrency,
      mask: newAccountMask.trim() || undefined,
    });
  };

  const handleUpsertMerchant = () => {
    if (!merchantName.trim()) return;
    const aliases = merchantAliases
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 50);
    upsertMerchantMutation.mutate({
      name: merchantName.trim(),
      category_default: merchantCategoryDefault.trim() || undefined,
      aliases: aliases.length ? aliases : undefined,
    });
  };

  const handleUpsertBudget = () => {
    const category = budgetCategory.trim();
    const amount = Number(budgetAmount);
    if (!category) return;
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: "Invalid amount", description: "Amount must be a non-negative number.", variant: "destructive" });
      return;
    }

    upsertBudgetMutation.mutate({
      category,
      amount,
      currency: budgetCurrency.trim() || orgCurrency,
    });
  };

  const handleCreateRule = () => {
    if (!ruleName.trim() || !ruleCron.trim()) return;
    const amountMin = ruleAmountMin.trim() ? Number(ruleAmountMin) : undefined;
    const amountMax = ruleAmountMax.trim() ? Number(ruleAmountMax) : undefined;

    if (amountMin !== undefined && (!Number.isFinite(amountMin) || amountMin < 0)) {
      toast({ title: "Invalid min amount", variant: "destructive" });
      return;
    }
    if (amountMax !== undefined && (!Number.isFinite(amountMax) || amountMax < 0)) {
      toast({ title: "Invalid max amount", variant: "destructive" });
      return;
    }

    createRuleMutation.mutate({
      name: ruleName.trim(),
      cron: ruleCron.trim(),
      status: ruleStatus,
      merchant_name: ruleMerchantName.trim() || undefined,
      category: ruleCategory.trim() || undefined,
      amount_min: amountMin,
      amount_max: amountMax,
      next_run_at: toIsoFromDatetimeLocal(ruleNextRunAt),
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold text-foreground">Finance OS</div>
        <div className="text-sm text-muted-foreground">Accounts, merchants, budgets, and recurring rules (org-scoped).</div>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Accounts</CardTitle>
              <CardDescription>Link transactions to an account to unlock account-level insights.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canAdmin ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Only org admins can create or modify accounts.
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                <div className="sm:col-span-2">
                  <Label>Name</Label>
                  <Input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="Main checking" disabled={!canAdmin} />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={newAccountType} onValueChange={(v) => setNewAccountType(v as AccountType)} disabled={!canAdmin}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">checking</SelectItem>
                      <SelectItem value="savings">savings</SelectItem>
                      <SelectItem value="credit">credit</SelectItem>
                      <SelectItem value="brokerage">brokerage</SelectItem>
                      <SelectItem value="cash">cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input value={newAccountCurrency} onChange={(e) => setNewAccountCurrency(e.target.value)} placeholder="USD" disabled={!canAdmin} />
                </div>
                <div>
                  <Label>Mask (optional)</Label>
                  <Input value={newAccountMask} onChange={(e) => setNewAccountMask(e.target.value)} placeholder="1234" disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-3">
                  <Label>Institution (optional)</Label>
                  <Input value={newAccountInstitution} onChange={(e) => setNewAccountInstitution(e.target.value)} placeholder="Bank name" disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-2 flex items-end justify-end">
                  <Button onClick={handleCreateAccount} disabled={!canAdmin || createAccountMutation.isPending || newAccountName.trim().length < 2}>
                    {createAccountMutation.isPending ? "Creating..." : "Create account"}
                  </Button>
                </div>
              </div>

              {accountsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : accountsQuery.data?.accounts?.length ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Institution</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountsQuery.data.accounts.map((acc) => (
                        <TableRow key={acc.id}>
                          <TableCell>
                            <div className="font-medium">{acc.name}</div>
                            <div className="text-xs text-muted-foreground">{acc.mask ? `****${acc.mask}` : acc.id}</div>
                          </TableCell>
                          <TableCell className="capitalize">{acc.type}</TableCell>
                          <TableCell className="capitalize">{acc.status}</TableCell>
                          <TableCell>{acc.currency}</TableCell>
                          <TableCell>{acc.institution || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canAdmin || updateAccountMutation.isPending}
                              onClick={() =>
                                updateAccountMutation.mutate({
                                  id: acc.id,
                                  status: acc.status === "active" ? "closed" : "active",
                                })
                              }
                            >
                              {acc.status === "active" ? "Close" : "Reopen"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No accounts yet.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merchants" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Merchants</CardTitle>
              <CardDescription>Normalize merchant names and set default categories.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canAdmin ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Only org admins can edit merchant rules.
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label>Search</Label>
                  <Input value={merchantQuery} onChange={(e) => setMerchantQuery(e.target.value)} placeholder="coffee, uber, netflix..." />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label>Name</Label>
                  <Input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Starbucks" disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Default category (optional)</Label>
                  <Input
                    value={merchantCategoryDefault}
                    onChange={(e) => setMerchantCategoryDefault(e.target.value)}
                    placeholder="Food"
                    disabled={!canAdmin}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Aliases (optional, comma-separated)</Label>
                  <Input value={merchantAliases} onChange={(e) => setMerchantAliases(e.target.value)} placeholder="Starbucks #123, SBUX" disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-6 flex justify-end">
                  <Button onClick={handleUpsertMerchant} disabled={!canAdmin || upsertMerchantMutation.isPending || merchantName.trim().length < 1}>
                    {upsertMerchantMutation.isPending ? "Saving..." : "Save merchant"}
                  </Button>
                </div>
              </div>

              {merchantsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : merchantsQuery.data?.merchants?.length ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Normalized</TableHead>
                        <TableHead>Default category</TableHead>
                        <TableHead>Aliases</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {merchantsQuery.data.merchants.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.normalized_name}</TableCell>
                          <TableCell>{m.category_default || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {m.aliases && m.aliases.length > 0 ? m.aliases.slice(0, 6).join(", ") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No merchants found.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budgets" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Budgets</CardTitle>
              <CardDescription>Envelope-style allocations per month (YYYY-MM).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canAdmin ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Only org admins can set budgets.
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label>Period key</Label>
                  <Input value={budgetPeriodKey} onChange={(e) => setBudgetPeriodKey(e.target.value)} placeholder="2026-02" />
                  <div className="mt-1 text-xs text-muted-foreground">Format: YYYY-MM</div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Category</Label>
                  <Input value={budgetCategory} onChange={(e) => setBudgetCategory(e.target.value)} placeholder="Rent" disabled={!canAdmin} />
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="1200" disabled={!canAdmin} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value)} placeholder={orgCurrency} disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-6 flex justify-end">
                  <Button onClick={handleUpsertBudget} disabled={!canAdmin || upsertBudgetMutation.isPending || budgetCategory.trim().length < 1}>
                    {upsertBudgetMutation.isPending ? "Saving..." : "Upsert allocation"}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                Total budgeted: {totalBudgeted.toFixed(2)} {budgetCurrency || orgCurrency}
              </div>

              {allocationsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : allocationsQuery.data?.allocations?.length ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocationsQuery.data.allocations.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover:bg-muted/20"
                          onClick={() => {
                            setBudgetCategory(row.category);
                            setBudgetAmount(String(row.amount));
                            setBudgetCurrency(row.currency);
                          }}
                        >
                          <TableCell className="font-medium">{row.category}</TableCell>
                          <TableCell className="text-right">{Number(row.amount || 0).toFixed(2)}</TableCell>
                          <TableCell>{row.currency}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No allocations for this period.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Budget envelopes</CardTitle>
                <CardDescription>Planned vs spent for the selected period (computed from transactions).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Label>Period key</Label>
                    <Input value={budgetPeriodKey} onChange={(e) => setBudgetPeriodKey(e.target.value)} placeholder="2026-02" />
                    <div className="mt-1 text-xs text-muted-foreground">Format: YYYY-MM</div>
                  </div>
                  <div className="sm:col-span-4 flex items-end justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        void envelopesQuery.refetch();
                        void forecastQuery.refetch();
                      }}
                      disabled={!periodKeyValid}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>

                {!periodKeyValid ? (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Enter a valid period key (YYYY-MM) to view envelope and forecast insights.
                  </div>
                ) : envelopesQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : envelopesQuery.data?.envelopes?.length ? (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Planned</div>
                        <div className="text-sm font-semibold">
                          {envelopesQuery.data.totals.planned.toFixed(2)} {envelopesQuery.data.currency}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Spent</div>
                        <div className="text-sm font-semibold">
                          {envelopesQuery.data.totals.spent.toFixed(2)} {envelopesQuery.data.currency}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Remaining</div>
                        <div className="text-sm font-semibold">
                          {envelopesQuery.data.totals.remaining.toFixed(2)} {envelopesQuery.data.currency}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Unbudgeted spent</div>
                        <div className="text-sm font-semibold">
                          {envelopesQuery.data.totals.unbudgeted_spent.toFixed(2)} {envelopesQuery.data.currency}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Planned</TableHead>
                            <TableHead className="text-right">Spent</TableHead>
                            <TableHead className="text-right">Remaining</TableHead>
                            <TableHead className="text-right">Tx</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {envelopesQuery.data.envelopes.map((row) => (
                            <TableRow key={`${row.category}:${row.unbudgeted ? "unbudgeted" : "budgeted"}`}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <span>{row.category}</span>
                                  {row.unbudgeted ? <Badge variant="secondary">Unbudgeted</Badge> : null}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{row.planned.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.spent.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.remaining.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.tx_count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No envelope data for this period.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recurring candidates</CardTitle>
                <CardDescription>Detected recurring charges from recent transactions. Create a rule to drive forecasting and automations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  <div>
                    <Label>Days back</Label>
                    <Input value={candidateDaysBack} onChange={(e) => setCandidateDaysBack(e.target.value)} placeholder="365" />
                  </div>
                  <div>
                    <Label>Min occurrences</Label>
                    <Input value={candidateMinOccurrences} onChange={(e) => setCandidateMinOccurrences(e.target.value)} placeholder="3" />
                  </div>
                  <div className="sm:col-span-4 flex items-end justify-end">
                    <Button variant="outline" onClick={() => void candidatesQuery.refetch()} disabled={candidatesQuery.isFetching}>
                      {candidatesQuery.isFetching ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>
                </div>

                {candidatesQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : candidatesQuery.data?.candidates?.length ? (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Cadence</TableHead>
                          <TableHead className="text-right">Occurrences</TableHead>
                          <TableHead className="text-right">Confidence</TableHead>
                          <TableHead className="text-right">Avg</TableHead>
                          <TableHead className="text-right">Range</TableHead>
                          <TableHead>Suggested cron</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {candidatesQuery.data.candidates.slice(0, 40).map((c) => (
                          <TableRow key={c.candidate_id}>
                            <TableCell>
                              <div className="font-medium">{c.suggested_rule.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {c.merchant_name ? `${c.merchant_name} · ` : ""}
                                {c.description_sample}
                              </div>
                              {c.rationale?.length ? (
                                <div className="mt-1 text-[11px] text-muted-foreground">{c.rationale.slice(0, 2).join(" · ")}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="capitalize">{c.cadence}</TableCell>
                            <TableCell className="text-right">{c.occurrences}</TableCell>
                            <TableCell className="text-right">{Math.round(c.confidence * 100)}%</TableCell>
                            <TableCell className="text-right">{c.amount_avg.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{Math.round(c.amount_range_pct * 100)}%</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{c.suggested_cron}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                disabled={!canAdmin || createRuleFromCandidateMutation.isPending}
                                onClick={() => {
                                  if (!canAdmin) return;
                                  const ok = window.confirm(`Create recurring rule: ${c.suggested_rule.name}?`);
                                  if (!ok) return;
                                  createRuleFromCandidateMutation.mutate(c);
                                }}
                              >
                                Create rule
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No candidates detected yet.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Forecast</CardTitle>
                <CardDescription>Simple cashflow projection using recent averages + active recurring rules.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  <div>
                    <Label>Months</Label>
                    <Input value={forecastMonths} onChange={(e) => setForecastMonths(e.target.value)} placeholder="3" />
                  </div>
                  <div className="sm:col-span-5 flex items-end justify-end">
                    <Button variant="outline" onClick={() => void forecastQuery.refetch()} disabled={!periodKeyValid || forecastQuery.isFetching}>
                      {forecastQuery.isFetching ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>
                </div>

                {!periodKeyValid ? null : forecastQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : forecastQuery.data ? (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Income avg</div>
                        <div className="text-sm font-semibold">
                          {forecastQuery.data.baseline.income_monthly_avg.toFixed(2)} {forecastQuery.data.currency}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Expense avg</div>
                        <div className="text-sm font-semibold">
                          {forecastQuery.data.baseline.expense_monthly_avg.toFixed(2)} {forecastQuery.data.currency}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Net avg</div>
                        <div className="text-sm font-semibold">
                          {forecastQuery.data.baseline.net_monthly_avg.toFixed(2)} {forecastQuery.data.currency}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Recurring expected</div>
                        <div className="text-sm font-semibold">
                          {forecastQuery.data.recurring_rules.expense_expected_monthly.toFixed(2)} {forecastQuery.data.currency}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period</TableHead>
                            <TableHead className="text-right">Income</TableHead>
                            <TableHead className="text-right">Expense</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {forecastQuery.data.projection.map((row) => (
                            <TableRow key={row.period_key}>
                              <TableCell className="font-medium">{row.period_key}</TableCell>
                              <TableCell className="text-right">{row.income.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.expense.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.net.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No forecast data yet.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recurring" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recurring rules</CardTitle>
              <CardDescription>Detect expected recurring charges and drive automations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canAdmin ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Only org admins can create or modify recurring rules.
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label>Name</Label>
                  <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Netflix subscription" disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Cron</Label>
                  <Input value={ruleCron} onChange={(e) => setRuleCron(e.target.value)} placeholder="0 9 1 * *" disabled={!canAdmin} />
                  <div className="mt-1 text-xs text-muted-foreground">Example: monthly on day 1 at 09:00 UTC</div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={ruleStatus} onValueChange={(v) => setRuleStatus(v as RecurringRuleStatus)} disabled={!canAdmin}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="disabled">disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-1">
                  <Label>Merchant name (optional)</Label>
                  <Input value={ruleMerchantName} onChange={(e) => setRuleMerchantName(e.target.value)} placeholder="Netflix" disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Category (optional)</Label>
                  <Input value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} placeholder="Entertainment" disabled={!canAdmin} />
                </div>
                <div>
                  <Label>Amount min (optional)</Label>
                  <Input value={ruleAmountMin} onChange={(e) => setRuleAmountMin(e.target.value)} placeholder="0" disabled={!canAdmin} />
                </div>
                <div>
                  <Label>Amount max (optional)</Label>
                  <Input value={ruleAmountMax} onChange={(e) => setRuleAmountMax(e.target.value)} placeholder="0" disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Next run (optional)</Label>
                  <Input type="datetime-local" value={ruleNextRunAt} onChange={(e) => setRuleNextRunAt(e.target.value)} disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-6 flex justify-end">
                  <Button onClick={handleCreateRule} disabled={!canAdmin || createRuleMutation.isPending || ruleName.trim().length < 2 || ruleCron.trim().length < 5}>
                    {createRuleMutation.isPending ? "Creating..." : "Create rule"}
                  </Button>
                </div>
              </div>

              {recurringQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : recurringQuery.data?.rules?.length ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cron</TableHead>
                        <TableHead>Merchant</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount range</TableHead>
                        <TableHead>Next run</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recurringQuery.data.rules.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="capitalize">{r.status}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.cron}</TableCell>
                          <TableCell>{r.merchant_name || "—"}</TableCell>
                          <TableCell>{r.category || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.amount_min ?? "—"}–{r.amount_max ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.next_run_at ? new Date(r.next_run_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canAdmin || toggleRuleMutation.isPending}
                              onClick={() =>
                                toggleRuleMutation.mutate({
                                  id: r.id,
                                  status: r.status === "active" ? "disabled" : "active",
                                })
                              }
                            >
                              {r.status === "active" ? "Disable" : "Enable"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No recurring rules yet.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

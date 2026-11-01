/**
 * @fileoverview Finance OS -- the internal "operating system" for money management.
 *
 * A tabbed admin panel exposing five subsystems:
 * 1. Accounts -- create/link bank accounts (checking, savings, credit, etc.)
 * 2. Merchants -- normalize merchant names with aliases and default categories
 * 3. Budgets -- envelope-style allocations per month (YYYY-MM)
 * 4. Insights -- budget envelopes (planned vs spent), recurring charge
 *    candidates detected from transaction history, and cashflow forecast
 * 5. Recurring -- cron-based recurring rules that drive automations
 *
 * Key data flows:
 * - Each tab has its own React Query hooks calling the /v1/finance/* API.
 * - Admin-only mutations are gated by canAdmin (org role check).
 * - Currency defaults come from useAppConfig().org.currency.
 *
 * Central to the Finance OS feature set; all data is org-scoped.
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * FinanceOS Page (Workspace Control Center)
 * ├── 1. Role & Config Setup
 * │   ├── useAuth() -> org role verification (canAdmin flag)
 * │   └── useAppConfig() -> org currency and localization
 * ├── 2. Tab Navigation
 * │   ├── Tab 1: Accounts (Checking, Savings, Credit, Investment balances)
 * │   ├── Tab 2: Merchants (Merchant aliases, canonical logos, auto-category)
 * │   ├── Tab 3: Budgets (Monthly envelope limits by category)
 * │   ├── Tab 4: Insights (Budget burn envelopes, cashflow forecasting)
 * │   └── Tab 5: Recurring (Subscription rules, automated cron schedules)
 * ├── 3. React Query Mutation Pipeline
 * │   ├── Account upsert / balance adjustment
 * │   ├── Envelope limit update with instant cache invalidation
 * │   └── Merchant alias rule creation
 * └── 4. UI Layer
 *     ├── Data tables with sorting and badges
 *     ├── Monthly Period selector (YYYY-MM)
 *     └── Modal dialogs for new entities
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |                     FinanceOS Page Loaded                     |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |          Verify Org Role (canAdmin) & Load Config             |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                     Select Operational Tab                    |
 *   |   [Accounts]   [Merchants]   [Budgets]   [Insights]   [Recurring]
 *   +-------------------------------+-------------------------------+
 *                                   |
 *            +----------------------+----------------------+
 *            |                      |                      |
 *            v                      v                      v
 *     [Fetch Accounts]       [Fetch Envelopes]      [Fetch Recurring]
 *     GET /v1/finance/..     GET /v1/finance/..     GET /v1/finance/..
 *            |                      |                      |
 *            v                      v                      v
 *     Render Account Cards   Render Envelope Bars   Render Schedule List
 *            |                      |                      |
 *            +----------------------+----------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   | User Mutates Entity -> Optimistic Update -> Refetch On Success|
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module pages/FinanceOS
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  TrendingDown,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Progress } from "@/components/ui/Progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useToast } from "@/hooks/useToast";
import { useAppConfig } from "@/hooks/useAppConfig";
import {
  createAccount,
  deleteBudgetAllocation,
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

const shiftPeriodKey = (period: string, delta: number) => {
  const parts = period.trim().split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!y || !m || Number.isNaN(y) || Number.isNaN(m)) return period;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const BUDGET_CATEGORY_PRESETS = [
  "Housing",
  "Groceries",
  "Food & Dining",
  "Transportation",
  "Utilities",
  "Healthcare",
  "Entertainment",
  "Shopping",
  "Personal Care",
  "Education",
  "Travel",
  "Investments",
];

const toIsoFromDatetimeLocal = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const asDate = new Date(trimmed);
  if (Number.isNaN(asDate.getTime())) return undefined;
  return asDate.toISOString();
};

type CashflowStatus = "healthy" | "watch" | "at_risk";
type AlertSeverity = "info" | "warning" | "critical";
type ActionPriority = "high" | "medium" | "low";

const formatMoney = (value: number | null | undefined, currency: string) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Unavailable";
  return `${Number(value).toFixed(2)} ${currency}`;
};

const statusTone: Record<CashflowStatus, string> = {
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  watch: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  at_risk: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

const severityTone: Record<AlertSeverity, string> = {
  info: "border-blue-500/25 bg-blue-500/10",
  warning: "border-amber-500/25 bg-amber-500/10",
  critical: "border-red-500/25 bg-red-500/10",
};

const priorityTone: Record<ActionPriority, "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

export default function FinanceOS() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const validTabs = ["accounts", "merchants", "budgets", "insights", "recurring"];
  const currentTab = validTabs.includes(requestedTab || "") ? requestedTab! : "accounts";

  const handleTabChange = (nextTab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextTab === "accounts") {
        next.delete("tab");
      } else {
        next.set("tab", nextTab);
      }
      return next;
    });
  };
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

  const deleteAllocationMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => deleteBudgetAllocation(budgetPeriodKey, id),
    onSuccess: async () => {
      toast({ title: "Allocation deleted" });
      await allocationsQuery.refetch();
      if (envelopesQuery?.refetch) {
        await envelopesQuery.refetch();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error?.message || "Couldn't delete budget allocation.",
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

  // Multi-Period Roll-Forward and Smart Auto-Budget State
  const [isRollForwardOpen, setIsRollForwardOpen] = useState(false);
  const [rollForwardMultiplier, setRollForwardMultiplier] = useState("1.0");
  const [selectedRollForwardCats, setSelectedRollForwardCats] = useState<string[]>([]);

  const [isSmartSuggestionsOpen, setIsSmartSuggestionsOpen] = useState(false);
  const [smartSuggestionBuffer, setSmartSuggestionBuffer] = useState<number>(10);
  const [selectedSmartCats, setSelectedSmartCats] = useState<string[]>([]);

  const prevPeriodKey = useMemo(() => shiftPeriodKey(budgetPeriodKey, -1), [budgetPeriodKey]);
  const prevAllocationsQuery = useQuery({
    queryKey: ["v1/finance/budgets", prevPeriodKey],
    queryFn: () => listBudgetAllocations(prevPeriodKey, { limit: 300 }),
    enabled: isRollForwardOpen && Boolean(prevPeriodKey),
  });

  useEffect(() => {
    if (prevAllocationsQuery.data?.allocations?.length) {
      setSelectedRollForwardCats(prevAllocationsQuery.data.allocations.map((a) => a.category));
    }
  }, [prevAllocationsQuery.data?.allocations]);

  const smartRecommendations = useMemo(() => {
    const list: Array<{ category: string; historicalMonthlyAvg: number; suggestedCap: number; isUnbudgeted: boolean }> = [];
    const existing = new Set((allocationsQuery.data?.allocations || []).map((a) => a.category.toLowerCase()));

    if (forecastQuery.data?.top_categories?.length) {
      for (const cat of forecastQuery.data.top_categories) {
        const avg = Number(cat.expense_monthly_avg || 0);
        if (avg > 0) {
          list.push({
            category: cat.category,
            historicalMonthlyAvg: avg,
            suggestedCap: Math.round(avg * (1 + smartSuggestionBuffer / 100)),
            isUnbudgeted: !existing.has(cat.category.toLowerCase()),
          });
        }
      }
    } else if (envelopesQuery.data?.envelopes?.length) {
      for (const env of envelopesQuery.data.envelopes) {
        const spent = Number(env.spent || 0);
        if (spent > 0) {
          list.push({
            category: env.category,
            historicalMonthlyAvg: spent,
            suggestedCap: Math.round(spent * (1 + smartSuggestionBuffer / 100)),
            isUnbudgeted: !existing.has(env.category.toLowerCase()) || env.unbudgeted,
          });
        }
      }
    }

    if (list.length === 0) {
      const defaultCaps: Record<string, number> = {
        Housing: 1500,
        Groceries: 500,
        "Food & Dining": 350,
        Transportation: 250,
        Utilities: 200,
        Entertainment: 150,
        Healthcare: 150,
        Investments: 400,
      };
      for (const [cat, baseAmount] of Object.entries(defaultCaps)) {
        list.push({
          category: cat,
          historicalMonthlyAvg: baseAmount,
          suggestedCap: Math.round(baseAmount * (1 + smartSuggestionBuffer / 100)),
          isUnbudgeted: !existing.has(cat.toLowerCase()),
        });
      }
    }

    return list;
  }, [forecastQuery.data, envelopesQuery.data, allocationsQuery.data, smartSuggestionBuffer]);

  useEffect(() => {
    if (isSmartSuggestionsOpen && smartRecommendations.length > 0) {
      setSelectedSmartCats(smartRecommendations.map((r) => r.category));
    }
  }, [isSmartSuggestionsOpen, smartRecommendations]);

  const handleExecuteRollForward = async () => {
    const allocationsToCopy = (prevAllocationsQuery.data?.allocations || []).filter((a) =>
      selectedRollForwardCats.includes(a.category)
    );
    if (allocationsToCopy.length === 0) return;

    const mult = Number(rollForwardMultiplier) || 1.0;
    try {
      await Promise.all(
        allocationsToCopy.map((alloc) =>
          upsertBudgetAllocation(budgetPeriodKey, {
            category: alloc.category,
            amount: Math.round(Number(alloc.amount) * mult),
            currency: alloc.currency || budgetCurrency || orgCurrency,
          })
        )
      );
      toast({
        title: "Budgets Rolled Forward",
        description: `Successfully copied ${allocationsToCopy.length} category budgets from ${prevPeriodKey} to ${budgetPeriodKey}.`,
      });
      setIsRollForwardOpen(false);
      await Promise.allSettled([allocationsQuery.refetch(), envelopesQuery.refetch()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to roll forward budgets.";
      toast({ title: "Roll Forward Failed", description: msg, variant: "destructive" });
    }
  };

  const handleApplySmartSuggestions = async () => {
    const recsToApply = smartRecommendations.filter((r) => selectedSmartCats.includes(r.category));
    if (recsToApply.length === 0) return;

    try {
      await Promise.all(
        recsToApply.map((r) =>
          upsertBudgetAllocation(budgetPeriodKey, {
            category: r.category,
            amount: r.suggestedCap,
            currency: budgetCurrency || orgCurrency,
          })
        )
      );
      toast({
        title: "Recommended Caps Applied",
        description: `Set spending caps for ${recsToApply.length} categories in ${budgetPeriodKey}.`,
      });
      setIsSmartSuggestionsOpen(false);
      await Promise.allSettled([allocationsQuery.refetch(), envelopesQuery.refetch()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to apply recommended budget caps.";
      toast({ title: "Apply Failed", description: msg, variant: "destructive" });
    }
  };

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
        <h1 className="text-2xl font-semibold text-foreground">Finance</h1>
        <p className="text-sm text-muted-foreground">Manage your accounts, budgets, and recurring payments.</p>
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange}>
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
                  <Label htmlFor="field-newAccountName">Name</Label>
                  <Input id="field-newAccountName" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="Main checking" disabled={!canAdmin} />
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
                  <Label htmlFor="field-newAccountCurrency">Currency</Label>
                  <Input id="field-newAccountCurrency" value={newAccountCurrency} onChange={(e) => setNewAccountCurrency(e.target.value)} placeholder="USD" disabled={!canAdmin} />
                </div>
                <div>
                  <Label htmlFor="field-newAccountMask">Mask (optional)</Label>
                  <Input id="field-newAccountMask" value={newAccountMask} onChange={(e) => setNewAccountMask(e.target.value)} placeholder="1234" disabled={!canAdmin} />
                </div>
                <div className="sm:col-span-3">
                  <Label htmlFor="field-newAccountInstitution">Institution (optional)</Label>
                  <Input id="field-newAccountInstitution" value={newAccountInstitution} onChange={(e) => setNewAccountInstitution(e.target.value)} placeholder="Bank name" disabled={!canAdmin} />
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

              {/* Quick Actions Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-border/70 bg-muted/20">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-medium text-xs">
                    {allocationsQuery.data?.allocations?.length || 0} Categories
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Target: <strong className="text-foreground">{budgetPeriodKey}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => { if (prevAllocationsQuery.data?.allocations?.length) { setSelectedRollForwardCats(prevAllocationsQuery.data.allocations.map((a) => a.category)); } setIsRollForwardOpen(true); }}
                    data-testid="roll-forward-budget-btn"
                    disabled={!canAdmin}
                  >
                    <Copy className="w-3.5 h-3.5 text-primary" />
                    Roll Forward from {prevPeriodKey}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => { setSelectedSmartCats(smartRecommendations.map((r) => r.category)); setIsSmartSuggestionsOpen(true); }}
                    data-testid="auto-budget-suggest-btn"
                    disabled={!canAdmin}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Smart Recommendations
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label htmlFor="finance-budgetPeriodKey">Period key</Label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-2 shrink-0"
                      onClick={() => setBudgetPeriodKey(shiftPeriodKey(budgetPeriodKey, -1))}
                      data-testid="btn-prev-budget-period"
                      title="Previous month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Input
                      id="finance-budgetPeriodKey"
                      value={budgetPeriodKey}
                      onChange={(e) => setBudgetPeriodKey(e.target.value)}
                      placeholder="2026-02"
                      className="text-center font-medium"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-2 shrink-0"
                      onClick={() => setBudgetPeriodKey(shiftPeriodKey(budgetPeriodKey, 1))}
                      data-testid="btn-next-budget-period"
                      title="Next month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Format: YYYY-MM</div>
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="finance-budgetCategory">Category</Label>
                  <Input
                    id="finance-budgetCategory"
                    value={budgetCategory}
                    onChange={(e) => setBudgetCategory(e.target.value)}
                    placeholder="Rent"
                    disabled={!canAdmin}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5" data-testid="budget-category-presets">
                    <span className="text-[11px] text-muted-foreground mr-1 self-center">Presets:</span>
                    {BUDGET_CATEGORY_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBudgetCategory(preset)}
                        disabled={!canAdmin}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                          budgetCategory.toLowerCase() === preset.toLowerCase()
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="finance-budgetAmount">Amount</Label>
                  <Input
                    id="finance-budgetAmount"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="1200"
                    disabled={!canAdmin}
                  />
                </div>

                <div>
                  <Label htmlFor="finance-budgetCurrency">Currency</Label>
                  <Input
                    id="finance-budgetCurrency"
                    value={budgetCurrency}
                    onChange={(e) => setBudgetCurrency(e.target.value)}
                    placeholder={orgCurrency}
                    disabled={!canAdmin}
                  />
                </div>

                <div className="sm:col-span-6 flex justify-end gap-2">
                  {(budgetCategory || budgetAmount) && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setBudgetCategory("");
                        setBudgetAmount("");
                      }}
                      disabled={!canAdmin}
                    >
                      Clear
                    </Button>
                  )}
                  <Button onClick={handleUpsertBudget} disabled={!canAdmin || upsertBudgetMutation.isPending || budgetCategory.trim().length < 1}>
                    {upsertBudgetMutation.isPending ? "Saving..." : "Upsert allocation"}
                  </Button>
                </div>
              </div>

              {/* Budget Totals and Spend Adherence */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-lg border border-border/60 bg-muted/10">
                <div className="text-sm text-muted-foreground">
                  Total budgeted: {totalBudgeted.toFixed(2)} {budgetCurrency || orgCurrency}
                </div>
                {envelopesQuery.data?.totals && (
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Spent to date:</span>{" "}
                      <strong className="text-foreground">
                        {Number(envelopesQuery.data.totals.spent || 0).toFixed(2)} {budgetCurrency || orgCurrency}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Remaining:</span>{" "}
                      <strong className={Number(envelopesQuery.data.totals.remaining || 0) < 0 ? "text-destructive font-bold" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                        {Number(envelopesQuery.data.totals.remaining || 0).toFixed(2)} {budgetCurrency || orgCurrency}
                      </strong>
                    </div>
                  </div>
                )}
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
                        <TableHead className="text-right">Spent to Date</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="w-36">Burn %</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="w-16 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocationsQuery.data.allocations.map((row) => {
                        const env = envelopesQuery.data?.envelopes?.find(
                          (e) => e.category.toLowerCase() === row.category.toLowerCase()
                        );
                        const planned = Number(row.amount || 0);
                        const spent = env ? Number(env.spent || 0) : 0;
                        const remaining = env ? Number(env.remaining || 0) : planned;
                        const burnPct = planned > 0 ? Math.round((spent / planned) * 100) : 0;

                        return (
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
                            <TableCell className="text-right">{planned.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{spent.toFixed(2)}</TableCell>
                            <TableCell className={`text-right font-medium ${remaining < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {remaining < 0 ? `-${Math.abs(remaining).toFixed(2)} over` : `${remaining.toFixed(2)} left`}
                            </TableCell>
                            <TableCell className="w-36" onClick={(e) => e.stopPropagation()}>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className={burnPct > 100 ? "text-destructive font-bold" : "text-muted-foreground"}>
                                    {burnPct}%
                                  </span>
                                  {burnPct > 100 ? (
                                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 leading-none">OVER</Badge>
                                  ) : burnPct >= 80 ? (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 leading-none bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">WATCH</Badge>
                                  ) : null}
                                </div>
                                <Progress
                                  value={Math.min(burnPct, 100)}
                                  className="h-1.5"
                                />
                              </div>
                            </TableCell>
                            <TableCell>{row.currency}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                disabled={!canAdmin || deleteAllocationMutation.isPending}
                                onClick={() => deleteAllocationMutation.mutate({ id: row.id })}
                                title={`Delete ${row.category} allocation`}
                                aria-label={`Delete ${row.category} allocation`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                <CardTitle className="text-lg">Cashflow health</CardTitle>
                <CardDescription>Runway, budget pressure, and recommended next moves for the selected period.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!periodKeyValid ? (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Enter a valid period key (YYYY-MM) to view cashflow health.
                  </div>
                ) : forecastQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : forecastQuery.data?.cashflow_health ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                      <div className={`rounded-md border p-4 ${statusTone[forecastQuery.data.cashflow_health.status]}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide opacity-80">Health score</div>
                            <div className="mt-2 flex items-baseline gap-2">
                              <span className="text-4xl font-semibold leading-none">{forecastQuery.data.cashflow_health.score}</span>
                              <span className="text-sm font-medium capitalize">
                                {forecastQuery.data.cashflow_health.status.replace("_", " ")}
                              </span>
                            </div>
                          </div>
                          {forecastQuery.data.cashflow_health.status === "healthy" ? (
                            <CheckCircle2 className="h-6 w-6" />
                          ) : forecastQuery.data.cashflow_health.status === "watch" ? (
                            <AlertTriangle className="h-6 w-6" />
                          ) : (
                            <ShieldAlert className="h-6 w-6" />
                          )}
                        </div>
                        <Progress value={forecastQuery.data.cashflow_health.score} className="mt-4 h-2 bg-background/70" />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline" className="bg-background/70">
                            {forecastQuery.data.cashflow_health.confidence} confidence
                          </Badge>
                          <Badge variant="outline" className="bg-background/70">
                            {forecastQuery.data.baseline.transaction_count} transactions
                          </Badge>
                          <Badge variant="outline" className="bg-background/70">
                            {Math.round(forecastQuery.data.budget_pressure.days_elapsed_ratio * 100)}% period elapsed
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-md border border-border bg-background/60 p-3">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <WalletCards className="h-4 w-4" />
                            Liquidity
                          </div>
                          <div className="mt-2 text-sm font-semibold">
                            {formatMoney(forecastQuery.data.cashflow_health.liquidity_balance, forecastQuery.data.currency)}
                          </div>
                        </div>
                        <div className="rounded-md border border-border bg-background/60 p-3">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <TrendingDown className="h-4 w-4" />
                            Runway
                          </div>
                          <div className="mt-2 text-sm font-semibold">
                            {forecastQuery.data.cashflow_health.runway_months === null
                              ? "Not burning cash"
                              : `${forecastQuery.data.cashflow_health.runway_months.toFixed(1)} months`}
                          </div>
                        </div>
                        <div className="rounded-md border border-border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">Savings rate</div>
                          <div className="mt-2 text-sm font-semibold">
                            {forecastQuery.data.cashflow_health.savings_rate_pct.toFixed(1)}%
                          </div>
                        </div>
                        <div className="rounded-md border border-border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">Projected ending cash</div>
                          <div className="mt-2 text-sm font-semibold">
                            {formatMoney(forecastQuery.data.cashflow_health.projected_end_balance, forecastQuery.data.currency)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-foreground">Risk alerts</div>
                        {forecastQuery.data.risk_alerts.map((alert) => (
                          <div key={alert.id} className={`rounded-md border p-3 ${severityTone[alert.severity]}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold">{alert.title}</div>
                              <Badge variant={alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "secondary" : "outline"}>
                                {alert.severity}
                              </Badge>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">{alert.detail}</div>
                            <div className="mt-2 text-xs font-medium text-foreground">{alert.recommended_action}</div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium text-foreground">Action plan</div>
                        {forecastQuery.data.recommended_actions.length ? (
                          forecastQuery.data.recommended_actions.map((action) => (
                            <div key={action.id} className="rounded-md border border-border bg-background/60 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold">{action.title}</div>
                                <Badge variant={priorityTone[action.priority]}>{action.priority}</Badge>
                              </div>
                              <div className="mt-1 text-xs leading-5 text-muted-foreground">{action.detail}</div>
                              {action.impact_estimate !== null ? (
                                <div className="mt-2 text-xs font-medium text-foreground">
                                  Impact: {formatMoney(action.impact_estimate, forecastQuery.data.currency)}
                                </div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                            No actions generated for this period.
                          </div>
                        )}
                      </div>
                    </div>

                    {forecastQuery.data.budget_pressure.categories.length ? (
                      <div className="overflow-x-auto rounded-md border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Budget pressure</TableHead>
                              <TableHead className="text-right">Projected</TableHead>
                              <TableHead className="text-right">Over by</TableHead>
                              <TableHead className="text-right">Burn</TableHead>
                              <TableHead>Severity</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {forecastQuery.data.budget_pressure.categories.map((row) => (
                              <TableRow key={`${row.category}:${row.severity}`}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <span>{row.category}</span>
                                    {row.unbudgeted ? <Badge variant="secondary">Unbudgeted</Badge> : null}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{row.projected_spend.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{row.projected_over_by.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{row.burn_rate_pct}%</TableCell>
                                <TableCell className="capitalize">{row.severity.replace("_", " ")}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}

                    {forecastQuery.data.cashflow_health.data_quality.length ? (
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <div className="text-xs font-medium text-muted-foreground">Data notes</div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          {forecastQuery.data.cashflow_health.data_quality.map((note) => (
                            <div key={note}>{note}</div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No forecast data yet.</div>
                )}
              </CardContent>
            </Card>

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
                ) : forecastQuery.data?.cashflow_health ? (
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
                            <TableHead className="text-right">Cumulative net</TableHead>
                            <TableHead className="text-right">Cash balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {forecastQuery.data.projection.map((row) => (
                            <TableRow key={row.period_key}>
                              <TableCell className="font-medium">{row.period_key}</TableCell>
                              <TableCell className="text-right">{row.income.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.expense.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.net.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{row.cumulative_net.toFixed(2)}</TableCell>
                              <TableCell className="text-right">
                                {formatMoney(row.projected_cash_balance, forecastQuery.data.currency)}
                              </TableCell>
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
      {/* Roll Forward Dialog */}
      <Dialog open={isRollForwardOpen} onOpenChange={setIsRollForwardOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-roll-forward-budgets">
          <DialogHeader>
            <DialogTitle>Roll Forward Budgets</DialogTitle>
            <DialogDescription>
              Copy budget allocations from previous period ({prevPeriodKey}) into {budgetPeriodKey}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Adjustment Multiplier</Label>
              <div className="flex gap-2">
                {[
                  { label: "100% (Exact Copy)", val: "1.0" },
                  { label: "+5% (Inflation Buffer)", val: "1.05" },
                  { label: "-5% (Frugal / Lean)", val: "0.95" },
                ].map((preset) => (
                  <Button
                    key={preset.val}
                    type="button"
                    size="sm"
                    variant={rollForwardMultiplier === preset.val ? "default" : "outline"}
                    className="text-xs flex-1 h-8"
                    onClick={() => setRollForwardMultiplier(preset.val)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {prevAllocationsQuery.isLoading ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Loading previous allocations…</div>
            ) : prevAllocationsQuery.data?.allocations?.length ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Select categories to copy:</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedRollForwardCats.length === prevAllocationsQuery.data!.allocations.length) {
                        setSelectedRollForwardCats([]);
                      } else {
                        setSelectedRollForwardCats(prevAllocationsQuery.data!.allocations.map((a) => a.category));
                      }
                    }}
                    className="text-primary hover:underline"
                  >
                    {selectedRollForwardCats.length === prevAllocationsQuery.data!.allocations.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 border rounded-md p-2">
                  {prevAllocationsQuery.data.allocations.map((alloc) => {
                    const isChecked = selectedRollForwardCats.includes(alloc.category);
                    const mult = Number(rollForwardMultiplier) || 1.0;
                    const adjusted = Math.round(Number(alloc.amount) * mult);

                    return (
                      <div
                        key={alloc.id}
                        className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30 cursor-pointer text-xs"
                        onClick={() => {
                          if (isChecked) {
                            setSelectedRollForwardCats(selectedRollForwardCats.filter((c) => c !== alloc.category));
                          } else {
                            setSelectedRollForwardCats([...selectedRollForwardCats, alloc.category]);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-foreground">{alloc.category}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>{alloc.amount.toFixed(2)}</span>
                          <ArrowRight className="w-3 h-3" />
                          <strong className="text-foreground">{adjusted.toFixed(2)} {alloc.currency}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground p-3 border rounded-md bg-muted/20 text-center">
                No allocations found in previous period ({prevPeriodKey}).
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsRollForwardOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExecuteRollForward}
              disabled={selectedRollForwardCats.length === 0}
              data-testid="confirm-roll-forward-btn"
            >
              Copy {selectedRollForwardCats.length} Allocations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Smart Recommendations Dialog */}
      <Dialog open={isSmartSuggestionsOpen} onOpenChange={setIsSmartSuggestionsOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-smart-budget-suggestions">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Smart Budget Recommendations
            </DialogTitle>
            <DialogDescription>
              AI & history-based spending caps calculated from actual expenditure patterns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Safety Buffer</Label>
              <div className="flex gap-2">
                {[
                  { label: "+5% Buffer", val: 5 },
                  { label: "+10% (Recommended)", val: 10 },
                  { label: "+15% Buffer", val: 15 },
                ].map((buf) => (
                  <Button
                    key={buf.val}
                    type="button"
                    size="sm"
                    variant={smartSuggestionBuffer === buf.val ? "default" : "outline"}
                    className="text-xs flex-1 h-8"
                    onClick={() => setSmartSuggestionBuffer(buf.val)}
                  >
                    {buf.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Suggested spending limits for {budgetPeriodKey}:</span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedSmartCats.length === smartRecommendations.length) {
                      setSelectedSmartCats([]);
                    } else {
                      setSelectedSmartCats(smartRecommendations.map((r) => r.category));
                    }
                  }}
                  className="text-primary hover:underline"
                >
                  {selectedSmartCats.length === smartRecommendations.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 border rounded-md p-2">
                {smartRecommendations.map((rec) => {
                  const isChecked = selectedSmartCats.includes(rec.category);

                  return (
                    <div
                      key={rec.category}
                      className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30 cursor-pointer text-xs"
                      onClick={() => {
                        if (isChecked) {
                          setSelectedSmartCats(selectedSmartCats.filter((c) => c !== rec.category));
                        } else {
                          setSelectedSmartCats([...selectedSmartCats, rec.category]);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="font-medium text-foreground">{rec.category}</span>
                        {rec.isUnbudgeted && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400">
                            New
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Avg: {rec.historicalMonthlyAvg.toFixed(2)}</span>
                        <ArrowRight className="w-3 h-3" />
                        <strong className="text-foreground">{rec.suggestedCap.toFixed(2)} {orgCurrency}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsSmartSuggestionsOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApplySmartSuggestions}
              disabled={selectedSmartCats.length === 0}
              data-testid="confirm-apply-smart-suggestions-btn"
            >
              Apply {selectedSmartCats.length} Recommended Caps
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

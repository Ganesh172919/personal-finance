/**
 * @fileoverview Transactions Page (Transactions)
 *
 * The primary transaction management interface. Supports:
 * - Viewing paginated transaction list with filters
 * - Creating/editing/deleting transactions via inline form
 * - CSV import with column mapping, preview, and duplicate detection
 * - Receipt OCR scanning (via ReceiptOcrDialog)
 * - Review queue filtering (uncategorized, duplicates, merchant matches)
 *
 * CSV IMPORT FLOW:
 * 1. User uploads CSV file → PapaParse parses headers and rows
 * 2. User maps CSV columns to transaction fields (amount, date, etc.)
 * 3. "Preview" → server validates rows and detects duplicates (dry_run=true)
 * 4. "Commit" → server imports valid rows and returns results
 *
 * STATE MANAGEMENT:
 * - React Query for server state (transactions, accounts)
 * - Local useState for form state, filters, and CSV import wizard
 * - Mutations with onSuccess/onError for create/update/delete/import
 *
 * REVIEW SYSTEM:
 * Transactions can have review flags (uncategorized, duplicate, etc.).
 * The review filter allows users to focus on items needing attention.
 *
 * @module pages/Transactions
 */

import { motion } from "framer-motion";
import Papa from "papaparse";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ReceiptText, ScanLine, Upload, Split, Repeat, Trash2, ChevronDown, ChevronUp } from "lucide-react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { InlineLoader } from "@/components/feedback/InlineLoader";
import { PageIntro } from "@/components/layout/PageIntro";
import TransactionReviewQueue from "@/components/TransactionReviewQueue";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ReceiptOcrDialog } from "@/components/ReceiptOcrDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { useToast } from "@/hooks/useToast";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { useVirtualList } from "@/hooks/useVirtualList";
import {
  ApiError,
  bulkCategorizeTransactions,
  bulkDeleteTransactions,
  createRecurringRule,
  createTransaction,
  deleteTransaction,
  getTransactions,
  importTransactionsCsv,
  listAccounts,
  TransactionType,
  updateTransaction,
} from "@/lib/apiClient";
import { ITransaction } from "@/types";

/** Transaction form state (amount is string for input control) */
type TransactionForm = {
  amount: string;
  category: string;
  description: string;
  date: string;
  type: TransactionType;
};

type CsvState = {
  file: File | null;
  fileName: string;
  columns: string[];
  rawRows: Array<Record<string, string>>;
  accountId: string;
  mapping: {
    amount: string;
    category: string;
    description: string;
    date: string;
    type: string;
    merchant: string;
  };
};

type ReviewFilter =
  | "all"
  | "needs_attention"
  | "uncategorized"
  | "suspected_duplicate"
  | "needs_merchant_match"
  | "split_candidate"
  | "recurring_candidate";

const EMPTY_FORM: TransactionForm = {
  amount: "",
  category: "",
  description: "",
  date: "",
  type: "expense",
};

const EMPTY_CSV: CsvState = {
  file: null,
  fileName: "",
  columns: [],
  rawRows: [],
  accountId: "",
  mapping: { amount: "", category: "", description: "", date: "", type: "", merchant: "" },
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

const reviewFlagLabel: Record<Exclude<ReviewFilter, "all" | "needs_attention">, string> = {
  uncategorized: "Uncategorized",
  suspected_duplicate: "Suspected duplicate",
  needs_merchant_match: "Needs merchant match",
  split_candidate: "Split candidate",
  recurring_candidate: "Recurring candidate",
};

const COMMON_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Housing & Rent",
  "Utilities",
  "Transportation",
  "Shopping",
  "Healthcare",
  "Entertainment",
  "Personal Care",
  "Education",
  "Investments",
  "Income",
];

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

export default function Transactions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatMoney, formatDate, currency } = useOrgFormatters();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");

  const accountsQuery = useQuery({
    queryKey: ["v1/finance/accounts"],
    queryFn: listAccounts,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["/api/transactions", page, limit, typeFilter, categoryFilter, fromFilter, toFilter],
    queryFn: () =>
      getTransactions({
        page,
        limit,
        type: typeFilter === "all" ? undefined : typeFilter,
        category: categoryFilter.trim() || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
      }),
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionForm>(EMPTY_FORM);

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setForm(EMPTY_FORM);
      setIsFormOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Create failed",
        description: formatError(error, "Failed to create transaction."),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TransactionForm> & { splits?: Array<{ category: string; amount: number }> } }) =>
      updateTransaction(id, {
        ...payload,
        amount: payload.amount ? Number(payload.amount) : undefined,
        splits: payload.splits,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setForm(EMPTY_FORM);
      setEditingId(null);
      setIsFormOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: formatError(error, "Failed to update transaction."),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: formatError(error, "Failed to delete transaction."),
        variant: "destructive",
      });
    },
  });

  // Split transaction state
  const [splitTargetTransaction, setSplitTargetTransaction] = useState<ITransaction | null>(null);
  const [splitRows, setSplitRows] = useState<Array<{ id: string; category: string; amount: string }>>([]);
  const [expandedSplitIds, setExpandedSplitIds] = useState<Set<string>>(new Set());

  // Recurring rule state
  const [recurringTargetTransaction, setRecurringTargetTransaction] = useState<ITransaction | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [ruleAmount, setRuleAmount] = useState("");
  const [ruleFrequency, setRuleFrequency] = useState<"monthly" | "biweekly" | "weekly" | "quarterly" | "annual">("monthly");

  const openSplitDialog = (tx: ITransaction) => {
    setSplitTargetTransaction(tx);
    const total = Math.abs(tx.amount);
    if (tx.splits && tx.splits.length >= 2) {
      setSplitRows(
        tx.splits.map((s, idx) => ({
          id: `split-${idx}-${Date.now()}`,
          category: s.category,
          amount: String(s.amount),
        }))
      );
    } else {
      const half = (total / 2).toFixed(2);
      const remainingHalf = (total - Number(half)).toFixed(2);
      setSplitRows([
        { id: `split-1-${Date.now()}`, category: tx.category || "", amount: half },
        { id: `split-2-${Date.now()}`, category: "", amount: remainingHalf },
      ]);
    }
  };

  const addSplitRow = () => {
    const total = Math.abs(splitTargetTransaction?.amount || 0);
    const allocated = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const remainder = Math.max(0, Number((total - allocated).toFixed(2)));
    setSplitRows((prev) => [
      ...prev,
      {
        id: `split-${prev.length + 1}-${Date.now()}`,
        category: "",
        amount: remainder > 0 ? String(remainder) : "",
      },
    ]);
  };

  const removeSplitRow = (id: string) => {
    if (splitRows.length <= 2) return;
    setSplitRows((prev) => prev.filter((r) => r.id !== id));
  };

  const autoFillRemainder = (index: number) => {
    const total = Math.abs(splitTargetTransaction?.amount || 0);
    const otherAllocated = splitRows.reduce((sum, r, idx) => (idx === index ? sum : sum + (Number(r.amount) || 0)), 0);
    const remainder = Math.max(0, Number((total - otherAllocated).toFixed(2)));
    setSplitRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], amount: String(remainder) };
      return next;
    });
  };

  const toggleSplitExpand = (id: string) => {
    setExpandedSplitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveSplits = () => {
    if (!splitTargetTransaction) return;
    const txId = splitTargetTransaction.id || splitTargetTransaction._id;
    if (!txId) return;

    const payloadSplits = splitRows.map((r) => ({
      category: r.category.trim(),
      amount: Number(r.amount),
    }));

    updateMutation.mutate({
      id: txId,
      payload: {
        splits: payloadSplits,
      } as any,
    });
    toast({
      title: "Transaction Split Saved",
      description: `Split across ${payloadSplits.length} categories successfully.`,
    });
    setSplitTargetTransaction(null);
  };

  const handleClearSplits = (tx: ITransaction) => {
    const txId = tx.id || tx._id;
    if (!txId) return;
    updateMutation.mutate({
      id: txId,
      payload: {
        splits: [],
      } as any,
    });
    toast({
      title: "Splits Cleared",
      description: "Restored to single unified category.",
    });
  };

  const openRecurringRuleDialog = (tx: ITransaction) => {
    setRecurringTargetTransaction(tx);
    setRuleName(tx.description || "Recurring Transaction");
    setRuleCategory(tx.category || "Uncategorized");
    setRuleAmount(String(Math.abs(tx.amount)));
    setRuleFrequency("monthly");
  };

  const createRecurringRuleMutation = useMutation({
    mutationFn: (body: any) => createRecurringRule(body),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["v1/finance/recurring"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/v1/finance/recurring"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/finance/recurring/candidates"] });
      toast({
        title: "Recurring Rule Created",
        description: `"${res.rule.name || ruleName}" will be tracked automatically.`,
      });
      setRecurringTargetTransaction(null);
    },
    onError: (error) => {
      toast({
        title: "Rule Creation Failed",
        description: formatError(error, "Failed to create recurring rule."),
        variant: "destructive",
      });
    },
  });

  const handleSubmitRecurringRule = () => {
    if (!recurringTargetTransaction) return;
    const numericAmount = Number(ruleAmount);
    const cronMap: Record<string, string> = {
      monthly: "0 0 1 * *",
      biweekly: "0 0 1,15 * *",
      weekly: "0 0 * * 1",
      quarterly: "0 0 1 1,4,7,10 *",
      annual: "0 0 1 1 *",
    };

    createRecurringRuleMutation.mutate({
      name: ruleName.trim(),
      category: ruleCategory.trim() || undefined,
      cron: cronMap[ruleFrequency] || "0 0 1 * *",
      amount_min: Number.isFinite(numericAmount) ? numericAmount : undefined,
      amount_max: Number.isFinite(numericAmount) ? numericAmount : undefined,
      status: "active",
    });
  };

  const splitTargetTotal = Math.abs(splitTargetTransaction?.amount || 0);
  const splitAllocatedSum = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const splitRemaining = Number((splitTargetTotal - splitAllocatedSum).toFixed(2));
  const isSplitBalanced = Math.abs(splitRemaining) < 0.01;
  const isSplitValid =
    splitRows.length >= 2 &&
    isSplitBalanced &&
    splitRows.every((r) => r.category.trim() && (Number(r.amount) || 0) > 0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchCategory, setBatchCategory] = useState<string>("");
  const [customCategory, setCustomCategory] = useState<string>("");

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteTransactions(ids),
    onSuccess: async (result) => {
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
      toast({
        title: "Deleted",
        description: `Successfully deleted ${result.deleted_count} transaction${result.deleted_count !== 1 ? "s" : ""}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: formatError(error, "Failed to bulk delete transactions."),
        variant: "destructive",
      });
    },
  });

  const bulkCategorizeMutation = useMutation({
    mutationFn: (payload: { transactionIds: string[]; category: string }) =>
      bulkCategorizeTransactions(payload.transactionIds, payload.category),
    onSuccess: async (result) => {
      setSelectedIds(new Set());
      setBatchCategory("");
      setCustomCategory("");
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
      toast({
        title: "Categorized",
        description: `Categorized ${result.modified_count} transaction${result.modified_count !== 1 ? "s" : ""} as ${result.category}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Categorize failed",
        description: formatError(error, "Failed to bulk categorize transactions."),
        variant: "destructive",
      });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected transaction${selectedIds.size !== 1 ? "s" : ""}?`)) return;
    await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
  };

  const handleBatchCategorize = async () => {
    if (selectedIds.size === 0) return;
    const cat = batchCategory === "__custom__" ? customCategory.trim() : batchCategory.trim();
    if (!cat) return;
    await bulkCategorizeMutation.mutateAsync({
      transactionIds: Array.from(selectedIds),
      category: cat,
    });
  };

  const transactions = useMemo(() => {
    const allTransactions = (data?.transactions || []) as ITransaction[];
    return [...allTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data?.transactions]);

  const visibleTransactions = useMemo(() => {
    if (reviewFilter === "all") return transactions;
    if (reviewFilter === "needs_attention") {
      return transactions.filter((transaction) => Boolean(transaction.review?.needs_attention));
    }
    return transactions.filter((transaction) => transaction.review?.flags?.includes(reviewFilter));
  }, [reviewFilter, transactions]);

  const allVisibleSelected = useMemo(() => {
    if (visibleTransactions.length === 0) return false;
    return visibleTransactions.every((tx) => {
      const id = tx.id || tx._id;
      return id ? selectedIds.has(id) : false;
    });
  }, [visibleTransactions, selectedIds]);

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      visibleTransactions.forEach((tx) => {
        const id = tx.id || tx._id;
        if (id) next.add(id);
      });
      setSelectedIds(next);
    }
  };

  const visibleIncome = visibleTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const visibleOutflow = visibleTransactions
    .filter((transaction) => transaction.type !== "income")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const activeFiltersCount = [
    typeFilter !== "all",
    Boolean(categoryFilter),
    Boolean(fromFilter),
    Boolean(toFilter),
    reviewFilter !== "all",
  ].filter(Boolean).length;

  const formatAmount = (amount: number, type: TransactionType) => {
    const prefix = type === "income" ? "+" : "-";
    return `${prefix}${formatMoney(Math.abs(amount))}`;
  };

  const isLargeBatch = visibleTransactions.length > 30;
  const { visibleItems, totalHeight, containerRef } = useVirtualList<ITransaction>({
    items: visibleTransactions,
    itemHeight: 96,
    overscan: 4,
    containerHeight: 600,
  });

  const renderTransactionCard = (
    transaction: ITransaction,
    index: number,
    isVirtual = false,
    offsetTop = 0
  ) => {
    const id = transaction.id || transaction._id;
    const isSelected = Boolean(id && selectedIds.has(id));

    const body = (
      <div
        className={`flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-lg border transition-colors ${
          isSelected
            ? "border-primary/50 bg-primary/10 shadow-sm"
            : "border-border/40 bg-accent/50 hover:bg-accent/70"
        }`}
        data-testid={`transaction-row-${id || index}`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => id && toggleSelect(id)}
            aria-label={`Select transaction ${transaction.description}`}
            className="mt-1 sm:mt-0 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
          />
          <div>
            <p className="font-medium text-foreground">{transaction.description}</p>
            <p className="text-xs text-muted-foreground">
              {transaction.category} - {formatDate(transaction.date)}
              {transaction.source?.origin ? ` • ${transaction.source.origin.replace("_", " ")}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {transaction.splits && transaction.splits.length > 0 && (
                <button
                  type="button"
                  onClick={() => id && toggleSplitExpand(id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition-colors cursor-pointer"
                  data-testid="badge-split-transaction"
                  title="Click to view category split breakdown"
                >
                  <Split className="h-3 w-3" />
                  Split ({transaction.splits.length})
                  {expandedSplitIds.has(id || "") ? (
                    <ChevronUp className="h-3 w-3 ml-0.5" />
                  ) : (
                    <ChevronDown className="h-3 w-3 ml-0.5" />
                  )}
                </button>
              )}
              {transaction.review?.flags?.map((flag) => (
                <Badge key={flag} variant="outline">
                  {reviewFlagLabel[flag]}
                </Badge>
              ))}
              {transaction.reconciliation?.status && transaction.reconciliation.status !== "unreconciled" ? (
                <Badge variant="outline">Reconciliation: {transaction.reconciliation.status}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-right min-w-[120px]">
            <p
              className={`font-semibold ${
                transaction.type === "income"
                  ? "text-green-600 dark:text-green-400"
                  : "text-foreground"
              }`}
            >
              {formatAmount(transaction.amount, transaction.type)}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{transaction.type}</p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => openSplitDialog(transaction)}
            className="h-8 text-xs"
            data-testid={`btn-split-transaction-${id || index}`}
            title="Split transaction across multiple categories"
          >
            <Split className="h-3.5 w-3.5 mr-1 text-purple-600 dark:text-purple-400" />
            Split
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => openRecurringRuleDialog(transaction)}
            className="h-8 text-xs"
            data-testid={`btn-make-recurring-${id || index}`}
            title="Create recurring schedule rule"
          >
            <Repeat className="h-3.5 w-3.5 mr-1 text-primary" />
            Recurring
          </Button>

          <Button size="sm" variant="outline" onClick={() => startEdit(transaction)} className="h-8 text-xs">
            Edit
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleDelete(id)}
            disabled={deleteMutation.isPending || bulkDeleteMutation.isPending}
            className="h-8 text-xs"
          >
            Delete
          </Button>
        </div>

        {/* Expanded Split Breakdown */}
        {transaction.splits && transaction.splits.length > 0 && expandedSplitIds.has(id || "") && (
          <div
            className="w-full mt-3 pt-2.5 border-t border-border/50 text-xs"
            data-testid={`split-breakdown-${id || index}`}
          >
            <div className="flex items-center justify-between mb-1.5 text-muted-foreground font-medium text-[11px]">
              <span>Category Allocation Breakdown:</span>
              <button
                type="button"
                onClick={() => handleClearSplits(transaction)}
                className="text-destructive hover:underline text-[10px]"
                data-testid={`btn-clear-splits-${id || index}`}
              >
                Clear Splits
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {transaction.splits.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded bg-card/60 border border-border/50 text-xs"
                >
                  <span className="font-medium text-foreground truncate mr-2">{s.category}</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">
                    {formatMoney(s.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );

    if (isVirtual) {
      return (
        <div
          key={id || `${transaction.description}-${index}`}
          style={{ position: "absolute", top: offsetTop, left: 0, right: 0, height: 90 }}
        >
          {body}
        </div>
      );
    }

    return (
      <motion.div
        key={id || `${transaction.description}-${index}`}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: Math.min(index * 0.02, 0.4) }}
      >
        {body}
      </motion.div>
    );
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const startEdit = (transaction: ITransaction) => {
    setEditingId(transaction.id || transaction._id || null);
    setForm({
      amount: String(Math.abs(transaction.amount)),
      category: transaction.category,
      description: transaction.description,
      date: new Date(transaction.date).toISOString().slice(0, 10),
      type: transaction.type,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      amount: Number(form.amount),
      category: form.category.trim(),
      description: form.description.trim(),
      type: form.type,
      date: form.date ? new Date(form.date).toISOString() : undefined,
    };

    if (!payload.amount || !payload.category || !payload.description) {
      return;
    }

    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, payload: form });
      return;
    }

    await createMutation.mutateAsync(payload);
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!window.confirm("Delete this transaction?")) return;
    await deleteMutation.mutateAsync(id);
  };

  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState<CsvState>(EMPTY_CSV);
  const [previewReady, setPreviewReady] = useState(false);

  const previewMutation = useMutation({
    mutationFn: importTransactionsCsv,
    onSuccess: () => {
      setPreviewReady(true);
    },
    onError: (error) => {
      toast({
        title: "Preview failed",
        description: formatError(error, "Failed to preview transactions."),
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: importTransactionsCsv,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: "Imported",
        description: `Inserted ${result.inserted} transactions (${result.duplicates} duplicates, ${result.invalid_rows || 0} invalid). Merchants touched: ${result.merchants_touched}.`,
      });
      setImportOpen(false);
      setCsv(EMPTY_CSV);
      setPreviewReady(false);
      previewMutation.reset();
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: formatError(error, "Failed to import transactions."),
        variant: "destructive",
      });
    },
  });

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
      merchant: pickFirstMatchingColumn(columns, ["merchant", "payee", "vendor", "counterparty", "name"]),
      date: pickFirstMatchingColumn(columns, ["date", "txn_date", "transaction_date"]),
      type: pickFirstMatchingColumn(columns, ["type", "txn_type", "transaction_type"]),
    };

    setCsv({
      file,
      fileName: file.name,
      columns,
      rawRows: rows.slice(0, 2000),
      accountId: "",
      mapping,
    });
    setPreviewReady(false);
    previewMutation.reset();
  };

  const previewRows = useMemo(() => {
    if (!csv.rawRows.length) return [];
    const { mapping } = csv;
    if (!mapping.amount || !mapping.date) return [];

    return csv.rawRows.slice(0, 5).map(row => ({
      date: String(row[mapping.date] || "").trim(),
      merchant: mapping.merchant ? String(row[mapping.merchant] || "").trim() : "",
      description: mapping.description ? String(row[mapping.description] || "").trim() : "",
      category: mapping.category ? String(row[mapping.category] || "").trim() : "",
      amount: String(row[mapping.amount] || "").trim(),
      type: mapping.type ? String(row[mapping.type] || "").trim().toLowerCase() : "",
    }));
  }, [csv]);

  const runPreview = async () => {
    const { mapping } = csv;
    if (!csv.file || !csv.rawRows.length) return;

    if (!mapping.amount || !mapping.date) {
      toast({
        title: "Mapping required",
        description: "Map at least Amount and Date columns before previewing.",
        variant: "destructive",
      });
      return;
    }

    const mappingPayload: any = {
      amount: mapping.amount,
      date: mapping.date,
      description: mapping.description || undefined,
      category: mapping.category || undefined,
      type: mapping.type || undefined,
      merchant: mapping.merchant || undefined,
    };

    await previewMutation.mutateAsync({
      file: csv.file,
      mapping: mappingPayload,
      account_id: csv.accountId || undefined,
      dry_run: true,
      remember_mapping: true,
    });
  };

  const runImport = async () => {
    const { mapping } = csv;
    if (!csv.file || !csv.rawRows.length) return;

    if (!mapping.amount || !mapping.date) {
      toast({
        title: "Mapping required",
        description: "Map at least Amount and Date columns (Type is recommended).",
        variant: "destructive",
      });
      return;
    }

    const mappingPayload: any = {
      amount: mapping.amount,
      date: mapping.date,
      description: mapping.description || undefined,
      category: mapping.category || undefined,
      type: mapping.type || undefined,
      merchant: mapping.merchant || undefined,
    };

    await importMutation.mutateAsync({
      file: csv.file,
      mapping: mappingPayload,
      account_id: csv.accountId || undefined,
      remember_mapping: true,
    });
  };

  const importPreviewRows = previewMutation.data?.preview_rows || [];
  const importDuplicateGroups = previewMutation.data?.duplicate_groups || [];

  return (
    <div className="page-grid flex-1 overflow-auto" data-testid="transactions-page">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageIntro
          icon={ReceiptText}
          eyebrow="Transactions"
          title="Transactions"
          description="Add income and expenses, import a CSV, or filter your transaction history."
          stats={[
            { label: "Visible entries", value: String(visibleTransactions.length) },
            { label: "Visible income", value: formatMoney(visibleIncome) },
            { label: "Visible outflow", value: formatMoney(visibleOutflow) },
          ]}
          actions={
            <>
              <ReceiptOcrDialog currencyHint={currency} />
              <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-full">
                    <Upload className="mr-2 h-4 w-4" />
                    Import CSV
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Import transactions</DialogTitle>
                  <DialogDescription>
                    Upload a CSV and map columns. Amount + Date are required; Type is recommended (otherwise inferred from sign).
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <input
                    type="file"
                    aria-label="Transactions CSV"
                    className="block w-full min-w-0 max-w-full text-sm"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      handleCsvFile(file).catch((error) =>
                        toast({
                          title: "CSV failed",
                          description: formatError(error, "Failed to parse CSV."),
                          variant: "destructive",
                        })
                      );
                    }}
                  />

                  {csv.fileName ? (
                    <div className="text-xs text-muted-foreground">
                      Loaded {csv.rawRows.length} rows from {csv.fileName}
                    </div>
                  ) : null}

                  {csv.columns.length > 0 && (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Account (optional)</label>
                        <select
                          value={csv.accountId}
                          onChange={(e) => {
                            const accountId = e.target.value;
                            const selectedAccount = (accountsQuery.data?.accounts || []).find((account) => account.id === accountId);
                            const rememberedMapping = (selectedAccount?.metadata as any)?.import_preferences?.transactions_csv?.last_mapping;
                            setCsv((prev) => ({
                              ...prev,
                              accountId,
                              mapping:
                                rememberedMapping && typeof rememberedMapping === "object"
                                  ? { ...prev.mapping, ...rememberedMapping }
                                  : prev.mapping,
                            }));
                            setPreviewReady(false);
                            previewMutation.reset();
                          }}
                          disabled={accountsQuery.isLoading}
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                        >
                          <option value="">No account</option>
                          {(accountsQuery.data?.accounts || []).map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.type})
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {accountsQuery.isLoading
                            ? "Loading accounts..."
                            : accountsQuery.data?.accounts?.length
                              ? "Helps segment imports and power account-level insights."
                              : "No accounts yet. Create one in Finance OS."}
                        </div>
                        {csv.accountId && ((accountsQuery.data?.accounts || []).find((account) => account.id === csv.accountId)?.metadata as any)?.import_preferences?.transactions_csv?.last_mapping ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Reused the last saved mapping for this account. You can adjust it before previewing.
                          </div>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(
                          [
                            ["amount", "Amount"],
                            ["date", "Date"],
                            ["type", "Type (optional)"],
                            ["description", "Description (optional)"],
                            ["merchant", "Merchant (optional)"],
                            ["category", "Category (optional)"],
                          ] as const
                        ).map(([key, label]) => (
                          <div key={key}>
                            <label className="text-sm font-medium">{label}</label>
                            <select
                              value={(csv.mapping as any)[key]}
                              onChange={e => {
                                setCsv(prev => ({
                                  ...prev,
                                  mapping: { ...prev.mapping, [key]: e.target.value },
                                }));
                                setPreviewReady(false);
                                previewMutation.reset();
                              }}
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
                    </div>
                  )}

                  {previewMutation.data ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Card className="p-3">
                          <div className="text-xs text-muted-foreground">Parsed rows</div>
                          <div className="text-lg font-semibold">{previewMutation.data.parsed_rows}</div>
                        </Card>
                        <Card className="p-3">
                          <div className="text-xs text-muted-foreground">Valid rows</div>
                          <div className="text-lg font-semibold">{previewMutation.data.valid_rows}</div>
                        </Card>
                        <Card className="p-3">
                          <div className="text-xs text-muted-foreground">Invalid rows</div>
                          <div className="text-lg font-semibold">{previewMutation.data.invalid_rows || 0}</div>
                        </Card>
                        <Card className="p-3">
                          <div className="text-xs text-muted-foreground">Duplicates</div>
                          <div className="text-lg font-semibold">{previewMutation.data.duplicates}</div>
                        </Card>
                      </div>

                      {importDuplicateGroups.length ? (
                        <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                          <div className="font-medium text-foreground">Duplicate review</div>
                          <div className="mt-2 space-y-1">
                            {importDuplicateGroups.slice(0, 4).map((group) => (
                              <div key={group.duplicate_key}>
                                Rows {group.row_indexes.join(", ")}: {group.reason}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : previewRows.length > 0 && (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="min-w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Merchant</th>
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
                              <td className="px-3 py-2">{row.merchant}</td>
                              <td className="px-3 py-2">{row.description}</td>
                              <td className="px-3 py-2">{row.category}</td>
                              <td className="px-3 py-2">{row.amount}</td>
                              <td className="px-3 py-2">{row.type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {importPreviewRows.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="min-w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-3 py-2 text-left">Row</th>
                            <th className="px-3 py-2 text-left">Status</th>
                            <th className="px-3 py-2 text-left">Description</th>
                            <th className="px-3 py-2 text-left">Category</th>
                            <th className="px-3 py-2 text-left">Amount</th>
                            <th className="px-3 py-2 text-left">Review</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreviewRows.map((row) => (
                            <tr key={row.row_index} className="border-t border-border align-top">
                              <td className="px-3 py-2">{row.row_index}</td>
                              <td className="px-3 py-2">
                                <Badge variant={row.status === "ready" ? "default" : row.status === "duplicate" ? "secondary" : "outline"}>
                                  {row.status}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium">{row.description || row.merchant_name || "—"}</div>
                                {row.issues.length ? <div className="text-xs text-muted-foreground">{row.issues.join(" ")}</div> : null}
                              </td>
                              <td className="px-3 py-2">
                                <div>{row.category || "—"}</div>
                                {row.suggestions?.category && row.suggestions.category !== row.category ? (
                                  <div className="text-xs text-muted-foreground">
                                    Suggested: {row.suggestions.category} via {row.suggestions.category_source?.replace("_", " ")}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2">{row.amount_raw}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {row.review.flags.length ? row.review.flags.map((flag) => (
                                    <Badge key={flag} variant="outline">{reviewFlagLabel[flag]}</Badge>
                                  )) : <span className="text-muted-foreground">Clean</span>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setImportOpen(false);
                        setCsv(EMPTY_CSV);
                        setPreviewReady(false);
                        previewMutation.reset();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button variant="outline" onClick={runPreview} disabled={!csv.file || !csv.rawRows.length || previewMutation.isPending || importMutation.isPending}>
                      {previewMutation.isPending ? "Previewing..." : "Preview import"}
                    </Button>
                    <Button onClick={runImport} disabled={importMutation.isPending || !previewReady}>
                      {importMutation.isPending ? "Importing..." : "Commit import"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
              </Dialog>

              <Button onClick={startCreate} className="rounded-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Transaction
              </Button>
            </>
          }
        />

        <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") === "review" ? "review" : "ledger"} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="review">Review Queue</TabsTrigger>
          </TabsList>

          <TabsContent value="review">
            <Card className="surface-panel p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">Transaction Review Queue</h2>
                <p className="text-sm text-muted-foreground">
                  Approve, categorize, or dismiss flagged transactions. Bulk actions are available for batch workflows.
                </p>
              </div>
              <TransactionReviewQueue />
            </Card>
          </TabsContent>

          <TabsContent value="ledger">

        <Card className="surface-panel p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Filter transactions</h2>
              <p className="text-sm text-muted-foreground">
                Narrow the list by type, category, and date range.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                {activeFiltersCount} active filter{activeFiltersCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
            <div>
              <label htmlFor="filter-type" className="text-sm font-medium">Type</label>
              <select id="filter-type"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as any);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="all">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="investment">Investment</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="filter-category" className="text-sm font-medium">Category</label>
              <input id="filter-category"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                placeholder="Food, Rent..."
              />
            </div>

            <div>
              <label htmlFor="filter-from" className="text-sm font-medium">From</label>
              <input id="filter-from"
                type="date"
                value={fromFilter}
                onChange={(e) => {
                  setFromFilter(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="filter-to" className="text-sm font-medium">To</label>
              <input id="filter-to"
                type="date"
                value={toFilter}
                onChange={(e) => {
                  setToFilter(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="filter-review" className="text-sm font-medium">Review</label>
              <select id="filter-review"
                value={reviewFilter}
                onChange={(e) => {
                  setReviewFilter(e.target.value as ReviewFilter);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="all">All</option>
                <option value="needs_attention">Needs attention</option>
                <option value="uncategorized">Uncategorized</option>
                <option value="suspected_duplicate">Suspected duplicate</option>
                <option value="needs_merchant_match">Needs merchant match</option>
                <option value="split_candidate">Split candidate</option>
                <option value="recurring_candidate">Recurring candidate</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-limit" className="text-sm font-medium">Page size</label>
              <select id="filter-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value) || 20);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTypeFilter("all");
                setCategoryFilter("");
                setFromFilter("");
                setToFilter("");
                setReviewFilter("all");
                setPage(1);
              }}
            >
              Clear
            </Button>
          </div>
        </Card>

        {isFormOpen && (
          <Card className="surface-panel p-6">
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="transaction-type" className="text-sm font-medium">Type</label>
                <select id="transaction-type"
                  value={form.type}
                  onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as TransactionType }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="investment">Investment</option>
                </select>
              </div>

              <div>
                <label htmlFor="transaction-amount" className="text-sm font-medium">Amount</label>
                <input id="transaction-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                  required
                />
              </div>

              <div>
                <label htmlFor="transaction-category" className="text-sm font-medium">Category</label>
                <input id="transaction-category"
                  type="text"
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                  required
                />
              </div>

              <div>
                <label htmlFor="transaction-date" className="text-sm font-medium">Date</label>
                <input id="transaction-date"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="transaction-description" className="text-sm font-medium">Description</label>
                <input id="transaction-description"
                  type="text"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                  required
                />
              </div>

              <div className="md:col-span-2 flex items-center gap-3">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Save Changes" : "Create Transaction"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card className="surface-panel p-6">
          {isLoading ? (
            <InlineLoader label="Loading transactions..." />
          ) : visibleTransactions.length === 0 ? (
            <EmptyState
              title="No transactions found"
              description={
                activeFiltersCount > 0
                  ? "Your current filters are hiding all entries. Clear a filter or widen the date range to bring transactions back into view."
                  : "Start with a manual entry, a CSV import, or a receipt scan to build the ledger."
              }
              icon={activeFiltersCount > 0 ? ReceiptText : ScanLine}
              action={
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button onClick={startCreate}>Add Transaction</Button>
                  <Button variant="outline" onClick={() => setImportOpen(true)}>
                    Import CSV
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="space-y-4">
              {/* Batch Actions Toolbar */}
              {selectedIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg border border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3 text-xs"
                  data-testid="batch-actions-bar"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-xs px-2 py-0.5">
                      {selectedIds.size} selected
                    </Badge>
                    <span className="text-muted-foreground">
                      of {visibleTransactions.length} visible
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Quick Category Selector */}
                    <div className="flex items-center gap-1.5">
                      <select
                        value={batchCategory}
                        onChange={(e) => setBatchCategory(e.target.value)}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        data-testid="batch-category-select"
                      >
                        <option value="">Select category...</option>
                        {COMMON_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="__custom__">Custom category...</option>
                      </select>

                      {batchCategory === "__custom__" && (
                        <input
                          type="text"
                          placeholder="Category name"
                          value={customCategory}
                          onChange={(e) => setCustomCategory(e.target.value)}
                          className="h-8 w-28 rounded-md border border-border bg-background px-2 text-xs"
                          data-testid="batch-custom-category-input"
                        />
                      )}

                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs"
                        onClick={handleBatchCategorize}
                        disabled={
                          (!batchCategory || (batchCategory === "__custom__" && !customCategory.trim())) ||
                          bulkCategorizeMutation.isPending
                        }
                      >
                        {bulkCategorizeMutation.isPending ? "Applying..." : "Apply Category"}
                      </Button>
                    </div>

                    {/* Batch Delete Button */}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs"
                      onClick={handleBatchDelete}
                      disabled={bulkDeleteMutation.isPending}
                    >
                      {bulkDeleteMutation.isPending ? "Deleting..." : `Delete (${selectedIds.size})`}
                    </Button>

                    {/* Deselect All */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Deselect
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Select All Toggle Header */}
              <div className="flex items-center justify-between pb-2 border-b border-border/50 text-xs text-muted-foreground px-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all visible transactions"
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="font-medium text-foreground">Select all visible ({visibleTransactions.length})</span>
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-primary font-medium">{selectedIds.size} selected</span>
                )}
              </div>

              {isLargeBatch ? (
                <div
                  ref={containerRef}
                  className="overflow-y-auto max-h-[600px] relative pr-1"
                  style={{ height: Math.min(600, totalHeight) }}
                >
                  <div style={{ height: totalHeight, position: "relative" }}>
                    {visibleItems.map(({ item, index, offsetTop }) =>
                      renderTransactionCard(item, index, true, offsetTop)
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleTransactions.map((transaction, index) =>
                    renderTransactionCard(transaction, index)
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {data?.pagination ? (
          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.totalPages} • Total {data.pagination.total}
            </div>
            <Button
              variant="outline"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= data.pagination.totalPages}
            >
              Next
            </Button>
          </div>
        ) : null}

          </TabsContent>
        </Tabs>

        {/* Split Transaction Modal Dialog */}
        {splitTargetTransaction && (
          <Dialog open={Boolean(splitTargetTransaction)} onOpenChange={(open) => !open && setSplitTargetTransaction(null)}>
            <DialogContent className="max-w-md" data-testid="dialog-split-transaction">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Split className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  Split Transaction
                </DialogTitle>
                <DialogDescription>
                  Allocate <span className="font-semibold text-foreground">{splitTargetTransaction.description}</span> ({formatMoney(splitTargetTotal)}) across multiple expense categories.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* Allocation Balance Status Meter */}
                <div className="p-3 rounded-lg border border-border/60 bg-accent/40 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total: <strong className="text-foreground">{formatMoney(splitTargetTotal)}</strong></span>
                    <span className="text-muted-foreground">Allocated: <strong className="text-foreground">{formatMoney(splitAllocatedSum)}</strong></span>
                    <Badge
                      variant={isSplitBalanced ? "default" : splitRemaining > 0 ? "outline" : "destructive"}
                      className="text-[10px]"
                      data-testid="badge-split-status"
                    >
                      {isSplitBalanced
                        ? "Balanced"
                        : splitRemaining > 0
                        ? `${formatMoney(splitRemaining)} Left`
                        : `${formatMoney(Math.abs(splitRemaining))} Over`}
                    </Badge>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        isSplitBalanced ? "bg-emerald-500" : splitRemaining > 0 ? "bg-amber-500" : "bg-destructive"
                      }`}
                      style={{ width: `${Math.min(100, (splitAllocatedSum / (splitTargetTotal || 1)) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Split Category Rows */}
                <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                  {splitRows.map((row, idx) => (
                    <div key={row.id} className="flex items-center gap-2" data-testid={`split-row-${idx}`}>
                      <div className="flex-1">
                        <select
                          value={row.category}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSplitRows((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], category: val };
                              return next;
                            });
                          }}
                          className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                          data-testid={`select-split-category-${idx}`}
                        >
                          <option value="">Select category...</option>
                          {COMMON_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-28 relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={row.amount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSplitRows((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], amount: val };
                              return next;
                            });
                          }}
                          className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs text-right font-medium"
                          data-testid={`input-split-amount-${idx}`}
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => autoFillRemainder(idx)}
                        className="h-8 px-1.5 text-[10px] text-muted-foreground hover:text-primary"
                        title="Fill remainder here"
                        data-testid={`btn-autofill-remainder-${idx}`}
                      >
                        Fill
                      </Button>

                      {splitRows.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSplitRow(row.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          data-testid={`btn-remove-split-row-${idx}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSplitRow}
                    className="text-xs h-7"
                    data-testid="btn-add-split-row"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Category
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Min 2 categories required
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSplitTargetTransaction(null)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveSplits}
                    disabled={!isSplitValid || updateMutation.isPending}
                    className="text-xs"
                    data-testid="btn-submit-split"
                  >
                    {updateMutation.isPending ? "Saving..." : "Apply Splits"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Create Recurring Rule Modal Dialog */}
        {recurringTargetTransaction && (
          <Dialog open={Boolean(recurringTargetTransaction)} onOpenChange={(open) => !open && setRecurringTargetTransaction(null)}>
            <DialogContent className="max-w-md" data-testid="dialog-create-recurring-rule">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Repeat className="h-5 w-5 text-primary" />
                  Create Recurring Rule
                </DialogTitle>
                <DialogDescription>
                  Automate schedule and forecast cashflow for <span className="font-semibold text-foreground">{recurringTargetTransaction.description}</span>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div>
                  <label htmlFor="recurring-rule-name" className="text-xs font-semibold text-foreground block mb-1">
                    Rule Name
                  </label>
                  <input
                    id="recurring-rule-name"
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    className="w-full h-8 rounded-md border border-border bg-background px-3 text-xs"
                    data-testid="input-recurring-rule-name"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="recurring-rule-category" className="text-xs font-semibold text-foreground block mb-1">
                      Category
                    </label>
                    <select
                      id="recurring-rule-category"
                      value={ruleCategory}
                      onChange={(e) => setRuleCategory(e.target.value)}
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                      data-testid="select-recurring-rule-category"
                    >
                      <option value="">Select category...</option>
                      {COMMON_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="recurring-rule-amount" className="text-xs font-semibold text-foreground block mb-1">
                      Expected Amount
                    </label>
                    <input
                      id="recurring-rule-amount"
                      type="number"
                      step="0.01"
                      value={ruleAmount}
                      onChange={(e) => setRuleAmount(e.target.value)}
                      className="w-full h-8 rounded-md border border-border bg-background px-3 text-xs text-right font-medium"
                      data-testid="input-recurring-rule-amount"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="recurring-rule-frequency" className="text-xs font-semibold text-foreground block mb-1">
                    Billing Frequency
                  </label>
                  <select
                    id="recurring-rule-frequency"
                    value={ruleFrequency}
                    onChange={(e) => setRuleFrequency(e.target.value as any)}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                    data-testid="select-recurring-rule-frequency"
                  >
                    <option value="monthly">Monthly (1st of month)</option>
                    <option value="biweekly">Bi-Weekly (1st & 15th)</option>
                    <option value="weekly">Weekly (Every Monday)</option>
                    <option value="quarterly">Quarterly (Every 3 months)</option>
                    <option value="annual">Annual (Once a year)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRecurringTargetTransaction(null)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitRecurringRule}
                    disabled={!ruleName.trim() || !Number(ruleAmount) || createRecurringRuleMutation.isPending}
                    className="text-xs"
                    data-testid="btn-submit-recurring-rule"
                  >
                    {createRecurringRuleMutation.isPending ? "Creating..." : "Create Rule"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </motion.div>
    </div>
  );
}

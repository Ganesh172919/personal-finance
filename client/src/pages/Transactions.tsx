import { motion } from "framer-motion";
import Papa from "papaparse";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ReceiptText, ScanLine, Upload } from "lucide-react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { InlineLoader } from "@/components/feedback/InlineLoader";
import { PageIntro } from "@/components/layout/PageIntro";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ReceiptOcrDialog } from "@/components/ReceiptOcrDialog";
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
import {
  ApiError,
  createTransaction,
  deleteTransaction,
  getTransactions,
  importTransactionsCsv,
  listAccounts,
  TransactionType,
  updateTransaction,
} from "@/lib/apiClient";
import { ITransaction } from "@/types";

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
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TransactionForm> }) =>
      updateTransaction(id, {
        ...payload,
        amount: payload.amount ? Number(payload.amount) : undefined,
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

  const transactions = useMemo(() => {
    const allTransactions = (data?.transactions || []) as ITransaction[];
    return [...allTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data?.transactions]);

  const visibleIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const visibleOutflow = transactions
    .filter((transaction) => transaction.type !== "income")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const activeFiltersCount = [typeFilter !== "all", Boolean(categoryFilter), Boolean(fromFilter), Boolean(toFilter)].filter(Boolean).length;

  const formatAmount = (amount: number, type: TransactionType) => {
    const prefix = type === "income" ? "+" : "-";
    return `${prefix}${formatMoney(Math.abs(amount), { maximumFractionDigits: 0 })}`;
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

  const importMutation = useMutation({
    mutationFn: importTransactionsCsv,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: "Imported",
        description: `Inserted ${result.inserted} transactions (${result.duplicates} duplicates). Merchants touched: ${result.merchants_touched}.`,
      });
      setImportOpen(false);
      setCsv(EMPTY_CSV);
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
    });
  };

  return (
    <div className="page-grid flex-1 overflow-auto" data-testid="transactions-page">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageIntro
          icon={ReceiptText}
          eyebrow="Cash Flow Ledger"
          title="Transactions that are easier to review, filter, and clean up"
          description="Keep income, expenses, and investments in one working ledger. Import in bulk, scan receipts, and tighten filters when you need to isolate a pattern quickly."
          stats={[
            { label: "Visible entries", value: String(transactions.length) },
            { label: "Visible income", value: formatMoney(visibleIncome, { maximumFractionDigits: 0 }) },
            { label: "Visible outflow", value: formatMoney(visibleOutflow, { maximumFractionDigits: 0 }) },
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
                          onChange={(e) => setCsv((prev) => ({ ...prev, accountId: e.target.value }))}
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
                              onChange={e =>
                                setCsv(prev => ({
                                  ...prev,
                                  mapping: { ...prev.mapping, [key]: e.target.value },
                                }))}
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

                  {previewRows.length > 0 && (
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

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setImportOpen(false);
                        setCsv(EMPTY_CSV);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={runImport} disabled={importMutation.isPending}>
                      {importMutation.isPending ? "Importing..." : "Import"}
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

        <Card className="surface-panel p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Refine the ledger view</h2>
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

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="text-sm font-medium">Type</label>
              <select
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
              <label className="text-sm font-medium">Category</label>
              <input
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
              <label className="text-sm font-medium">From</label>
              <input
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
              <label className="text-sm font-medium">To</label>
              <input
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
              <label className="text-sm font-medium">Page size</label>
              <select
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
                <label className="text-sm font-medium">Type</label>
                <select
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
                <label className="text-sm font-medium">Amount</label>
                <input
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
                <label className="text-sm font-medium">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <input
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
          ) : transactions.length === 0 ? (
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
            <div className="space-y-3">
              {transactions.map((transaction, index) => {
                const id = transaction.id || transaction._id;
                return (
                  <motion.div
                    key={id || `${transaction.description}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-lg bg-accent/50"
                  >
                    <div>
                      <p className="font-medium text-foreground">{transaction.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.category} - {formatDate(transaction.date)}
                        {transaction.source?.origin ? ` • ${transaction.source.origin.replace("_", " ")}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right min-w-[140px]">
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

                      <Button size="sm" variant="outline" onClick={() => startEdit(transaction)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(id)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
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
      </motion.div>
    </div>
  );
}

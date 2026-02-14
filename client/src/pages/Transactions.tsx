import { motion } from "framer-motion";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  createTransaction,
  deleteTransaction,
  getTransactions,
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

const EMPTY_FORM: TransactionForm = {
  amount: "",
  category: "",
  description: "",
  date: "",
  type: "expense",
};

export default function Transactions() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionForm>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/transactions"],
    queryFn: () => getTransactions({ page: 1, limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setForm(EMPTY_FORM);
      setIsFormOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TransactionForm> }) =>
      updateTransaction(id, {
        ...payload,
        amount: payload.amount ? Number(payload.amount) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setForm(EMPTY_FORM);
      setEditingId(null);
      setIsFormOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    },
  });

  const transactions = useMemo(() => {
    const allTransactions = (data?.transactions || []) as ITransaction[];
    return [...allTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [data?.transactions]);

  const formatAmount = (amount: number, type: TransactionType) => {
    const prefix = type === "income" ? "+" : "-";
    return `${prefix}${new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))}`;
  };

  const formatDate = (date: string | Date) =>
    new Date(date).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

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

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="transactions-page">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
          <Button onClick={startCreate}>Add Transaction</Button>
        </div>
        <p className="text-muted-foreground mb-6">
          Review and manage your income, expense, and investment entries.
        </p>

        {isFormOpen && (
          <Card className="p-6 mb-6">
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

        <Card className="p-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No transactions found yet.</div>
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
      </motion.div>
    </div>
  );
}


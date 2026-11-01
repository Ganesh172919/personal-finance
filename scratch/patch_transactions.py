import re

file_path = r"c:\Users\RAVIPRAKASH\personal-finance\client\src\pages\Transactions.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update lucide-react import
old_lucide = 'import { Plus, ReceiptText, ScanLine, Upload } from "lucide-react";'
new_lucide = 'import { Plus, ReceiptText, ScanLine, Upload, Split, Repeat, Trash2, ChevronDown, ChevronUp, Layers } from "lucide-react";'
content = content.replace(old_lucide, new_lucide)

# 2. Update apiClient import
old_api = """import {
  ApiError,
  bulkCategorizeTransactions,
  bulkDeleteTransactions,
  createTransaction,
  deleteTransaction,
  getTransactions,
  importTransactionsCsv,
  listAccounts,
  TransactionType,
  updateTransaction,
} from "@/lib/apiClient";"""

new_api = """import {
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
} from "@/lib/apiClient";"""
content = content.replace(old_api, new_api)

# 3. Update updateMutation to handle splits
old_update_mutation = """  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TransactionForm> }) =>
      updateTransaction(id, {
        ...payload,
        amount: payload.amount ? Number(payload.amount) : undefined,
      }),"""

new_update_mutation = """  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TransactionForm> & { splits?: Array<{ category: string; amount: number }> } }) =>
      updateTransaction(id, {
        ...payload,
        amount: payload.amount ? Number(payload.amount) : undefined,
        splits: payload.splits,
      }),"""
content = content.replace(old_update_mutation, new_update_mutation)

# 4. Add split state and recurring rule state
state_anchor = "  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());"
new_state_and_handlers = """  // Split transaction state
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
    mutationFn: createRecurringRule,
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());"""
content = content.replace(state_anchor, new_state_and_handlers, 1)

# 5. Enhance renderTransactionCard with Split badge, toggle, buttons, and breakdown
old_render_card = """          <div>
            <p className="font-medium text-foreground">{transaction.description}</p>
            <p className="text-xs text-muted-foreground">
              {transaction.category} - {formatDate(transaction.date)}
              {transaction.source?.origin ? ` • ${transaction.source.origin.replace("_", " ")}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
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
            disabled={deleteMutation.isPending || bulkDeleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </div>"""

new_render_card = """          <div>
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
      </div>"""
content = content.replace(old_render_card, new_render_card)

# 6. Add Split Transaction Dialog and Recurring Rule Dialog before closing div
closing_anchor = """          </TabsContent>
        </Tabs>
      </motion.div>
    </div>"""

dialogs = """          </TabsContent>
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
    </div>"""

content = content.replace(closing_anchor, dialogs)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully patched Transactions.tsx")

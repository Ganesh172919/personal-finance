/**
 * @fileoverview Transaction Review Queue
 *
 * A dedicated review workflow for transactions that need attention.
 * Shows confidence scores, flag chips, and action buttons for one-click
 * approve, bulk approve, and "always categorize like this."
 *
 * FEATURES:
 * - Filter by flag type (uncategorized, duplicate, merchant match, etc.)
 * - Confidence score badges (color-coded: red <0.4, amber 0.4–0.7, green >0.7)
 * - One-click approve with slide-out animation
 * - "Always categorize like this" for uncategorized transactions
 * - Bulk select + bulk approve toolbar
 * - Empty state celebration when queue is clear
 *
 * DATA:
 * Fetches from GET /api/financial-data/transactions?needs_review=true
 * Actions use POST approve/bulk-approve/always-categorize endpoints.
 *
 * @module components/TransactionReviewQueue
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast } from "@/hooks/useToast";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import {
  getTransactions,
  approveTransaction,
  bulkApproveTransactions,
  alwaysCategorize,
} from "@/lib/api/transactions";
import type { TransactionsResponse } from "@/lib/api/transactions";

type ReviewFlag =
  | "uncategorized"
  | "suspected_duplicate"
  | "needs_merchant_match"
  | "split_candidate"
  | "recurring_candidate";

const FLAG_LABELS: Record<ReviewFlag, { label: string; color: string }> = {
  uncategorized: { label: "Uncategorized", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  suspected_duplicate: { label: "Duplicate?", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  needs_merchant_match: { label: "No Merchant", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  split_candidate: { label: "Split?", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  recurring_candidate: { label: "Recurring?", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
};

const ALL_FLAGS: ReviewFlag[] = [
  "uncategorized",
  "suspected_duplicate",
  "needs_merchant_match",
  "split_candidate",
  "recurring_candidate",
];

/** Confidence score badge with color coding */
const ConfidenceBadge = ({ score }: { score?: number }) => {
  if (score === undefined || score === null) return null;
  const pct = Math.round(score * 100);
  const color =
    score >= 0.7
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : score >= 0.4
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30";

  return (
    <Badge className={`${color} border text-[10px] font-mono`}>
      {pct}%
    </Badge>
  );
};

export default function TransactionReviewQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatMoney, formatDate } = useOrgFormatters();

  const [activeFilter, setActiveFilter] = useState<ReviewFlag | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  // Fetch transactions needing review
  const { data, isLoading, refetch } = useQuery<TransactionsResponse>({
    queryKey: ["/api/financial-data/transactions", { needs_review: true, review_flag: activeFilter }],
    queryFn: () =>
      getTransactions({
        needs_review: true,
        review_flag: activeFilter || undefined,
        limit: 100,
      }),
  });

  const transactions = useMemo(
    () => (data?.transactions || []).filter((tx) => !approvedIds.has(tx.id)),
    [data?.transactions, approvedIds]
  );

  // ── Mutations ─────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: approveTransaction,
    onSuccess: (_data, txId) => {
      setApprovedIds((prev) => new Set(prev).add(txId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(txId);
        return next;
      });
      toast({ title: "Approved", description: "Transaction approved." });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-data/command-center"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve transaction.", variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: bulkApproveTransactions,
    onSuccess: (result) => {
      setApprovedIds((prev) => {
        const next = new Set(prev);
        selectedIds.forEach((id) => next.add(id));
        return next;
      });
      setSelectedIds(new Set());
      toast({
        title: "Bulk Approved",
        description: `${result.modified} transaction${result.modified !== 1 ? "s" : ""} approved.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-data/command-center"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to bulk approve.", variant: "destructive" });
    },
  });

  const alwaysCategorizeMutation = useMutation({
    mutationFn: alwaysCategorize,
    onSuccess: (_data, txId) => {
      setApprovedIds((prev) => new Set(prev).add(txId));
      toast({
        title: "Rule Created",
        description: "Future similar transactions will be categorized automatically.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-data/command-center"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create rule.", variant: "destructive" });
    },
  });

  // ── Selection ─────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((tx) => tx.id)));
    }
  };

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    bulkApproveMutation.mutate(Array.from(selectedIds));
  };

  return (
    <div className="space-y-4" data-testid="transaction-review-queue">
      {/* ── Filter Tabs ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Badge
          className={`cursor-pointer select-none transition-colors ${
            activeFilter === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => {
            setActiveFilter(null);
            setApprovedIds(new Set());
          }}
        >
          All
        </Badge>
        {ALL_FLAGS.map((flag) => (
          <Badge
            key={flag}
            className={`cursor-pointer select-none transition-colors border ${
              activeFilter === flag
                ? FLAG_LABELS[flag].color
                : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
            }`}
            onClick={() => {
              setActiveFilter(activeFilter === flag ? null : flag);
              setApprovedIds(new Set());
            }}
          >
            {FLAG_LABELS[flag].label}
          </Badge>
        ))}
      </div>

      {/* ── Bulk Actions Toolbar ─────────────────────────── */}
      {transactions.length > 0 && (
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/10 border border-border/30">
          <Checkbox
            checked={selectedIds.size === transactions.length && transactions.length > 0}
            onCheckedChange={selectAll}
            aria-label="Select all transactions"
          />
          <span className="text-xs text-muted-foreground flex-1">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `${transactions.length} transaction${transactions.length !== 1 ? "s" : ""} need review`}
          </span>
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={bulkApproveMutation.isPending}
              className="text-xs"
            >
              {bulkApproveMutation.isPending ? "Approving..." : `Approve ${selectedIds.size}`}
            </Button>
          )}
        </div>
      )}

      {/* ── Loading State ────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-4 h-24 animate-pulse bg-card/50" />
          ))}
        </div>
      )}

      {/* ── Transaction List ─────────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {transactions.map((tx) => {
          const review = tx.review;
          const flags = (review?.flags || []) as ReviewFlag[];
          const confidenceScore = (review as any)?.confidence_score;
          const hasUncategorized = flags.includes("uncategorized");

          return (
            <motion.div
              key={tx.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.3 } }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-4 bg-gradient-to-r from-card to-card/80 border-border/50 hover:border-border/80 transition-colors">
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <Checkbox
                    checked={selectedIds.has(tx.id)}
                    onCheckedChange={() => toggleSelect(tx.id)}
                    className="mt-1"
                    aria-label={`Select ${tx.description}`}
                  />

                  {/* Transaction details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {tx.description || "—"}
                      </span>
                      <ConfidenceBadge score={confidenceScore} />
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(tx.date)}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {tx.category}
                      </span>
                      {flags.map((flag) => (
                        <Badge
                          key={flag}
                          className={`${FLAG_LABELS[flag]?.color || ""} border text-[10px]`}
                        >
                          {FLAG_LABELS[flag]?.label || flag}
                        </Badge>
                      ))}
                    </div>

                    {review?.notes && review.notes.length > 0 && (
                      <div className="text-[11px] text-muted-foreground/70 mt-1 italic">
                        {review.notes[0]}
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="text-sm font-semibold text-foreground shrink-0">
                    {formatMoney(Math.abs(tx.amount))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approveMutation.mutate(tx.id)}
                      disabled={approveMutation.isPending}
                      className="text-xs h-8"
                    >
                      ✓ Approve
                    </Button>
                    {hasUncategorized && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => alwaysCategorizeMutation.mutate(tx.id)}
                        disabled={alwaysCategorizeMutation.isPending}
                        className="text-xs h-8 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                      >
                        Always ↻
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* ── Empty State ──────────────────────────────────── */}
      {!isLoading && transactions.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center py-12"
        >
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            All clear!
          </h3>
          <p className="text-sm text-muted-foreground">
            No transactions need review right now. Great work keeping your finances tidy.
          </p>
        </motion.div>
      )}
    </div>
  );
}

/**
 * @fileoverview Transaction Review Queue
 *
 * A dedicated review workflow for transactions that need attention.
 * Shows confidence scores, flag chips, action buttons for one-click
 * approve, bulk approve, "always categorize like this", and the
 * Machine-Learning Merchant Embedding Clustering Cockpit (64-D vector space).
 *
 * FEATURES:
 * - View mode switcher: Individual Review Items vs. Smart Merchant Clusters
 * - Machine-Learning Merchant Embedding Clustering (64-D cosine centroid clustering)
 * - Filter by flag type (uncategorized, duplicate, merchant match, etc.)
 * - Confidence score badges (color-coded: red <0.4, amber 0.4–0.7, green >0.7)
 * - One-click approve with slide-out animation
 * - "Always categorize like this" for uncategorized transactions
 * - Bulk select + bulk approve toolbar
 * - Empty state celebration when queue is clear
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
  getMerchantClusters,
  applyMerchantCluster,
} from "@/lib/api/transactions";
import type { TransactionsResponse } from "@/lib/api/transactions";

// Defines the distinct review flag categories applied to flagged transactions.
// Covers uncategorized items, duplicates, missing merchants, and recurring candidates.
// Powers filtering badges and visual tag chips within the review workflow.
type ReviewFlag =
  | "uncategorized"
  | "suspected_duplicate"
  | "needs_merchant_match"
  | "split_candidate"
  | "recurring_candidate";

// Visual configuration mapping each review flag to display text and color classes.
// Provides tailored background, text, and border styling for distinct flag badges.
// Used across filter chips and transaction list items for consistent visual hierarchy.
const FLAG_LABELS: Record<ReviewFlag, { label: string; color: string }> = {
  uncategorized: { label: "Uncategorized", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  suspected_duplicate: { label: "Duplicate?", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  needs_merchant_match: { label: "No Merchant", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  split_candidate: { label: "Split?", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  recurring_candidate: { label: "Recurring?", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
};

// Canonical list of all review flags for rendering filter option chips.
// Iterated to build the filter bar allowing users to isolate specific review types.
// Preserves the desired display order of flag filters in the UI.
const ALL_FLAGS: ReviewFlag[] = [
  "uncategorized",
  "suspected_duplicate",
  "needs_merchant_match",
  "split_candidate",
  "recurring_candidate",
];

// Renders a color-coded percentage badge representing ML categorization confidence.
// Assigns green for high confidence, amber for moderate, and red for low confidence.
// Returns null if the provided confidence score is undefined or null.
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

// Interactive workflow component for reviewing and resolving flagged transactions.
// Features individual item reviews, bulk approvals, and ML merchant cluster normalization.
// Provides real-time query invalidation and optimistic removal animations.
export default function TransactionReviewQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatMoney, formatDate } = useOrgFormatters();

  const [viewMode, setViewMode] = useState<"items" | "clusters">("items");
  const [activeFilter, setActiveFilter] = useState<ReviewFlag | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  // Fetch transactions needing review
  const { data, isLoading } = useQuery<TransactionsResponse>({
    queryKey: ["/api/financial-data/transactions", { needs_review: true, review_flag: activeFilter }],
    queryFn: () =>
      getTransactions({
        needs_review: true,
        review_flag: activeFilter || undefined,
        limit: 100,
      }),
  });

  // Fetch merchant clusters (Batch 36: Machine Learning Merchant Embedding Clustering)
  const { data: clusterData, isLoading: isLoadingClusters } = useQuery({
    queryKey: ["merchant-clusters-review"],
    queryFn: () => (getMerchantClusters ? getMerchantClusters({ limit: 50 }) : Promise.resolve({ clusters: [], total_clusters: 0 })),
  });

  const clusters = useMemo(() => clusterData?.clusters || [], [clusterData?.clusters]);

  const transactions = useMemo(
    () => (data?.transactions || []).filter((tx) => !approvedIds.has(tx.id)),
    [data?.transactions, approvedIds]
  );

  const invalidateReviewViews = () => Promise.all([
    "/api/financial-data/transactions", "/api/transactions",
    "/api/financial-data/command-center", "/api/command-center", "/api/budget-health",
  ].map(key => queryClient.invalidateQueries({ queryKey: [key] })));

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
      void invalidateReviewViews();
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
      void invalidateReviewViews();
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
      void invalidateReviewViews();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create rule.", variant: "destructive" });
    },
  });

  const applyClusterMutation = useMutation({
    mutationFn: applyMerchantCluster,
    onSuccess: (res, vars) => {
      toast({
        title: "Merchant Cluster Normalized",
        description: `Normalized ${res.updated_count} transactions as ${res.normalized_name} (${res.category}).`,
      });
      void invalidateReviewViews();
      queryClient.invalidateQueries({ queryKey: ["merchant-clusters-review"] });
      queryClient.invalidateQueries({ queryKey: ["merchant-clusters"] });
      setApprovedIds((prev) => {
        const next = new Set(prev);
        vars.transaction_ids.forEach((id) => next.add(id));
        return next;
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to apply merchant cluster.", variant: "destructive" });
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
      {/* ── View Switcher & Cockpit Mode Tabs ──────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={viewMode === "items" ? "default" : "outline"}
            data-testid="btn-tab-review-items"
            onClick={() => setViewMode("items")}
            className="text-xs h-8"
          >
            Review Items ({transactions.length})
          </Button>
          <Button
            size="sm"
            variant={viewMode === "clusters" ? "default" : "outline"}
            data-testid="btn-tab-merchant-clusters"
            onClick={() => setViewMode("clusters")}
            className="text-xs h-8 flex items-center gap-1.5"
          >
            <span>Smart Merchant Clusters</span>
            {clusters.length > 0 && (
              <Badge
                variant="secondary"
                data-testid="badge-tab-cluster-count"
                className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary"
              >
                {clusters.length}
              </Badge>
            )}
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground hidden sm:block">
          {viewMode === "clusters"
            ? "Machine Learning 64-D Vector Clustering"
            : `${transactions.length} item${transactions.length !== 1 ? "s" : ""} pending review`}
        </div>
      </div>

      {/* ── MODE 1: REVIEW ITEMS VIEW ───────────────────────── */}
      {viewMode === "items" && (
        <div className="space-y-4">
          {/* ML Cluster Recommendation Strip */}
          {clusters.length > 0 && (
            <div
              data-testid="card-ml-cluster-suggestion"
              className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <span>
                  <strong>{clusters.length} Merchant Cluster{clusters.length !== 1 ? "s" : ""}</strong> identified by ML vector embeddings (e.g. {clusters.slice(0, 2).map((c) => c.normalized_name).join(", ")}).
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                data-testid="btn-open-ml-clusters"
                onClick={() => setViewMode("clusters")}
                className="text-xs h-7 border-primary/30 text-primary hover:bg-primary/10 shrink-0"
              >
                Review Clusters ({clusters.length}) →
              </Button>
            </div>
          )}

          {/* ── Filter Tabs ─────────────────────────────────── */}
          <div className="flex flex-wrap gap-2">
            <Badge
              data-testid="filter-chip-all"
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
                data-testid={`filter-chip-${flag}`}
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
                data-testid="checkbox-select-all"
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
                  data-testid="btn-bulk-approve"
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
                  <Card data-testid={`card-review-tx-${tx.id}`} className="p-4 bg-gradient-to-r from-card to-card/80 border-border/50 hover:border-border/80 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <Checkbox
                        data-testid={`checkbox-tx-${tx.id}`}
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
                          data-testid={`btn-approve-${tx.id}`}
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
                            data-testid={`btn-always-categorize-${tx.id}`}
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
              data-testid="empty-review-queue"
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
      )}

      {/* ── MODE 2: SMART MERCHANT CLUSTERS VIEW ─────────────── */}
      {viewMode === "clusters" && (
        <div className="space-y-4" data-testid="card-ml-merchant-clusters">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-card/60 border border-border/40">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">
                  Machine Learning Merchant Embedding & Clustering Engine
                </h3>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                  64-D Vector Space
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Groups noisy bank statement variations into canonical brand entities using taxonomy projections and subword character n-gram cosine clustering.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" data-testid="badge-ml-cluster-count" className="text-xs">
                {clusters.length} Cluster{clusters.length !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="outline" data-testid="badge-ml-cluster-volume" className="text-xs">
                Volume: {formatMoney(clusters.reduce((acc, c) => acc + c.total_spend, 0))}
              </Badge>
            </div>
          </div>

          {isLoadingClusters && (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <Card key={i} className="p-4 h-28 animate-pulse bg-card/50" />
              ))}
            </div>
          )}

          {!isLoadingClusters && clusters.length === 0 && (
            <Card data-testid="empty-merchant-clusters" className="p-8 text-center bg-card/40 border-border/40">
              <div className="text-3xl mb-2">🎯</div>
              <h4 className="text-sm font-medium text-foreground">All Merchants Normalized</h4>
              <p className="text-xs text-muted-foreground mt-1">
                No unclustered merchant variations detected in your transactions.
              </p>
            </Card>
          )}

          <div className="grid gap-3">
            {clusters.map((cluster) => {
              const confPct = Math.round(cluster.confidence * 100);
              const simPct = Math.round((cluster.semantic_similarity || cluster.confidence) * 100);

              return (
                <Card
                  key={cluster.cluster_key}
                  data-testid={`card-merchant-cluster-${cluster.cluster_key}`}
                  className="p-4 bg-gradient-to-r from-card to-card/90 border-border/50 hover:border-border transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">
                          {cluster.normalized_name}
                        </span>
                        <Badge variant="outline" className="text-xs bg-muted/40">
                          {cluster.suggested_category}
                        </Badge>
                        <Badge
                          data-testid={`badge-cluster-confidence-${cluster.cluster_key}`}
                          className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono"
                        >
                          {confPct}% ML Match
                        </Badge>
                        <Badge
                          data-testid={`badge-cluster-similarity-${cluster.cluster_key}`}
                          className="bg-primary/15 text-primary border border-primary/30 text-[10px] font-mono"
                        >
                          {simPct}% Similarity
                        </Badge>
                      </div>

                      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium text-muted-foreground/80">Variants:</span>
                        {cluster.raw_descriptions.map((desc, dIdx) => (
                          <span
                            key={dIdx}
                            className="px-1.5 py-0.5 rounded bg-muted/60 text-[11px] font-mono text-foreground/80 truncate max-w-[240px]"
                            title={desc}
                          >
                            {desc}
                          </span>
                        ))}
                      </div>

                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span data-testid={`badge-cluster-tx-count-${cluster.cluster_key}`}>
                          {cluster.count} transaction{cluster.count !== 1 ? "s" : ""}
                        </span>
                        <span>•</span>
                        <span
                          data-testid={`badge-cluster-spend-${cluster.cluster_key}`}
                          className="font-medium text-foreground"
                        >
                          {formatMoney(cluster.total_spend)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Button
                        size="sm"
                        data-testid={`btn-cluster-apply-${cluster.cluster_key}`}
                        onClick={() =>
                          applyClusterMutation.mutate({
                            cluster_key: cluster.cluster_key,
                            normalized_name: cluster.normalized_name,
                            category: cluster.suggested_category,
                            transaction_ids: cluster.transaction_ids,
                          })
                        }
                        disabled={applyClusterMutation.isPending}
                        className="text-xs h-8"
                      >
                        {applyClusterMutation.isPending ? "Applying..." : `Normalize All (${cluster.count})`}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * @fileoverview Organization activity feed page.
 *
 * Shows a real-time, filterable timeline of events across the user's
 * organization -- transactions, budgets, goals, AI actions, workflow runs,
 * and member changes. Activities are grouped by day and rendered with
 * icon-coded timeline nodes.
 *
 * Key data flows:
 * - Calls getActivityFeed() from the collaboration API with optional
 *   event_type filter and cursor-based pagination.
 * - Auto-refreshes every 30 seconds via React Query refetchInterval.
 * - Supports manual "Load more" for older entries.
 *
 * Serves as the organization-level audit trail, complementing the
 * per-user Dashboard activity widget.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  Receipt,
  Wallet,
  Target,
  Zap,
  Brain,
  Camera,
  Building2,
  Users,
  Filter,
  Clock,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getActivityFeed, type ActivityItem } from "@/lib/api/v1/collaboration";

// ─── Icon Mapping ───────────────────────────────────────

const ICON_MAP: Record<string, any> = {
  receipt: Receipt,
  wallet: Wallet,
  target: Target,
  zap: Zap,
  brain: Brain,
  camera: Camera,
  building: Building2,
  users: Users,
  activity: Activity,
};

const ACCENT_MAP: Record<string, string> = {
  receipt: "text-emerald-500 bg-emerald-500/10",
  wallet: "text-blue-500 bg-blue-500/10",
  target: "text-amber-500 bg-amber-500/10",
  zap: "text-violet-500 bg-violet-500/10",
  brain: "text-purple-500 bg-purple-500/10",
  camera: "text-teal-500 bg-teal-500/10",
  building: "text-slate-500 bg-slate-500/10",
  users: "text-indigo-500 bg-indigo-500/10",
  activity: "text-primary bg-primary/10",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Filter Chips ───────────────────────────────────────

const EVENT_FILTERS = [
  { key: "all", label: "All" },
  { key: "transaction", label: "Transactions" },
  { key: "budget", label: "Budgets" },
  { key: "goal", label: "Goals" },
  { key: "workflow", label: "Workflows" },
  { key: "ai", label: "AI" },
  { key: "member", label: "Members" },
];

// ─── Page Component ─────────────────────────────────────

export default function ActivityFeedPage() {
  const [filterKey, setFilterKey] = useState("all");
  const [allActivities, setAllActivities] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const feedQuery = useQuery({
    queryKey: ["activity-feed", filterKey],
    queryFn: () =>
      getActivityFeed({
        limit: 50,
        event_type: filterKey !== "all" ? filterKey : undefined,
      }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Reset accumulated activities when filter changes or initial data changes
  const baseActivities = feedQuery.data?.activities ?? [];
  const activities = allActivities.length > 0 ? allActivities : baseActivities;
  const hasMore = cursor ? true : (feedQuery.data?.has_more ?? false);

  // Sync cursor from initial load
  if (feedQuery.data?.next_cursor && !cursor && allActivities.length === 0) {
    setCursor(feedQuery.data.next_cursor);
  }

  const handleLoadMore = async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = await getActivityFeed({
        limit: 50,
        event_type: filterKey !== "all" ? filterKey : undefined,
        before: cursor,
      });
      const newActivities = [...activities, ...(nextPage.activities || [])];
      setAllActivities(newActivities);
      setCursor(nextPage.next_cursor || undefined);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Group by day
  const grouped = useMemo(() => {
    const groups = new Map<string, ActivityItem[]>();
    for (const item of activities) {
      const dateKey = new Date(item.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(item);
    }
    return Array.from(groups.entries());
  }, [activities]);

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="px-6 lg:px-8 py-6 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-2xl font-bold text-foreground flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Activity className="w-5 h-5 text-white" />
              </div>
              Activity Feed
            </motion.h1>
            <p className="text-sm text-muted-foreground mt-1">
              See what's happening across your organization
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Auto-refreshes every 30s
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6">
        {/* Filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
          {EVENT_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterKey(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filterKey === f.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground bg-muted/50"
              }`}
              data-testid={`activity-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Feed */}
        {feedQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-8 h-8 rounded-full border-3 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          </div>
        ) : activities.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-48 gap-3">
              <Activity className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/60">
                Activity from transactions, budgets, goals, and more will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1.5 mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {dateLabel}
                  </p>
                </div>

                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />

                  <div className="space-y-0.5">
                    {items.map((item, idx) => {
                      const IconComp = ICON_MAP[item.icon] || Activity;
                      const accent = ACCENT_MAP[item.icon] || ACCENT_MAP.activity;

                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                          className="relative flex gap-3 py-2.5 pl-0.5 group"
                        >
                          {/* Icon */}
                          <div className={`relative z-10 flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${accent} ring-4 ring-background`}>
                            <IconComp className="w-4 h-4" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p className="text-sm text-foreground leading-snug">
                              <span className="font-semibold">{item.actor.name}</span>{" "}
                              <span className="text-muted-foreground">{item.description}</span>
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground/60">
                                {timeAgo(item.created_at)}
                              </span>
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                {item.event_type.replace(".", " → ")}
                              </Badge>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="text-center pt-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={handleLoadMore} disabled={isLoadingMore}>
                  <ChevronDown className="w-3.5 h-3.5 mr-1" />
                  {isLoadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

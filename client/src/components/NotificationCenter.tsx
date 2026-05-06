/**
 * @fileoverview NotificationCenter — slide-in notification panel with filtering,
 * time-grouped display, and a reusable `NotificationBell` trigger button.
 *
 * WHAT IT DOES
 *  - Renders a right-side drawer (AnimatePresence + spring animation) listing
 *    notifications grouped into "Today", "This Week", and "Earlier".
 *  - Supports filter tabs: All / Unread / Read with unread count badge.
 *  - Each notification row shows a context-aware icon (AI, budget, alert, billing),
 *    accent colour, relative timestamp, and a hover-reveal "mark as read" button.
 *  - Exports `NotificationBell` — an animated icon button with an unread-count badge
 *    designed to sit in the Sidebar.
 *
 * KEY PROPS & DATA FLOW
 *  - `isOpen` / `onClose` — controlled by the parent (Sidebar).
 *  - Uses `useNotifications` hook for data fetching, mark-read, and mark-all-read.
 *
 * ARCHITECTURE NOTES
 *  - Consumed by `Sidebar` which mounts both the bell trigger and this panel.
 *  - Notifications originate from transactions, budgets, AI insights, and workflow events.
 *  - Purely presentational after the hook provides data; no direct API calls inside.
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Brain,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  Workflow,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Separator } from "@/components/ui/Separator";
import { useNotifications } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/lib/api/v1/notifications";

// ─── Helpers ────────────────────────────────────────────

type TimeGroup = "today" | "this_week" | "older";

function getTimeGroup(dateStr: string): TimeGroup {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  if (date >= startOfToday) return "today";
  if (date >= startOfWeek) return "this_week";
  return "older";
}

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

const GROUP_LABELS: Record<TimeGroup, string> = {
  today: "Today",
  this_week: "This Week",
  older: "Earlier",
};

function getNotificationIcon(notification: NotificationItem) {
  const title = (notification.title || "").toLowerCase();
  const meta = notification.metadata as Record<string, unknown> | undefined;
  const type = (meta?.type as string) || "";

  if (type === "ai" || title.includes("ai") || title.includes("insight")) return Brain;
  if (type === "budget" || title.includes("budget") || title.includes("spending")) return TrendingUp;
  if (type === "alert" || title.includes("alert") || title.includes("warning")) return AlertTriangle;
  if (type === "billing" || title.includes("billing") || title.includes("payment")) return CreditCard;
  if (type === "workflow" || title.includes("workflow")) return Workflow;
  return Info;
}

function getNotificationAccent(notification: NotificationItem): string {
  const title = (notification.title || "").toLowerCase();
  const meta = notification.metadata as Record<string, unknown> | undefined;
  const type = (meta?.type as string) || "";

  if (type === "alert" || title.includes("alert") || title.includes("warning"))
    return "text-amber-500 bg-amber-500/10";
  if (type === "ai" || title.includes("ai") || title.includes("insight"))
    return "text-violet-500 bg-violet-500/10";
  if (type === "budget" || title.includes("budget"))
    return "text-emerald-500 bg-emerald-500/10";
  if (type === "billing" || title.includes("billing"))
    return "text-blue-500 bg-blue-500/10";
  return "text-primary bg-primary/10";
}

// ─── Filter Tabs ────────────────────────────────────────

type FilterTab = "all" | "unread" | "read";

// ─── Main Component ─────────────────────────────────────

export function NotificationCenter({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    isMarkingAllRead,
  } = useNotifications();

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => n.status === "unread");
    if (filter === "read") return notifications.filter((n) => n.status === "read");
    return notifications;
  }, [notifications, filter]);

  const grouped = useMemo(() => {
    const groups: Record<TimeGroup, NotificationItem[]> = {
      today: [],
      this_week: [],
      older: [],
    };
    for (const n of filteredNotifications) {
      groups[getTimeGroup(n.created_at)].push(n);
    }
    return groups;
  }, [filteredNotifications]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className="fixed top-0 right-0 bottom-0 z-[61] w-full sm:w-[420px] max-w-[90vw] bg-card border-l border-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
                  <Bell className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Notifications</h2>
                  <p className="text-xs text-muted-foreground">
                    {unreadCount > 0 ? `${unreadCount} unread` : "All caught up!"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllRead()}
                    disabled={isMarkingAllRead}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    data-testid="btn-mark-all-read"
                  >
                    <CheckCheck className="w-3.5 h-3.5 mr-1" />
                    Mark all read
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  data-testid="btn-close-notifications"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 px-5 py-2.5 border-b border-border">
              {(["all", "unread", "read"] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    filter === tab
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  data-testid={`filter-${tab}`}
                >
                  {tab === "all" ? "All" : tab === "unread" ? "Unread" : "Read"}
                  {tab === "unread" && unreadCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary-foreground/20 text-[10px] font-bold">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Notifications list */}
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <div className="w-8 h-8 rounded-full border-3 border-primary border-t-transparent animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading notifications…</p>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 px-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <Bell className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      {filter === "unread"
                        ? "No unread notifications"
                        : filter === "read"
                        ? "No read notifications"
                        : "No notifications yet"}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {filter === "unread"
                        ? "You're all caught up! 🎉"
                        : "Notifications from your transactions, budgets, AI insights, and workflows will appear here."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-1">
                  {(["today", "this_week", "older"] as TimeGroup[]).map((group) => {
                    const items = grouped[group];
                    if (items.length === 0) return null;
                    return (
                      <div key={group}>
                        <div className="sticky top-0 z-10 px-5 py-2 bg-card/95 backdrop-blur-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            {GROUP_LABELS[group]}
                          </p>
                        </div>
                        {items.map((notification, idx) => (
                          <NotificationRow
                            key={notification.id}
                            notification={notification}
                            onMarkRead={markRead}
                            index={idx}
                          />
                        ))}
                        <Separator className="mx-5 my-1" />
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Notification Row ───────────────────────────────────

function NotificationRow({
  notification,
  onMarkRead,
  index,
}: {
  notification: NotificationItem;
  onMarkRead: (id: string) => void;
  index: number;
}) {
  const Icon = getNotificationIcon(notification);
  const accent = getNotificationAccent(notification);
  const isUnread = notification.status === "unread";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className={`group relative px-5 py-3.5 transition-colors cursor-default ${
        isUnread
          ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
          : "hover:bg-accent/50"
      }`}
      data-testid={`notification-${notification.id}`}
    >
      {/* Unread indicator dot */}
      {isUnread && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      )}

      <div className="flex gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-sm leading-snug line-clamp-1 ${
                isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"
              }`}
            >
              {notification.title}
            </p>
            <span className="flex-shrink-0 text-[10px] text-muted-foreground/60 whitespace-nowrap mt-0.5">
              {timeAgo(notification.created_at)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
            {notification.message}
          </p>
        </div>

        {/* Mark as read */}
        {isUnread && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(notification.id);
            }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Mark as read"
            data-testid={`btn-mark-read-${notification.id}`}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Bell Button (to embed in Sidebar) ──────────────────

export function NotificationBell({
  onClick,
  unreadCount,
}: {
  onClick: () => void;
  unreadCount: number;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-accent text-muted-foreground hover:text-foreground"
      aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
      data-testid="btn-notification-bell"
    >
      <Bell className="w-5 h-5" />
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold shadow-sm"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

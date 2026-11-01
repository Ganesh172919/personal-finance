/**
 * @fileoverview Financial Calendar page -- visual day-by-day transaction view.
 *
 * Renders a full month calendar grid where each day cell shows income and
 * expense magnitude as colored bars, plus indicator dots for scheduled reminders.
 * Clicking a day opens a detail panel listing that day's transactions and
 * reminders, allowing one-click reminder creation with presets and direct
 * transaction logging for that specific date.
 *
 * Key data flows:
 * - Fetches transactions for the visible month via /v1/transactions?from=&to=.
 * - Fetches calendar reminders via /v1/calendar-reminders for the same range.
 * - Supports add, toggle-complete, and delete reminder mutations with toast feedback.
 * - Supports direct transaction creation for the selected calendar date.
 * - Monthly totals (income, expense, net) and reminder badges are computed
 *   client-side from active records.
 *
 * Currency formatting respects org-level settings from useAppConfig().
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  DollarSign,
  Plus,
  Bell,
  CheckCircle2,
  Trash2,
  ReceiptText,
  Download,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { apiClient } from "@/lib/api/core";
import { createTransaction } from "@/lib/api/transactions";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useToast } from "@/hooks/useToast";

// ─── Reminder & Transaction Types ──────────────────────────────────────

interface CalendarReminderItem {
  id: string;
  date: string;
  title: string;
  description: string;
  completed: boolean;
  created_at?: string;
}

interface CalendarTransaction {
  _id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  type: "income" | "expense" | "investment";
}

export interface RecurringCandidateItem {
  candidate_id: string;
  cadence: string;
  confidence: number;
  occurrences: number;
  description_sample?: string;
  amount_avg: number;
  last_seen_at?: string;
  category?: string;
  suggested_rule?: {
    name?: string;
    cron?: string;
    amount?: number;
    category?: string;
  };
}

const EMPTY_TRANSACTIONS: CalendarTransaction[] = [];

export const calendarDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const getTxDateKey = (dateVal: string | Date): string => {
  if (!dateVal) return "";
  if (typeof dateVal === "string") {
    if (dateVal.includes("T")) {
      return dateVal.split("T")[0];
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      return dateVal;
    }
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  return calendarDateKey(d);
};

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  transactions: CalendarTransaction[];
  totalIncome: number;
  totalExpense: number;
  net: number;
}

// ─── Presets ────────────────────────────────────────────

const REMINDER_PRESETS = [
  "Pay rent",
  "Credit card bill",
  "Utility bill",
  "SIP / Investment",
  "Salary deposit",
  "Insurance due",
];

const CATEGORY_PRESETS = [
  "Food & Dining",
  "Groceries",
  "Housing",
  "Utilities",
  "Transportation",
  "Shopping",
  "Entertainment",
  "Healthcare",
  "Investments",
  "Income",
];

// ─── Helpers ────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Pad start of month to fill week
  const startPad = firstDay.getDay(); // 0=Sun
  for (let i = startPad - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Days in month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Pad end to fill 6 weeks
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function formatCurrency(amount: number, locale = "en-US", currency = "USD"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Calendar Page ──────────────────────────────────────

export default function FinancialCalendar() {
  const today = new Date();
  const todayKey = today.toDateString();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const configQuery = useAppConfig();
  const orgCurrency = configQuery.data?.org?.currency || "USD";
  const orgLocale = configQuery.data?.org?.locale || "en-US";
  const fmt = (amount: number) => formatCurrency(amount, orgLocale, orgCurrency);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Reminder creation state
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState("");

  // Sync recurring bills state
  const [isSyncBillsOpen, setIsSyncBillsOpen] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isSyncingBills, setIsSyncingBills] = useState(false);

  // Fetch auto-detected recurring candidates
  const candidatesQuery = useQuery({
    queryKey: ["recurring-candidates"],
    queryFn: async () => {
      const result = await apiClient<{ candidates?: RecurringCandidateItem[] }>(
        "/finance/recurring/candidates?days_back=365&limit=20"
      );
      return (result?.candidates || []) as RecurringCandidateItem[];
    },
    staleTime: 60_000,
  });
  const recurringCandidates = candidatesQuery.data ?? [];

  const getProjectedDayForCandidate = (c: RecurringCandidateItem): number => {
    if (c.suggested_rule?.cron) {
      const parts = c.suggested_rule.cron.split(" ");
      const dom = parseInt(parts[2] || "", 10);
      if (!isNaN(dom) && dom >= 1 && dom <= 28) return dom;
    }
    if (c.last_seen_at) {
      const d = new Date(c.last_seen_at);
      if (!isNaN(d.getTime())) {
        return Math.max(1, Math.min(28, d.getDate()));
      }
    }
    return 15;
  };

  const getProjectedDateString = (day: number) => {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const handleSyncSelectedBills = async () => {
    const selected = recurringCandidates.filter((c) => selectedCandidateIds.includes(c.candidate_id));
    if (selected.length === 0) return;
    setIsSyncingBills(true);
    try {
      let added = 0;
      for (const c of selected) {
        const day = getProjectedDayForCandidate(c);
        const billDate = getProjectedDateString(day);
        const title = c.description_sample || c.suggested_rule?.name || "Recurring Bill";
        await apiClient("/calendar-reminders", {
          method: "POST",
          body: JSON.stringify({
            date: billDate,
            title: `${title} (${fmt(c.amount_avg)})`,
          }),
        });
        added++;
      }
      queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] });
      setIsSyncBillsOpen(false);
      toast({
        title: "Bills Synced",
        description: `Successfully scheduled ${added} recurring bill reminder${added > 1 ? "s" : ""} on your calendar.`,
      });
    } catch (err: any) {
      toast({
        title: "Sync Failed",
        description: err?.message || "Failed to schedule some bill reminders.",
        variant: "destructive",
      });
    } finally {
      setIsSyncingBills(false);
    }
  };

  const exportToIcs = () => {
    const remindersToExport = allReminders;
    if (remindersToExport.length === 0) {
      toast({
        title: "No Reminders Found",
        description: `No calendar reminders found for ${MONTH_NAMES[currentMonth]} ${currentYear} to export.`,
        variant: "destructive",
      });
      return;
    }

    const nowIso = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FinWise//Financial Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:FinWise Financial Calendar - ${MONTH_NAMES[currentMonth]} ${currentYear}`,
      "X-WR-TIMEZONE:UTC",
    ];

    for (const r of remindersToExport) {
      const dClean = r.date.replace(/-/g, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:finwise-reminder-${r.id}@finwise.dev`,
        `DTSTAMP:${nowIso}`,
        `DTSTART;VALUE=DATE:${dClean}`,
        `SUMMARY:${r.title.replace(/[\r\n]/g, " ")}`,
        `DESCRIPTION:${(r.description || r.title).replace(/[\r\n]/g, " ")}`,
        `STATUS:${r.completed ? "COMPLETED" : "CONFIRMED"}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT9H",
        "ACTION:DISPLAY",
        `DESCRIPTION:Reminder: ${r.title.replace(/[\r\n]/g, " ")}`,
        "END:VALARM",
        "END:VEVENT"
      );
    }

    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finwise-calendar-${currentYear}-${String(currentMonth + 1).padStart(2, "0")}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Calendar Exported",
      description: `Saved ${remindersToExport.length} reminders to finwise-calendar-${currentYear}-${String(currentMonth + 1).padStart(2, "0")}.ics for Google and Apple Calendar.`,
    });
  };

  // Transaction creation state
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [txForm, setTxForm] = useState<{
    type: "income" | "expense" | "investment";
    amount: string;
    category: string;
    description: string;
  }>({
    type: "expense",
    amount: "",
    category: "Food & Dining",
    description: "",
  });

  // Fetch transactions for the month range
  const startDate = new Date(currentYear, currentMonth, 1);
  const endDate = new Date(currentYear, currentMonth + 1, 0);
  const fromStr = calendarDateKey(startDate);
  const toStr = calendarDateKey(endDate);

  // Fetch reminders for the month
  const remindersQuery = useQuery({
    queryKey: ["calendar-reminders", currentYear, currentMonth],
    queryFn: async () => {
      const result = await apiClient(`/calendar-reminders?from=${fromStr}&to=${toStr}`);
      return ((result as any)?.reminders || []) as CalendarReminderItem[];
    },
    staleTime: 15_000,
  });
  const allReminders = remindersQuery.data ?? [];

  const addReminderMutation = useMutation({
    mutationFn: async ({ date, title }: { date: string; title: string }) => {
      return apiClient("/calendar-reminders", {
        method: "POST",
        body: JSON.stringify({ date, title }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] });
      toast({
        title: "Reminder Added",
        description: `Scheduled "${variables.title}" for ${variables.date}.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to add reminder",
        description: err?.message || "Please check the entered values.",
        variant: "destructive",
      });
    },
  });

  const toggleReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient(`/calendar-reminders/${id}/toggle`, { method: "PATCH" });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] });
      const completed = data?.reminder?.completed;
      toast({
        title: completed ? "Reminder Completed" : "Reminder Reopened",
        description: data?.reminder?.title,
      });
    },
  });

  const deleteReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient(`/calendar-reminders/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] });
      toast({
        title: "Reminder Deleted",
      });
    },
  });

  const transactionsQuery = useQuery({
    queryKey: ["calendar-transactions", currentYear, currentMonth],
    queryFn: async () => {
      const from = calendarDateKey(startDate);
      const to = calendarDateKey(endDate);
      const rows: CalendarTransaction[] = [];
      let page = 1;
      while (true) {
        const result = await apiClient<{ transactions: CalendarTransaction[]; pagination: { totalPages: number } }>(
          `/transactions?from=${from}&to=${to}&limit=100&page=${page}`
        );
        rows.push(...result.transactions);
        if (page >= result.pagination.totalPages) break;
        page += 1;
      }
      return rows;
    },
    staleTime: 30_000,
  });

  const transactions: CalendarTransaction[] = transactionsQuery.data ?? EMPTY_TRANSACTIONS;

  // Build calendar grid
  const calendarDays = useMemo((): CalendarDay[] => {
    const days = getDaysInMonth(currentYear, currentMonth);
    const txByDate = new Map<string, CalendarTransaction[]>();

    for (const tx of transactions) {
      const dateKey = getTxDateKey(tx.date);
      if (!txByDate.has(dateKey)) txByDate.set(dateKey, []);
      txByDate.get(dateKey)!.push(tx);
    }

    return days.map((date) => {
      const dateKey = calendarDateKey(date);
      const dayTxs = txByDate.get(dateKey) || [];
      const totalIncome = dayTxs
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const totalExpense = dayTxs
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      return {
        date,
        isCurrentMonth: date.getMonth() === currentMonth,
        isToday: date.toDateString() === todayKey,
        transactions: dayTxs,
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
      };
    });
  }, [currentYear, currentMonth, transactions, todayKey]);

  const selectedDay = selectedDate
    ? calendarDays.find((d) => calendarDateKey(d.date) === selectedDate)
    : null;

  // Monthly totals
  const monthlyIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const monthlyExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const monthlyNet = monthlyIncome - monthlyExpense;

  const navigateMonth = (delta: number) => {
    const newDate = new Date(currentYear, currentMonth + delta, 1);
    setCurrentMonth(newDate.getMonth());
    setCurrentYear(newDate.getFullYear());
    setSelectedDate(null);
  };

  // Add transaction mutation
  const createTxMutation = useMutation({
    mutationFn: async (payload: {
      amount: number;
      category: string;
      description: string;
      type: "income" | "expense" | "investment";
      date: string;
    }) => {
      return createTransaction(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setIsAddTxOpen(false);
      setTxForm({ type: "expense", amount: "", category: "Food & Dining", description: "" });
      toast({
        title: "Transaction Added",
        description: `Recorded for ${selectedDate}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to add transaction",
        description: err?.message || "Please check the entered values.",
        variant: "destructive",
      });
    },
  });

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !txForm.amount || !txForm.description) return;
    const num = parseFloat(txForm.amount);
    if (isNaN(num) || num <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a positive numeric amount.",
        variant: "destructive",
      });
      return;
    }
    createTxMutation.mutate({
      amount: num,
      category: txForm.category.trim(),
      description: txForm.description.trim(),
      type: txForm.type,
      date: selectedDate,
    });
  };

  const selectedDayReminders = selectedDate
    ? allReminders.filter((r) => r.date === selectedDate)
    : [];

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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              Financial Calendar
            </motion.h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visualize your transactions and reminders day by day
            </p>
          </div>

          {/* Month summary pill */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-emerald-500">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="font-medium">{fmt(monthlyIncome)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-rose-500">
              <TrendingDown className="w-3.5 h-3.5" />
              <span className="font-medium">{fmt(monthlyExpense)}</span>
            </div>
            <Badge variant={monthlyNet >= 0 ? "default" : "destructive"} className="text-xs">
              {monthlyNet >= 0 ? "+" : ""}{fmt(monthlyNet)}
            </Badge>
            {allReminders.length > 0 && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Bell className="w-3 h-3 text-amber-500" />
                {allReminders.filter((r) => !r.completed).length} pending
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
          {/* Calendar Grid */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigateMonth(-1)}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <CardTitle className="text-lg font-semibold min-w-[180px] text-center" data-testid="calendar-month-heading">
                    {MONTH_NAMES[currentMonth]} {currentYear}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigateMonth(1)}
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs flex items-center gap-1.5"
                    onClick={() => {
                      setSelectedCandidateIds(recurringCandidates.map((c) => c.candidate_id));
                      setIsSyncBillsOpen(true);
                    }}
                    data-testid="sync-bills-trigger-btn"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Sync Bills</span>
                    {recurringCandidates.length > 0 && (
                      <span
                        className="px-1.5 py-0.2 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold text-[10px] rounded-full"
                        data-testid="recurring-candidates-count"
                      >
                        {recurringCandidates.length}
                      </span>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs flex items-center gap-1.5"
                    onClick={exportToIcs}
                    data-testid="export-calendar-ics-btn"
                    title="Export to Google & Apple Calendar (.ics)"
                  >
                    <Download className="w-3.5 h-3.5 text-primary" />
                    <span>Export .ics</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setCurrentMonth(today.getMonth());
                      setCurrentYear(today.getFullYear());
                      setSelectedDate(null);
                    }}
                  >
                    Today
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {DAY_NAMES.map((day) => (
                  <div key={day} className="text-[11px] font-semibold text-muted-foreground/60 text-center py-1 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map((day, idx) => {
                  const dateKey = calendarDateKey(day.date);
                  const isSelected = selectedDate === dateKey;
                  const hasTx = day.transactions.length > 0;
                  const dayReminders = allReminders.filter((r) => r.date === dateKey);
                  const hasIncompleteReminder = dayReminders.some((r) => !r.completed);

                  return (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                      className={`
                        relative aspect-square rounded-lg p-1.5 text-left transition-colors flex flex-col
                        ${!day.isCurrentMonth ? "opacity-30" : ""}
                        ${day.isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}
                        ${isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"}
                      `}
                      data-testid={`cal-day-${dateKey}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-xs font-medium ${day.isToday ? "text-primary font-bold" : "text-foreground"}`}>
                          {day.date.getDate()}
                        </span>
                        {dayReminders.length > 0 && day.isCurrentMonth && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              hasIncompleteReminder ? "bg-amber-500 shadow-sm shadow-amber-500/50" : "bg-emerald-500"
                            }`}
                            title={`${dayReminders.length} reminder${dayReminders.length > 1 ? "s" : ""}`}
                            data-testid={`reminder-indicator-${dateKey}`}
                          />
                        )}
                      </div>

                      {hasTx && day.isCurrentMonth && (
                        <div className="flex-1 flex flex-col justify-end gap-0.5 mt-0.5">
                          {day.totalIncome > 0 && (
                            <div
                              className="h-1 rounded-full bg-emerald-500/70"
                              style={{ width: `${Math.min(100, (day.totalIncome / Math.max(monthlyIncome, 1)) * 400)}%` }}
                              title={`Income: ${fmt(day.totalIncome)}`}
                            />
                          )}
                          {day.totalExpense > 0 && (
                            <div
                              className="h-1 rounded-full bg-rose-500/70"
                              style={{ width: `${Math.min(100, (day.totalExpense / Math.max(monthlyExpense, 1)) * 400)}%` }}
                              title={`Expense: ${fmt(day.totalExpense)}`}
                            />
                          )}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 mt-3 pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-1.5 rounded-full bg-emerald-500" />
                  Income
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-1.5 rounded-full bg-rose-500" />
                  Expense
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  Pending Reminder
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Completed Reminder
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Day Detail Panel */}
          <Card className="h-fit sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-primary" />
                  {selectedDay
                    ? selectedDay.date.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Select a day"
                  }
                </CardTitle>
                {selectedDay && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setIsAddTxOpen(true)}
                    data-testid="button-add-calendar-tx"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Tx
                  </Button>
                )}
              </div>
              {selectedDay && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {selectedDay.transactions.length} tx{selectedDay.transactions.length !== 1 ? "s" : ""}
                  </Badge>
                  {selectedDayReminders.length > 0 && (
                    <Badge variant="secondary" className="text-[11px] font-normal flex items-center gap-1">
                      <Bell className="w-2.5 h-2.5 text-amber-500" />
                      {selectedDayReminders.length} reminder{selectedDayReminders.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {selectedDay.net !== 0 && (
                    <span className={`text-xs font-medium ml-auto ${selectedDay.net >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      Net: {selectedDay.net >= 0 ? "+" : ""}{fmt(selectedDay.net)}
                    </span>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {!selectedDay ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                    <CalendarIcon className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click on a day in the calendar to see transactions and reminders
                  </p>
                </div>
              ) : selectedDay.transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center border rounded-lg border-dashed bg-muted/10 mb-4">
                  <DollarSign className="w-7 h-7 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No transactions recorded for this day</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs mt-2 text-primary hover:text-primary"
                    onClick={() => setIsAddTxOpen(true)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Record an expense or income
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto mb-4 pr-1">
                  {selectedDay.transactions.map((tx, idx) => (
                    <motion.div
                      key={tx._id || idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center justify-between py-2 px-2.5 rounded-lg border border-border/40 hover:bg-accent/50 transition-colors"
                      data-testid={`calendar-tx-item-${tx._id || idx}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                        <p className="text-[10px] text-muted-foreground">{tx.category}</p>
                      </div>
                      <span className={`text-sm font-semibold flex-shrink-0 ml-2 ${
                        tx.type === "income"
                          ? "text-emerald-500"
                          : tx.type === "expense"
                          ? "text-rose-500"
                          : "text-blue-500"
                      }`}>
                        {tx.type === "income" ? "+" : "-"}{fmt(Math.abs(tx.amount))}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>

            {/* Reminders Section */}
            {selectedDate && (
              <div className="px-6 pb-6 pt-2 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Bell className="w-3.5 h-3.5 text-amber-500" />
                    Reminders
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setShowAddReminder(!showAddReminder)}
                    aria-label="Add reminder"
                    data-testid="button-toggle-add-reminder"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {showAddReminder && (
                  <div className="mb-3 space-y-2">
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newReminderTitle.trim() && selectedDate) {
                          addReminderMutation.mutate({ date: selectedDate, title: newReminderTitle.trim() });
                          setNewReminderTitle("");
                          setShowAddReminder(false);
                        }
                      }}
                    >
                      <Input
                        value={newReminderTitle}
                        onChange={(e) => setNewReminderTitle(e.target.value)}
                        placeholder="e.g. Pay rent, Insurance due..."
                        className="h-8 text-xs"
                        autoFocus
                        data-testid="input-reminder-title"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!newReminderTitle.trim() || addReminderMutation.isPending}
                        data-testid="button-submit-reminder"
                      >
                        Add
                      </Button>
                    </form>
                    <div className="flex flex-wrap gap-1">
                      {REMINDER_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewReminderTitle(preset)}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  if (selectedDayReminders.length === 0 && !showAddReminder) {
                    return (
                      <p className="text-[10px] text-muted-foreground/60">
                        No reminders set for this day. Click + to add one.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      {selectedDayReminders.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/50 transition-colors group border border-border/30"
                          data-testid={`reminder-row-${r.id}`}
                        >
                          <button
                            className="flex-shrink-0"
                            onClick={() => toggleReminderMutation.mutate(r.id)}
                            title={r.completed ? "Mark incomplete" : "Mark complete"}
                            data-testid={`reminder-toggle-${r.id}`}
                          >
                            <CheckCircle2 className={`w-4 h-4 ${r.completed ? "text-emerald-500" : "text-muted-foreground/30 hover:text-muted-foreground"}`} />
                          </button>
                          <span className={`text-xs flex-1 ${r.completed ? "line-through text-muted-foreground" : "text-foreground font-medium"}`}>
                            {r.title}
                          </span>
                          <button
                            className="flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-destructive/10 rounded"
                            onClick={() => deleteReminderMutation.mutate(r.id)}
                            title="Delete reminder"
                            data-testid={`reminder-delete-${r.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400 hover:text-rose-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Add Transaction Dialog */}
      <Dialog open={isAddTxOpen} onOpenChange={setIsAddTxOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-add-calendar-tx">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-primary" />
              Add Transaction
            </DialogTitle>
            <DialogDescription>
              Record a transaction for {selectedDate}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddTransaction} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["expense", "income", "investment"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={txForm.type === t ? "default" : "outline"}
                    size="sm"
                    className="capitalize text-xs"
                    onClick={() => setTxForm({ ...txForm, type: t })}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-amount">Amount ({orgCurrency})</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                required
                data-testid="input-calendar-tx-amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-category">Category</Label>
              <Input
                id="tx-category"
                placeholder="e.g. Groceries"
                value={txForm.category}
                onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                required
                data-testid="input-calendar-tx-category"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {CATEGORY_PRESETS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTxForm({ ...txForm, category: cat })}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-description">Description</Label>
              <Input
                id="tx-description"
                placeholder="e.g. Whole Foods run"
                value={txForm.description}
                onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                required
                data-testid="input-calendar-tx-description"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={createTxMutation.isPending || !txForm.amount || !txForm.description}
              data-testid="button-submit-calendar-tx"
            >
              {createTxMutation.isPending ? "Adding..." : "Save Transaction"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sync Recurring Bills to Calendar Dialog */}
      <Dialog open={isSyncBillsOpen} onOpenChange={setIsSyncBillsOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-sync-recurring-bills">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Sync Recurring Bills to Calendar
            </DialogTitle>
            <DialogDescription>
              Auto-detected recurring bills from your transaction history. Select which bills to schedule as reminders for {MONTH_NAMES[currentMonth]} {currentYear}.
            </DialogDescription>
          </DialogHeader>

          {recurringCandidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground" data-testid="no-recurring-candidates">
              <p className="font-medium text-foreground">No recurring bill patterns detected yet</p>
              <p className="text-xs mt-1">
                Log at least 3 recurring transactions (e.g. Netflix, Rent, Utilities, Subscriptions) to auto-detect bills.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground pb-1.5 border-b">
                <span>{selectedCandidateIds.length} of {recurringCandidates.length} selected</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setSelectedCandidateIds(recurringCandidates.map((c) => c.candidate_id))}
                    data-testid="btn-select-all-bills"
                  >
                    Select All
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setSelectedCandidateIds([])}
                    data-testid="btn-clear-all-bills"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {recurringCandidates.map((cand) => {
                  const day = getProjectedDayForCandidate(cand);
                  const isSelected = selectedCandidateIds.includes(cand.candidate_id);
                  return (
                    <div
                      key={cand.candidate_id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                        isSelected ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedCandidateIds(selectedCandidateIds.filter((id) => id !== cand.candidate_id));
                        } else {
                          setSelectedCandidateIds([...selectedCandidateIds, cand.candidate_id]);
                        }
                      }}
                      data-testid={`bill-candidate-${cand.candidate_id}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                        />
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {cand.description_sample || cand.suggested_rule?.name || "Recurring Bill"}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                              {cand.cadence}
                            </Badge>
                            <span>Projected day {day} of month</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        {fmt(cand.amount_avg)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => setIsSyncBillsOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedCandidateIds.length === 0 || isSyncingBills}
              onClick={handleSyncSelectedBills}
              data-testid="confirm-sync-bills-btn"
            >
              {isSyncingBills ? "Syncing..." : `Sync ${selectedCandidateIds.length} Bills to Calendar`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

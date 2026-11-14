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

import { useState, useMemo, useCallback } from "react";
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
  CheckCheck,
  Trash2,
  ReceiptText,
  Download,
  Sparkles,
  Globe,
  ShieldAlert,
  Zap,
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
import { createTask } from "@/lib/api/tasks";
import {
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  FX_RATES_TO_USD,
  SUPPORTED_CURRENCIES,
  convertUsdToCurrency,
  type SupportedCurrency,
} from "@/lib/currencyFx";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useToast } from "@/hooks/useToast";

// ─── Reminder & Transaction Types ──────────────────────────────────────

// Represents a scheduled calendar reminder event for upcoming financial obligations.
// Tracks due dates, completion states, descriptive titles, and unique identifiers.
// Rendered on specific calendar day tiles and interactive side-drawers.
interface CalendarReminderItem {
  id: string;
  date: string;
  title: string;
  description: string;
  completed: boolean;
  created_at?: string;
}

// Represents a recorded financial transaction associated with a calendar day.
// Includes amount, spending category, transaction date, and movement type.
// Used to compute daily and monthly income, expense, and net totals.
interface CalendarTransaction {
  _id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  type: "income" | "expense" | "investment";
}

// Details candidate recurring transaction patterns detected by machine learning.
// Captures cadence, occurrence counts, average amounts, and model confidence.
// Enables users to promote detected patterns into scheduled calendar rules.
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


// Extracts numerical currency amounts from reminder titles or descriptions.
// Uses regex matching for currency symbols and numeric string patterns.
// Enforces reasonable upper bounds to prevent erroneous parsing anomalies.
export const extractAmountFromReminder = (title: string, desc?: string): number => {
  const match = (title + " " + (desc || "")).match(/(?:\bUSD\s*|(?<![A-Za-z])\$)\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i);
  if (match && match[1]) {
    const parsed = parseFloat(match[1].replace(/,/g, ""));
    if (parsed > 0 && parsed < 1_000_000) return parsed;
  }
  return 0;
};

// Empty fallback array constant for days without recorded transactions.
// Avoids reallocating empty array instances across calendar cell renders.
// Maintains reference stability during daily financial balance aggregations.
const EMPTY_TRANSACTIONS: CalendarTransaction[] = [];

// Converts a JavaScript Date object into a YYYY-MM-DD date key.
// Normalizes single-digit months and days with leading zeros.
// Serves as the primary lookup key for calendar events and day cells.
export const calendarDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Extracts or normalizes a calendar date key from string or Date representations.
// Supports ISO datetime strings, pure date strings, and native Date instances.
// Returns an empty string if the incoming date value is invalid or null.
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

// Defines the data structure representing a single day cell on the calendar grid.
// Holds day date, boundary flags, associated transactions, and net cash sums.
// Supplies computed metrics directly to calendar day view components.
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

// Standard reminder title suggestions for frequent financial bills and deposits.
// Provides fast one-click presets when adding reminders in dialogs.
// Speeds up bill scheduling for rent, credit cards, utilities, and investments.
const REMINDER_PRESETS = [
  "Pay rent",
  "Credit card bill",
  "Utility bill",
  "SIP / Investment",
  "Salary deposit",
  "Insurance due",
];

// Common category options available for tagging reminders and quick transactions.
// Aligns recurring reminder events with core budget classification buckets.
// Offers structured categorization options during manual entry.
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

// Calculates the 42-day calendar matrix including adjacent padding days.
// Padds the start of the month to begin on Sunday and trailing days to end the grid.
// Produces a consistent six-week calendar view for any given month and year.
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

// Whole amounts render without decimals ($1,000); any amount with cents always shows
// two decimals ($1,000.10, never $1,000.1).
// Determines appropriate decimal fraction digits based on whether cents exist.
// Returns 0 for whole integer dollar amounts and 2 when fractional cents are present.
// Prevents cluttered formatting while maintaining precision for uneven sums.
function fractionDigitsFor(amount: number): number {
  return Math.round(Math.abs(Number(amount) || 0) * 100) % 100 === 0 ? 0 : 2;
}

// Formats numeric currency values using localized Intl.NumberFormat rules.
// Dynamically adjusts fraction digits based on whether fractional cents are present.
// Provides clean monetary presentation across all calendar headers and cards.
function formatCurrency(amount: number, locale = "en-US", currency = "USD"): string {
  const digits = fractionDigitsFor(amount);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

// Sanitizes and escapes raw text strings for inclusion in iCalendar files.
// Handles special characters like semicolons, commas, backslashes, and newlines.
// Complies with RFC 5545 format requirements for ICS subscription feeds.
/** Escape a TEXT property value per RFC 5545 section 3.3.11. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Array of English month names indexed from January (0) to December (11).
// Used for calendar navigation headers and formatted date range titles.
// Provides human-readable calendar header display strings.
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Abbreviated weekday column header labels ordered from Sunday to Saturday.
// Renders the top header row for monthly calendar grid tables.
// Guides users in reading day-of-week associations across all weeks.
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Calendar Page ──────────────────────────────────────

// Financial calendar page providing daily cashflow tracking and bill reminders.
// Integrates transaction history, detected recurring candidates, and ICS feeds.
// Allows interactive inspection and management of daily financial events.
export default function FinancialCalendar() {
  const today = new Date();
  const todayKey = today.toDateString();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const configQuery = useAppConfig();
  const orgLocale = configQuery.data?.org?.locale || "en-US";
  const [selectedReportingCurrency, setSelectedReportingCurrency] = useState<SupportedCurrency>("USD");
  const [liquidityBufferThreshold, setLiquidityBufferThreshold] = useState<number>(1000);
  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({});
  const openingMonth = `${currentYear}-${currentMonth}`;
  const openingBalance = openingBalances[openingMonth] ?? "";

  const activeSymbol = CURRENCY_SYMBOLS[selectedReportingCurrency] || "$";
  const fmt = useCallback(
    (amountUsd: number) => {
      if (selectedReportingCurrency === "USD") {
        return formatCurrency(amountUsd, orgLocale, "USD");
      }
      const converted = convertUsdToCurrency(amountUsd, selectedReportingCurrency);
      const rounded =
        selectedReportingCurrency === "JPY"
          ? Math.round(converted).toLocaleString()
          : Number(converted || 0).toLocaleString(undefined, {
              minimumFractionDigits: fractionDigitsFor(converted),
              maximumFractionDigits: fractionDigitsFor(converted),
            });
      return `${activeSymbol}${rounded}`;
    },
    [selectedReportingCurrency, orgLocale, activeSymbol]
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createProtectionTaskMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createTask>[0]) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Protection Task Created",
        description: "Action task added to your Tasks workspace.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to create task",
        description: err?.message || "Please check your network connection.",
        variant: "destructive",
      });
    },
  });

  const batchCompleteRemindersMutation = useMutation({
    mutationFn: async () => {
      return apiClient("/calendar-reminders/batch-complete", {
        method: "POST",
        body: JSON.stringify({ from: fromStr, to: toStr }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] });
      toast({
        title: "All Reminders Completed",
        description: `Marked ${data?.updated || 0} reminder(s) as completed for this month.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Batch Complete Failed",
        description: err?.message || "Could not complete reminders.",
        variant: "destructive",
      });
    },
  });

  const clearCompletedRemindersMutation = useMutation({
    mutationFn: async () => {
      return apiClient("/calendar-reminders/clear-completed", {
        method: "POST",
        body: JSON.stringify({ from: fromStr, to: toStr }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] });
      toast({
        title: "Completed Reminders Cleared",
        description: `Removed ${data?.deleted || 0} completed reminder(s) from this month.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Clear Completed Failed",
        description: err?.message || "Could not clear reminders.",
        variant: "destructive",
      });
    },
  });

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
      // Use the stored calendar date (UTC date part), not the local getDate(), so users
      // west of UTC don't see the bill projected one day early.
      const dom = parseInt(getTxDateKey(c.last_seen_at).slice(8, 10), 10);
      if (!isNaN(dom)) {
        return Math.max(1, Math.min(28, dom));
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
        `SUMMARY:${escapeIcsText(r.title)}`,
        `DESCRIPTION:${escapeIcsText(r.description || r.title)}`,
        // VEVENT STATUS only allows TENTATIVE/CONFIRMED/CANCELLED (COMPLETED is VTODO-only).
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "TRIGGER:-PT9H",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcsText(`Reminder: ${r.title}`)}`,
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
  const allReminders = useMemo(() => remindersQuery.data ?? [], [remindersQuery.data]);

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
  const hasOpeningBalance = openingBalance.trim() !== "" && Number.isFinite(Number(openingBalance));
  const forecastAvailable = hasOpeningBalance && !transactionsQuery.isPending && !remindersQuery.isPending &&
    !transactionsQuery.isError && !remindersQuery.isError;

  // Day-by-Day Liquidity Buffer Forecast & Dip Detection
  const liquidityForecast = useMemo(() => {
    const startingReserve = hasOpeningBalance ? Number(openingBalance) : 0;
    const daysInMonthCount = new Date(currentYear, currentMonth + 1, 0).getDate();
    let runningCash = startingReserve;
    let lowestCash = startingReserve;
    let lowestDay = 1;
    let deficitDays = 0;
    const dailyRunningBalances: Record<string, number> = {};
    const dipDays = new Set<string>();

    for (let day = 1; day <= daysInMonthCount; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const dayTxs = transactions.filter((t) => getTxDateKey(t.date) === dateKey);
      const dayIncome = dayTxs.filter((t) => t.type === "income").reduce((s, t) => s + Math.abs(t.amount), 0);
      const dayExpense = dayTxs.filter((t) => t.type === "expense" || t.type === "investment").reduce((s, t) => s + Math.abs(t.amount), 0);

      const dayReminders = allReminders.filter((r) => r.date === dateKey && !r.completed);
      const dayRemindersExpense = dayReminders.reduce((s, r) => s + extractAmountFromReminder(r.title, r.description), 0);

      runningCash += dayIncome - dayExpense - dayRemindersExpense;
      dailyRunningBalances[dateKey] = runningCash;

      if (runningCash < lowestCash) {
        lowestCash = runningCash;
        lowestDay = day;
      }

      if (runningCash < liquidityBufferThreshold) {
        deficitDays++;
        dipDays.add(dateKey);
      }
    }

    const monthEndBalance = runningCash;
    const lowestProjectedCash = lowestCash;

    let liquidityStatus: "safe" | "caution" | "critical" = "safe";
    let statusLabel = "Estimated above buffer";
    if (lowestProjectedCash < 0) {
      liquidityStatus = "critical";
      statusLabel = "Estimated negative balance";
    } else if (deficitDays > 0) {
      liquidityStatus = "caution";
      statusLabel = "Estimated below buffer";
    }

    return {
      startingReserve,
      lowestProjectedCash,
      lowestDay,
      monthEndBalance,
      deficitDays,
      dipDays,
      dailyRunningBalances,
      liquidityStatus,
      statusLabel,
    };
  }, [currentYear, currentMonth, transactions, allReminders, liquidityBufferThreshold, hasOpeningBalance, openingBalance]);

  const handleScheduleLiquidityTask = () => {
    if (!forecastAvailable) return;
    const { lowestProjectedCash, deficitDays, lowestDay } = liquidityForecast;
    const dipDateStr = `${MONTH_NAMES[currentMonth]} ${lowestDay}, ${currentYear}`;

    createProtectionTaskMutation.mutate({
      title: `Liquidity Protection: Safeguard ${fmt(liquidityBufferThreshold)} buffer for ${MONTH_NAMES[currentMonth]}`,
      why: `Projected cash position reaches a low of ${fmt(lowestProjectedCash)} on ${dipDateStr} across ${deficitDays} day(s), risking a dip below your ${fmt(liquidityBufferThreshold)} reserve buffer.`,
      steps: [
        `Audit scheduled bills leading up to ${dipDateStr} in FinWise Financial Calendar`,
        `Transfer supplemental liquidity to primary operating account before ${dipDateStr}`,
        `Pause non-essential discretionary expenditures until cash reserve stabilizes above ${fmt(liquidityBufferThreshold)}`,
      ],
      priority: "high",
      expected_impact: `Maintains continuous cash solvency and prevents overdraft penalties across all ${deficitDays} vulnerable calendar days.`,
      kind: "cashflow",
      bucket: 30,
      due_days: 7,
    });
  };

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
        {/* Global Multi-Currency FX Normalization Cockpit */}
        <Card className="p-4 mb-6 border-border/70 bg-card/60 backdrop-blur-sm" data-testid="card-calendar-currency-normalization">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Global Currency Normalization Cockpit</h3>
                <Badge variant="outline" className="text-xs font-semibold" data-testid="badge-calendar-reporting-currency">
                  Reporting: {selectedReportingCurrency} ({CURRENCY_SYMBOLS[selectedReportingCurrency]})
                </Badge>
                {selectedReportingCurrency !== "USD" && (
                  <Badge variant="secondary" className="text-xs font-mono" data-testid="badge-calendar-fx-rate">
                    1 USD = {FX_RATES_TO_USD[selectedReportingCurrency]} {selectedReportingCurrency}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] text-muted-foreground" data-testid="badge-calendar-fx-status">
                  Fixed reference rates
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Display estimates using fixed reference rates. Recorded transactions and opening balances use USD.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-1">
                {SUPPORTED_CURRENCIES.map((curr) => (
                  <Button
                    key={curr}
                    type="button"
                    variant={selectedReportingCurrency === curr ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2.5 font-medium"
                    data-testid={`btn-calendar-currency-${curr}`}
                    onClick={() => setSelectedReportingCurrency(curr)}
                  >
                    {curr}
                  </Button>
                ))}
              </div>

              <select
                data-testid="select-calendar-currency"
                value={selectedReportingCurrency}
                onChange={(e) => setSelectedReportingCurrency(e.target.value as SupportedCurrency)}
                className="h-7 text-xs rounded-md border border-input bg-background px-2 py-0.5 text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SUPPORTED_CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {CURRENCY_LABELS[curr]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Real-Time Daily Cash Flow Forecasting & Liquidity Buffer Protection Cockpit */}
        <Card className="p-5 mb-6 border-border/70 bg-card/60 backdrop-blur-sm space-y-4" data-testid="card-calendar-liquidity-forecast">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-foreground">
                  Calendar cash estimate
                </h3>
                <Badge
                  variant={!forecastAvailable || liquidityForecast.liquidityStatus === "safe" ? "outline" : "destructive"}
                  className="text-xs font-semibold"
                  data-testid="metric-liquidity-status"
                >
                  {!hasOpeningBalance ? "Enter opening balance" : !forecastAvailable ? "Estimate unavailable" : liquidityForecast.statusLabel}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter this month's opening balance as a planning assumption. Includes recorded cash flows and USD-labelled pending reminder amounts; unpriced reminders are excluded.
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              data-testid="btn-schedule-liquidity-task"
              onClick={handleScheduleLiquidityTask}
              disabled={createProtectionTaskMutation.isPending || !forecastAvailable}
              className="shrink-0 flex items-center gap-1.5 font-medium"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Plan a cash buffer task</span>
            </Button>
          </div>

          <div className="p-3 rounded-lg bg-accent/40 border border-border/50 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="input-opening-balance">Opening balance (USD)</Label>
              <Input id="input-opening-balance" type="number" step="0.01" value={openingBalance}
                onChange={event => setOpeningBalances(previous => ({ ...previous, [openingMonth]: event.target.value }))}
                placeholder="Enter an amount" className="h-9 w-36" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="input-liquidity-buffer" className="text-xs font-medium">Safety buffer (USD)</Label>
              <Input
                id="input-liquidity-buffer"
                data-testid="input-liquidity-buffer"
                type="number"
                min="0"
                step="250"
                value={liquidityBufferThreshold}
                onChange={(e) => setLiquidityBufferThreshold(Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-7 w-24 text-xs text-center"
              />
              <div className="flex items-center gap-1">
                {[500, 1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setLiquidityBufferThreshold(amt)}
                    className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                      liquidityBufferThreshold === amt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 hover:bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Opening assumption: <span className="font-semibold text-foreground">{hasOpeningBalance ? fmt(liquidityForecast.startingReserve) : "Not entered"}</span>
            </div>
          </div>

          {forecastAvailable && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-card border border-border/70 space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Lowest Projected Cash
              </div>
              <div
                className={`text-lg font-bold ${
                  liquidityForecast.lowestProjectedCash < 0
                    ? "text-rose-500"
                    : liquidityForecast.lowestProjectedCash < liquidityBufferThreshold
                    ? "text-amber-500"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
                data-testid="metric-lowest-projected-cash"
              >
                {fmt(liquidityForecast.lowestProjectedCash)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Occurs on Day {liquidityForecast.lowestDay} of {MONTH_NAMES[currentMonth]}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-card border border-border/70 space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Projected Month-End Balance
              </div>
              <div className="text-lg font-bold text-foreground" data-testid="metric-projected-month-end-balance">
                {fmt(liquidityForecast.monthEndBalance)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Estimated change: {fmt(liquidityForecast.monthEndBalance - liquidityForecast.startingReserve)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-card border border-border/70 space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Deficit & Dip Days
              </div>
              <div
                className={`text-lg font-bold ${
                  liquidityForecast.deficitDays > 0 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"
                }`}
                data-testid="metric-deficit-days-count"
              >
                {liquidityForecast.deficitDays} day{liquidityForecast.deficitDays === 1 ? "" : "s"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {liquidityForecast.deficitDays > 0 ? "Below buffer in this estimate" : "Above buffer in this estimate"}
              </div>
            </div>
          </div>}
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
          {/* Calendar Grid */}
          <Card>
            <CardHeader className="pb-2">
              {/* Wrap so Sync Bills / Export .ics stay reachable on narrow (390px) screens. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                        <div className="flex items-center gap-1">
                          {forecastAvailable && liquidityForecast.dipDays.has(dateKey) && day.isCurrentMonth && (
                            <span
                              className="text-[9px] font-bold px-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0"
                              title={`Liquidity Dip: Running cash drops to ${fmt(liquidityForecast.dailyRunningBalances[dateKey] || 0)}`}
                              data-testid={`badge-liquidity-dip-${dateKey}`}
                            >
                              Dip
                            </span>
                          )}
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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => batchCompleteRemindersMutation.mutate()}
                      disabled={batchCompleteRemindersMutation.isPending || allReminders.filter((r) => !r.completed).length === 0}
                      data-testid="btn-complete-all-reminders"
                      title="Mark all pending reminders in month as completed"
                    >
                      <CheckCheck className="w-3 h-3 mr-1" />
                      Complete All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => clearCompletedRemindersMutation.mutate()}
                      disabled={clearCompletedRemindersMutation.isPending || allReminders.filter((r) => r.completed).length === 0}
                      data-testid="btn-clear-completed-reminders"
                      title="Clear all completed reminders in month"
                    >
                      Clear Completed
                    </Button>
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
              <Label htmlFor="tx-amount">Amount (USD)</Label>
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

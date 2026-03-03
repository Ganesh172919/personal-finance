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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { apiClient } from "@/lib/api/core";
import { useAppConfig } from "@/hooks/useAppConfig";
import { Input } from "@/components/ui/Input";

// ─── Reminder type ──────────────────────────────────────

interface CalendarReminderItem {
  id: string;
  date: string;
  title: string;
  description: string;
  completed: boolean;
  created_at?: string;
}

// ─── Types ──────────────────────────────────────────────

interface CalendarTransaction {
  _id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  type: "income" | "expense" | "investment";
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  transactions: CalendarTransaction[];
  totalIncome: number;
  totalExpense: number;
  net: number;
}

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
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const configQuery = useAppConfig();
  const orgCurrency = configQuery.data?.org?.currency || "USD";
  const orgLocale = configQuery.data?.org?.locale || "en-US";
  const fmt = (amount: number) => formatCurrency(amount, orgLocale, orgCurrency);
  const queryClient = useQueryClient();

  // Reminder state
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState("");

  // Fetch transactions for the month range
  const startDate = new Date(currentYear, currentMonth, 1);
  const endDate = new Date(currentYear, currentMonth + 1, 0);
  const fromStr = startDate.toISOString().split("T")[0];
  const toStr = endDate.toISOString().split("T")[0];

  // Fetch reminders for the month
  const remindersQuery = useQuery({
    queryKey: ["calendar-reminders", currentYear, currentMonth],
    queryFn: async () => {
      const result = await apiClient(`/v1/calendar-reminders?from=${fromStr}&to=${toStr}`);
      return ((result as any)?.reminders || []) as CalendarReminderItem[];
    },
    staleTime: 15_000,
  });
  const allReminders = remindersQuery.data ?? [];

  const addReminderMutation = useMutation({
    mutationFn: async ({ date, title }: { date: string; title: string }) => {
      return apiClient("/v1/calendar-reminders", {
        method: "POST",
        body: JSON.stringify({ date, title }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] }),
  });

  const toggleReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient(`/v1/calendar-reminders/${id}/toggle`, { method: "PATCH" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] }),
  });

  const deleteReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient(`/v1/calendar-reminders/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] }),
  });

  const transactionsQuery = useQuery({
    queryKey: ["calendar-transactions", currentYear, currentMonth],
    queryFn: async () => {
      const from = startDate.toISOString().split("T")[0];
      const to = endDate.toISOString().split("T")[0];
      const result = await apiClient(`/v1/transactions?from=${from}&to=${to}&limit=500`);
      return (result as any)?.transactions || (result as any)?.data || [];
    },
    staleTime: 30_000,
  });

  const transactions: CalendarTransaction[] = transactionsQuery.data ?? [];

  // Build calendar grid
  const calendarDays = useMemo((): CalendarDay[] => {
    const days = getDaysInMonth(currentYear, currentMonth);
    const txByDate = new Map<string, CalendarTransaction[]>();

    for (const tx of transactions) {
      const dateKey = new Date(tx.date).toISOString().split("T")[0];
      if (!txByDate.has(dateKey)) txByDate.set(dateKey, []);
      txByDate.get(dateKey)!.push(tx);
    }

    return days.map((date) => {
      const dateKey = date.toISOString().split("T")[0];
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
        isToday: date.toDateString() === today.toDateString(),
        transactions: dayTxs,
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
      };
    });
  }, [currentYear, currentMonth, transactions]);

  const selectedDay = selectedDate
    ? calendarDays.find((d) => d.date.toISOString().split("T")[0] === selectedDate)
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
              Visualize your transactions day by day
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
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
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
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <CardTitle className="text-lg font-semibold min-w-[180px] text-center">
                    {MONTH_NAMES[currentMonth]} {currentYear}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigateMonth(1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
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
                  const dateKey = day.date.toISOString().split("T")[0];
                  const isSelected = selectedDate === dateKey;
                  const hasTx = day.transactions.length > 0;
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
                      <span className={`text-xs font-medium ${day.isToday ? "text-primary font-bold" : "text-foreground"}`}>
                        {day.date.getDate()}
                      </span>

                      {hasTx && day.isCurrentMonth && (
                        <div className="flex-1 flex flex-col justify-end gap-0.5 mt-0.5">
                          {day.totalIncome > 0 && (
                            <div className="h-1 rounded-full bg-emerald-500/70" style={{ width: `${Math.min(100, (day.totalIncome / Math.max(monthlyIncome, 1)) * 400)}%` }} />
                          )}
                          {day.totalExpense > 0 && (
                            <div className="h-1 rounded-full bg-rose-500/70" style={{ width: `${Math.min(100, (day.totalExpense / Math.max(monthlyExpense, 1)) * 400)}%` }} />
                          )}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-1.5 rounded-full bg-emerald-500" />
                  Income
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-1.5 rounded-full bg-rose-500" />
                  Expense
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Day Detail Panel */}
          <Card className="h-fit sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-primary" />
                {selectedDay
                  ? selectedDay.date.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : "Select a day"
                }
              </CardTitle>
              {selectedDay && (
                <CardDescription className="text-xs">
                  {selectedDay.transactions.length} transaction{selectedDay.transactions.length !== 1 ? "s" : ""}
                  {selectedDay.net !== 0 && (
                    <> • Net: <span className={selectedDay.net >= 0 ? "text-emerald-500" : "text-rose-500"}>
                      {selectedDay.net >= 0 ? "+" : ""}{fmt(selectedDay.net)}
                    </span></>
                  )}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {!selectedDay ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                    <CalendarIcon className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click on a day to see transaction details
                  </p>
                </div>
              ) : selectedDay.transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <DollarSign className="w-8 h-8 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground">No transactions on this day</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {selectedDay.transactions.map((tx, idx) => (
                    <motion.div
                      key={tx._id || idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-accent/50 transition-colors"
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
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {showAddReminder && (
                  <form
                    className="flex gap-2 mb-3"
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
                    />
                    <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={!newReminderTitle.trim() || addReminderMutation.isPending}>
                      Add
                    </Button>
                  </form>
                )}

                {(() => {
                  const dayReminders = allReminders.filter((r) => r.date === selectedDate);
                  if (dayReminders.length === 0 && !showAddReminder) {
                    return (
                      <p className="text-[10px] text-muted-foreground/60">
                        No reminders set. Click + to add one.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      {dayReminders.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/50 transition-colors group">
                          <button
                            className="flex-shrink-0"
                            onClick={() => toggleReminderMutation.mutate(r.id)}
                            title={r.completed ? "Mark incomplete" : "Mark complete"}
                          >
                            <CheckCircle2 className={`w-4 h-4 ${r.completed ? "text-emerald-500" : "text-muted-foreground/30"}`} />
                          </button>
                          <span className={`text-xs flex-1 ${r.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {r.title}
                          </span>
                          <button
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteReminderMutation.mutate(r.id)}
                            title="Delete reminder"
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
    </div>
  );
}

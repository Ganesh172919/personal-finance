import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getBudgetEnvelopes } from "@/lib/api/v1/finance";
import type { IExtractedVoiceExpense } from "@/lib/api/voice";

export function VoiceBudgetImpact({ expense }: { expense: IExtractedVoiceExpense }) {
  const period = new Date().toISOString().slice(0, 7);
  const budget = useQuery({
    queryKey: ["v1/finance/budgets/envelopes", period, expense.currency, "voice-preview"],
    queryFn: () => getBudgetEnvelopes(period, expense.currency, { fresh: true }),
    enabled: expense.type === "expense",
    staleTime: 0,
    retry: false,
  });

  if (expense.type !== "expense") return null;

  const envelope = budget.data?.envelopes.find(row => row.category === expense.category && !row.unbudgeted);
  const format = new Intl.NumberFormat("en-IN", { style: "currency", currency: expense.currency });
  const remaining = envelope ? Math.round((envelope.remaining - expense.amount) * 100) / 100 : undefined;

  return (
    <section aria-label="Budget impact" className="rounded-md border border-border bg-background p-3 text-sm" aria-live="polite">
      <h3 className="font-semibold text-foreground">Budget impact</h3>
      {budget.isFetching || budget.isPending ? (
        <p className="mt-1 text-muted-foreground">Checking this month’s budget…</p>
      ) : budget.isError ? (
        <p className="mt-1 text-muted-foreground">Budget information is temporarily unavailable.</p>
      ) : remaining === undefined ? (
        <p className="mt-1 text-muted-foreground">No monthly limit is set for {expense.category}. <Link href="/finance?tab=budgets" className="text-indigo-800 dark:text-indigo-300 underline">Open budgets</Link></p>
      ) : (
        <p className={remaining < 0 ? "mt-1 text-amber-800 dark:text-amber-300" : "mt-1 text-foreground"}>
          {remaining === 0
            ? `This expense would use the rest of your ${expense.category} budget.`
            : `After saving, ${expense.category} would be ${format.format(Math.abs(remaining))} ${remaining < 0 ? "over budget" : "under budget"}.`}
        </p>
      )}
    </section>
  );
}

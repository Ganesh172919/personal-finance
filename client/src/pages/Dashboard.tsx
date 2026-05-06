/**
 * @fileoverview Dashboard Page
 *
 * The main landing page after login. Provides a high-level overview of the
 * user's financial state and quick access to key features.
 *
 * PAGE SECTIONS (top to bottom):
 * 1. Hero — Time-based greeting, AI command bar, quick-launch cards
 * 2. Conversation Insights — Recent chat sessions, file workspace CTA
 * 3. Financial Vitals — Key financial metrics (income, expenses, savings)
 * 4. Trust & Close — Review queue, monthly close status, proactive signals
 * 5. AI Insights — Actionable recommendations from AI analysis
 *
 * DATA FETCHING:
 * - sessionsQuery: Recent chat sessions for the "conversations" sidebar
 * - summaryQuery: Dashboard summary (cash flow, goals, review queue, signals)
 * Both use React Query with default caching settings.
 *
 * ANIMATION:
 * Uses Framer Motion for staggered entrance animations on sections and cards.
 * The `delay` property creates a cascading reveal effect.
 *
 * @module pages/Dashboard
 */

import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, FolderOpen, MessageSquare, ReceiptText, Sparkles, Target } from "lucide-react";
import { Link } from "wouter";

import { AICommandBar } from "@/components/AiCommandBar";
import { ActionableInsights } from "@/components/ActionableInsights";
import BudgetHealthCard from "@/components/BudgetHealthCard";
import CommandCenter from "@/components/CommandCenter";
import { ConversationInsightsPanel } from "@/components/ConversationInsightsPanel";
import { FinancialVitals } from "@/components/FinancialVitals";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { getDashboardSummary } from "@/lib/apiClient";
import { fetchSessions } from "@/services/chatApi";

/** Quick-launch cards for common actions */
const quickLaunches = [
  {
    href: "/chat",
    label: "Ask the copilot",
    description: "Turn a question into an actionable financial answer.",
    icon: MessageSquare,
  },
  {
    href: "/transactions",
    label: "Review transactions",
    description: "Check the latest inflows and outflows quickly.",
    icon: ReceiptText,
  },
  {
    href: "/files",
    label: "Open files",
    description: "Keep source documents ready for chat and AI analysis.",
    icon: FolderOpen,
  },
  {
    href: "/goals-debts",
    label: "Update goals",
    description: "Keep your targets aligned with the month ahead.",
    icon: Target,
  },
];

function DashboardSectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">{eyebrow}</p>
      <div>
        <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const sessionsQuery = useQuery({
    queryKey: ["/api/chat/sessions", "dashboard"],
    queryFn: () => fetchSessions(1, 5),
  });
  const summaryQuery = useQuery({
    queryKey: ["/api/dashboard/summary", "dashboard"],
    queryFn: getDashboardSummary,
  });

  const firstName = user?.name?.split(" ")[0] || "there";
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="relative flex-1 overflow-auto bg-background" data-testid="dashboard">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-white/6 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[calc(var(--radius)+12px)] border border-border/80 bg-card/95 p-6 shadow-[0_26px_70px_-42px_rgba(0,0,0,0.8)]"
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI strategist dashboard
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{dateLabel}</p>
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {greeting}, {firstName}
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                    A cleaner workspace built around your financial pulse and AI-generated insights.
                    Review the numbers, ask a question, and act on the recommendations that matter.
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="icon"
                className="self-start rounded-2xl border-border/80 bg-background/70"
                data-testid="button-notifications"
              >
                <Bell className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {quickLaunches.map((launch, index) => (
                <motion.div
                  key={launch.href}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * index }}
                >
                  <Link
                    href={launch.href}
                    className="group flex h-full min-h-[118px] flex-col justify-between rounded-[calc(var(--radius)-2px)] border border-border/80 bg-background/70 p-4 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-accent/80"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/80 bg-white/5 text-foreground transition-colors group-hover:bg-white group-hover:text-black">
                        <launch.icon className="h-5 w-5" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-sm font-semibold text-foreground">{launch.label}</h2>
                      <p className="text-xs leading-5 text-muted-foreground">{launch.description}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="rounded-[calc(var(--radius)-4px)] border border-border/80 bg-background/70 p-3">
              <div className="mb-2 flex items-center justify-between px-2 pt-1">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Ask the strategist
                </p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Use your workspace context to get sharper recommendations
                </p>
              </div>
              <AICommandBar />
            </div>
          </div>
        </motion.section>

        {/* ── Financial Command Center ──────────────────── */}
        <section className="space-y-5">
          <DashboardSectionHeading
            eyebrow="Command center"
            title="Today in FinWise"
            description="Your daily financial cockpit — everything you need at a glance."
          />
          <CommandCenter />
        </section>

        {/* ── Budget Health ────────────────────────────── */}
        <section className="space-y-5">
          <DashboardSectionHeading
            eyebrow="Budget coach"
            title="Your weekly financial health"
            description="Score, projections, and proactive alerts to keep your spending on track."
          />
          <BudgetHealthCard />
        </section>

        <section className="space-y-5">
          <DashboardSectionHeading
            eyebrow="Conversation first"
            title="Keep the strategist loop close"
            description="Use your recent chats, cross-conversation patterns, and reusable files to decide what to ask next."
          />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <ConversationInsightsPanel />

            <div className="space-y-5">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="rounded-[calc(var(--radius)+8px)] border border-border/80 bg-card/95 p-5 shadow-[0_22px_55px_-38px_rgba(15,23,42,0.55)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Recent conversations</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Jump back into the threads that are already carrying context.
                    </div>
                  </div>
                  <Link href="/chat">
                    <Button variant="outline" className="rounded-2xl">
                      Open chat
                    </Button>
                  </Link>
                </div>

                <div className="mt-4 space-y-3">
                  {(sessionsQuery.data?.sessions || []).length === 0 ? (
                    <div className="rounded-[calc(var(--radius)-8px)] border border-dashed border-border/80 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                      No recent chat sessions yet. Start with a question or upload a file to ground the first conversation.
                    </div>
                  ) : (
                    (sessionsQuery.data?.sessions || []).map((session) => (
                      <Link
                        key={session.id}
                        href={`/chat/${session.id}`}
                        className="block rounded-[calc(var(--radius)-8px)] border border-border/70 bg-background/70 p-4 no-underline transition-all hover:-translate-y-0.5 hover:border-primary/20"
                      >
                        <div className="text-sm font-semibold text-foreground">{session.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {new Date(session.lastMessageAt).toLocaleString()}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="rounded-[calc(var(--radius)+8px)] border border-border/80 bg-card/95 p-5 shadow-[0_22px_55px_-38px_rgba(15,23,42,0.55)]"
              >
                <div className="text-sm font-semibold text-foreground">Why files matter here</div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  Upload statements, notes, invoices, or planning docs to the new Files workspace, then reference them
                  directly in chat for grounded, higher-signal responses.
                </div>
                <Link href="/files" className="mt-4 inline-flex no-underline">
                  <Button className="rounded-2xl">
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Open files workspace
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <DashboardSectionHeading
            eyebrow="Financial pulse"
            title="Your financial vitals at a glance"
            description="A fast read on the metrics that should shape your next decision."
          />
          <FinancialVitals />
        </section>

        {summaryQuery.data ? (
          <section className="space-y-5">
            <DashboardSectionHeading
              eyebrow="Trust and close"
              title="Keep the ledger clean and close with confidence"
              description="Review queue metrics and monthly close status — now powered by the review queue."
            />
            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="rounded-[calc(var(--radius)+8px)] border border-border/80 bg-card/95 p-5">
                <div className="text-sm font-semibold text-foreground">Review queue</div>
                <div className="mt-3 text-3xl font-semibold text-foreground">
                  {summaryQuery.data.review_queue.needs_attention}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {summaryQuery.data.review_queue.uncategorized} uncategorized,{" "}
                  {summaryQuery.data.review_queue.suspected_duplicates} duplicate groups,{" "}
                  {summaryQuery.data.review_queue.needs_merchant_match} merchant matches.
                </div>
                <Link href="/transactions?tab=review" className="mt-4 inline-flex no-underline">
                  <Button variant="outline" className="rounded-2xl">Open review queue</Button>
                </Link>
              </Card>

              <Card className="rounded-[calc(var(--radius)+8px)] border border-border/80 bg-card/95 p-5">
                <div className="text-sm font-semibold text-foreground">Monthly close</div>
                <div className="mt-3 text-3xl font-semibold text-foreground">
                  {summaryQuery.data.monthly_close.ready_to_close ? "Ready" : "In progress"}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {summaryQuery.data.monthly_close.period_key} net {summaryQuery.data.monthly_close.totals.net.toFixed(0)} with{" "}
                  {summaryQuery.data.monthly_close.budget?.unbudgeted_spent || 0} unbudgeted spend.
                </div>
                <Link href="/finance" className="mt-4 inline-flex no-underline">
                  <Button variant="outline" className="rounded-2xl">Inspect budget envelope</Button>
                </Link>
              </Card>

              <Card className="rounded-[calc(var(--radius)+8px)] border border-border/80 bg-card/95 p-5">
                <div className="text-sm font-semibold text-foreground">Proactive signals</div>
                <div className="mt-3 text-3xl font-semibold text-foreground">
                  {summaryQuery.data.signals.anomalies.length}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {summaryQuery.data.signals.recurring_candidates.length} recurring candidates and{" "}
                  {summaryQuery.data.signals.upcoming_reminders} upcoming reminders.
                </div>
                <div className="mt-4 space-y-2">
                  {summaryQuery.data.signals.anomalies.slice(0, 2).map((signal) => (
                    <div key={signal.id} className="rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{signal.title}:</span> {signal.detail}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </section>
        ) : null}

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-5"
        >
          <DashboardSectionHeading
            eyebrow="AI insights"
            title="Move from insight to execution"
            description="This board stays focused on AI-generated recommendations so the most useful guidance remains front and center."
          />
          <ActionableInsights />
        </motion.section>
      </div>
    </main>
  );
}

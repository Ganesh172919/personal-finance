import { motion } from "framer-motion";
import { ArrowRight, Bell, MessageSquare, ReceiptText, Sparkles, Target } from "lucide-react";
import { Link } from "wouter";

import { AICommandBar } from "@/components/AiCommandBar";
import { ActionableInsights } from "@/components/ActionableInsights";
import { FinancialVitals } from "@/components/FinancialVitals";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

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

            <div className="grid gap-3 md:grid-cols-3">
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

        <section className="space-y-5">
          <DashboardSectionHeading
            eyebrow="Financial pulse"
            title="Your financial vitals at a glance"
            description="A fast read on the metrics that should shape your next decision."
          />
          <FinancialVitals />
        </section>

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

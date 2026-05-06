/**
 * @fileoverview PageIntro — standard page header section with an icon badge, eyebrow label,
 * title, description, optional stat cards, and an action slot for page-level buttons.
 *
 * WHAT IT DOES
 *  - Renders a rounded, shadowed section with decorative blur orbs in the background.
 *  - Top-left: an eyebrow pill (icon + uppercase label), a large title, and a description.
 *  - Below: optional stat cards in a responsive grid (1/2/3 columns depending on viewport).
 *  - Right side: optional action buttons (e.g. "Create Blog", "Export") via the `actions` slot.
 *
 * KEY PROPS & DATA FLOW
 *  - `icon` (LucideIcon) — displayed in the eyebrow pill.
 *  - `eyebrow` (string) — uppercase section label (e.g. "BLOG", "GROWTH STORIES").
 *  - `title` (string) — the main page heading.
 *  - `description` (string) — subtitle text.
 *  - `actions` (ReactNode, optional) — page-level action buttons.
 *  - `stats` (IntroStat[], optional) — array of `{ label, value }` stat cards.
 *
 * ARCHITECTURE NOTES
 *  - Used at the top of every major page (blogs, growth stories, transactions, goals, etc.)
 *    for a consistent visual identity.
 *  - Pure presentational — no hooks, no state, no API calls.
 *  - The decorative blur orbs are `pointer-events-none` and purely aesthetic.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type IntroStat = {
  label: string;
  value: string;
};

type PageIntroProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  stats?: IntroStat[];
};

export function PageIntro({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  stats = [],
}: PageIntroProps) {
  return (
    <section className="relative overflow-hidden rounded-[calc(var(--radius)+10px)] border border-border/70 bg-card/92 p-6 shadow-[0_22px_60px_-38px_rgba(15,23,42,0.65)] sm:p-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-12 top-6 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            <Icon className="h-3.5 w-3.5" />
            {eyebrow}
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {description}
            </p>
          </div>

          {stats.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[calc(var(--radius)-4px)] border border-border/60 bg-background/70 px-4 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{stat.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {actions ? <div className="relative flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}

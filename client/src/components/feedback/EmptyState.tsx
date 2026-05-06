/**
 * @fileoverview EmptyState — reusable placeholder shown when a list, section, or page
 * has no data to display, with an optional icon, title, description, and action button.
 *
 * WHAT IT DOES
 *  - Renders a dashed-border card with centred content: optional Lucide icon in a
 *    primary-tinted circle, title, description, and an optional action slot (button, link, etc.).
 *  - Used throughout the app wherever empty data states need a friendly, consistent look.
 *
 * KEY PROPS & DATA FLOW
 *  - `title` (string) — the heading text.
 *  - `description` (string) — explanatory subtext.
 *  - `icon` (LucideIcon, optional) — displayed in a rounded container above the text.
 *  - `action` (ReactNode, optional) — rendered below the text (e.g. a "Create" button).
 *  - `className` (string, optional) — additional classes for the outer container.
 *
 * ARCHITECTURE NOTES
 *  - A building-block component used by TasksWidget, RecentActivity, ActionableInsights,
 *    NotificationCenter, and many page-level views.
 *  - Pure presentational — no hooks, no state, no side effects.
 *  - The dashed border and muted background visually signal "nothing here yet" without
 *    feeling like an error.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-[calc(var(--radius)+4px)] border border-dashed border-border/80 bg-card/75 p-6 text-center ${className}`}
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        {Icon ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}

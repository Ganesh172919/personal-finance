/**
 * @fileoverview Breadcrumb Navigation Component
 *
 * Automatically generates a contextual breadcrumb navigation trail from the
 * active URL pathname using wouter. Provides clear hierarchy for deep pages
 * such as Organization, Billing, Exports, Settings, and Documentation.
 *
 * @module components/Breadcrumb
 */

import { Link, useLocation } from "wouter";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  transactions: "Transactions",
  finance: "Finance OS",
  portfolio: "Portfolio",
  goals: "Goals & Debts",
  scenarios: "Scenarios",
  analytics: "Analytics",
  files: "Files",
  tasks: "Tasks",
  workflows: "Workflows",
  journal: "Journal",
  receipts: "Receipts",
  notes: "Notes",
  exports: "Exports",
  chat: "AI Chat",
  calendar: "Financial Calendar",
  story: "Financial Story",
  organization: "Organization",
  billing: "Billing",
  settings: "Settings",
  documentation: "Documentation",
  insights: "Insights",
  blogs: "Blogs",
};

export function Breadcrumb() {
  const [location] = useLocation();

  const segments = location.split("/").filter(Boolean);

  // Don't show breadcrumb on root or auth pages
  if (segments.length === 0 || segments[0] === "login" || segments[0] === "register") {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="px-6 py-2.5 text-xs text-muted-foreground flex items-center gap-1.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
      <Link href="/dashboard" className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
        <Home className="w-3.5 h-3.5" />
        <span className="sr-only">Home</span>
      </Link>

      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const path = `/${segments.slice(0, index + 1).join("/")}`;
        const label = ROUTE_LABELS[segment.toLowerCase()] || decodeURIComponent(segment).replace(/-/g, " ");

        return (
          <div key={path} className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
            {isLast ? (
              <span className="font-medium text-foreground capitalize" aria-current="page">
                {label}
              </span>
            ) : (
              <Link href={path} className="hover:text-foreground transition-colors capitalize cursor-pointer">
                {label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

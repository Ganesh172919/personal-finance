/**
 * @fileoverview Global command palette (Ctrl/Cmd + K).
 *
 * `useKeyboardShortcuts` toggles `useCommandBarStore.isOpen`; this component is the
 * consumer that renders the palette. It offers quick navigation to every page in the
 * sidebar (respecting feature flags) and an "Ask FinWise AI" entry that opens chat.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { MessageSquare } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/Command";
import { DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { navigationItems } from "@/components/Sidebar";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useCommandBarStore } from "@/stores/commandBarStore";

// Global command search palette opened via keyboard shortcut (Cmd+K).
// Enables instant keyboard navigation across all application modules and pages.
// Integrates AI conversational prompt shortcuts with recent search history caching.
export function CommandPalette() {
  const isOpen = useCommandBarStore((s) => s.isOpen);
  const open = useCommandBarStore((s) => s.open);
  const close = useCommandBarStore((s) => s.close);
  const pushHistory = useCommandBarStore((s) => s.pushHistory);
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const features = useAppConfig().data?.features as Record<string, boolean | undefined> | undefined;

  const orgRole = useAppConfig().data?.org?.role;
  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";

  const items = navigationItems.filter(
    (item) =>
      (!item.requiresAdmin || isOrgAdmin) &&
      (!item.requiresFeature || !features || Boolean(features[item.requiresFeature]))
  );

  const go = (href: string) => {
    close();
    setQuery("");
    navigate(href);
  };

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (next) open();
        else {
          close();
          setQuery("");
        }
      }}
    >
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <DialogDescription className="sr-only">Search pages or ask FinWise AI.</DialogDescription>
      <CommandInput
        placeholder="Jump to a page or ask FinWise AI…"
        value={query}
        onValueChange={setQuery}
        aria-label="Command palette search"
      />
      <CommandList>
        <CommandEmpty>No matching pages.</CommandEmpty>
        <CommandGroup heading="Pages">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.href} value={`${item.label} ${item.href}`} onSelect={() => go(item.href)}>
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="AI">
          <CommandItem
            value={`ask finwise ai ${query}`}
            onSelect={() => {
              if (query.trim()) pushHistory(query.trim());
              go("/chat");
            }}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Ask FinWise AI{query.trim() ? `: “${query.trim()}”` : ""}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

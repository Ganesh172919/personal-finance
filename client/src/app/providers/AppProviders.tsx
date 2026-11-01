/**
 * @fileoverview Application Provider Composition
 *
 * This file composes all React context providers that wrap the entire application.
 * It follows the "Provider Pattern" — each provider supplies a specific piece of
 * global state or functionality to the component tree.
 *
 * PROVIDER NESTING ORDER (outermost to innermost):
 * 1. ThemeProvider — Dark/light theme switching
 * 2. AuthProvider — Authentication state and methods
 * 3. ScopedDataProvider — Private query cache per account and workspace
 * 4. RealtimeAppEffects — SSE event listeners and keyboard shortcuts
 * 5. TooltipProvider — Tooltip configuration (Radix UI)
 *
 * WHY THIS ORDER?
 * - ThemeProvider affects CSS variables (must be before components render)
 * - Authentication resolves before the private query cache is selected
 * - Account/workspace changes retire old queries and remount private screens
 * - RealtimeAppEffects depends on auth (needs user context)
 * - TooltipProvider is innermost (just wraps children with tooltip config)
 *
 * GLOBAL COMPONENTS (rendered once, outside the router):
 * - SkipToContent: Accessibility skip link
 * - Toaster: Toast notification system
 * - FeatureLimitDialog: Feature limit exceeded dialog
 * - PlanAndUsageDialog: Plan and usage information dialog
 *
 * @module app/providers/AppProviders
 */

import type { ReactNode } from "react";

import { FeatureLimitDialog } from "@/components/FeatureLimitDialog"; // Feature limit dialog
import { ThemeProvider } from "@/components/ThemeProvider";           // Theme management
import { PlanAndUsageDialog } from "@/components/PlanAndUsageDialog"; // Plan/usage dialog
import { Toaster } from "@/components/ui/Toaster";                    // Toast notifications
import { TooltipProvider } from "@/components/ui/ToolTip";            // Tooltip config
import { AuthProvider } from "@/context/AuthContext";                  // Authentication context
import { SkipToContent } from "@/hooks/useAccessibility";             // Accessibility skip link
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";  // Global keyboard shortcuts
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";        // SSE event listeners
import { ScopedDataProvider } from "./ScopedDataProvider";

/**
 * Wrapper component that activates app-wide side effects.
 *
 * These effects require React context (auth, queries) to be available,
 * so they must run inside the provider tree.
 *
 * - useRealtimeEvents(): Subscribes to SSE events for real-time updates
 * - useKeyboardShortcuts(): Registers global keyboard shortcuts
 */
function RealtimeAppEffects({ children }: { children: ReactNode }) {
  useRealtimeEvents();
  useKeyboardShortcuts();

  return <>{children}</>;
}

/**
 * Composes all application-level providers and global components.
 *
 * This is the "composition root" for React context. Every component
 * in the application has access to these contexts.
 *
 * @param children - The application content (typically AppRouter)
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ScopedDataProvider>
          <RealtimeAppEffects>
            <TooltipProvider>
              {/* Global components (rendered once, outside router) */}
              <SkipToContent />
              <Toaster />
              <FeatureLimitDialog />
              <PlanAndUsageDialog />
              {children}
            </TooltipProvider>
          </RealtimeAppEffects>
        </ScopedDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { FeatureLimitDialog } from "@/components/FeatureLimitDialog";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PlanAndUsageDialog } from "@/components/PlanAndUsageDialog";
import { Toaster } from "@/components/ui/Toaster";
import { TooltipProvider } from "@/components/ui/ToolTip";
import { AuthProvider } from "@/context/AuthContext";
import { SkipToContent } from "@/hooks/useAccessibility";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { queryClient } from "@/lib/queryClient";

function RealtimeAppEffects({ children }: { children: ReactNode }) {
  useRealtimeEvents();
  useKeyboardShortcuts();

  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RealtimeAppEffects>
            <TooltipProvider>
              <SkipToContent />
              <Toaster />
              <FeatureLimitDialog />
              <PlanAndUsageDialog />
              {children}
            </TooltipProvider>
          </RealtimeAppEffects>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

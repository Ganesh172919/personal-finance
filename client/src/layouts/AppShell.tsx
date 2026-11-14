import type { ReactNode } from "react";

import { Breadcrumb } from "@/components/Breadcrumb";
import { CommandPalette } from "@/components/CommandPalette";
import { FinancialCopilot } from "@/components/FinancialCopilot";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Sidebar } from "@/components/Sidebar";

// Master application layout shell wrapping authenticated interface screens.
// Organizes the persistent sidebar, responsive main region, breadcrumbs, and banner.
// Mounts global overlay accessories including the financial copilot and command palette.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-auto pb-20 outline-none lg:pb-0">
        <OfflineBanner />
        <Breadcrumb />
        {children}
      </main>
      <FinancialCopilot />
      <CommandPalette />
    </div>
  );
}

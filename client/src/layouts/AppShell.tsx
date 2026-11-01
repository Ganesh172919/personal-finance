import type { ReactNode } from "react";

import { Breadcrumb } from "@/components/Breadcrumb";
import { FinancialCopilot } from "@/components/FinancialCopilot";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Sidebar } from "@/components/Sidebar";

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
    </div>
  );
}

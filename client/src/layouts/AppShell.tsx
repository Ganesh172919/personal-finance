import type { ReactNode } from "react";

import { FinancialCopilot } from "@/components/FinancialCopilot";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-auto pb-20 lg:pb-0">{children}</div>
      <FinancialCopilot />
    </div>
  );
}

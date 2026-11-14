import type { ReactNode } from "react";

import { CommandPalette } from "@/components/CommandPalette";

// Full-height specialized layout container for the interactive chat workspace.
// Maximizes viewport utilization by omitting the conventional application sidebar.
// Integrates the global command palette overlay for keyboard accessibility.
export function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen h-screen flex-col bg-background">
      {children}
      <CommandPalette />
    </div>
  );
}

import type { ReactNode } from "react";

export function ChatLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen h-screen flex-col bg-background">{children}</div>;
}

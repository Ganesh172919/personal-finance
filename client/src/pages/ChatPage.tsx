import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  Bot,
  BrainCircuit,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";

import { AiStatusDialog } from "@/components/AiStatusDialog";
import { ConversationInsightsPanel } from "@/components/ConversationInsightsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChatContainer, ChatHistorySidebar } from "@/features/chat";
import { useAuth } from "@/hooks/useAuth";
import { useChatStore } from "@/stores/chatStore";

const capabilityHighlights = [
  {
    icon: BrainCircuit,
    label: "Multi-agent reasoning",
    description: "Budget, debt, portfolio, and educator paths can contribute to the same answer.",
  },
  {
    icon: Workflow,
    label: "Autopilot-ready actions",
    description: "Tool previews and workflow creation stay simulation-first before execution.",
  },
  {
    icon: ShieldCheck,
    label: "Provider visibility",
    description: "Inspect failover chain, request metadata, and circuit-breaker health from the UI.",
  },
];

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.sessionId as string | undefined;
  const [, navigate] = useLocation();
  const { loadSessions, createSession } = useChatStore();
  const { user, logout } = useAuth();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleNewSession = async () => {
    const session = await createSession();
    navigate(session ? `/chat/${session.id}` : "/chat");
    setShowMobileSidebar(false);
  };

  return (
    <div className="relative flex h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-8 top-0 h-72 w-72 rounded-full bg-white/6 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      <header className="relative border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="mt-1 rounded-2xl lg:hidden"
                onClick={() => setShowMobileSidebar((value) => !value)}
                aria-label="Toggle chat history"
              >
                {showMobileSidebar ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 rounded-[calc(var(--radius)-6px)] border border-border/70 bg-card/75 px-3 py-2 no-underline"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Personal Finance</div>
                      <div className="text-xs text-muted-foreground">AI strategist chat</div>
                    </div>
                  </Link>

                  <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                    Live agent workspace
                  </Badge>
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    Collaborate with your finance agents in one place
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                    Ask a question, review the workflow trace, inspect provider failover, and move from
                    analysis to action without leaving the conversation.
                  </p>
                </div>

                <div className="hidden grid-cols-1 gap-3 md:grid md:grid-cols-3">
                  {capabilityHighlights.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[calc(var(--radius)-6px)] border border-border/70 bg-card/70 p-3"
                    >
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-background/80 text-primary">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="text-sm font-semibold text-foreground">{item.label}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AiStatusDialog />
              <ThemeToggle compact />

              <Button variant="outline" onClick={handleNewSession} className="rounded-2xl">
                <Plus className="mr-2 h-4 w-4" />
                New session
              </Button>

              <Link href="/workflows">
                <Button variant="ghost" className="rounded-2xl">
                  <Workflow className="mr-2 h-4 w-4" />
                  Workflows
                </Button>
              </Link>

              <Link href="/dashboard">
                <Button variant="ghost" className="rounded-2xl">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>

              <div className="ml-1 flex items-center gap-3 rounded-[calc(var(--radius)-6px)] border border-border/70 bg-card/75 px-3 py-2">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.photoURL || ""} alt={user?.name || ""} />
                  <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 max-w-[160px]">
                  <div className="truncate text-sm font-medium text-foreground">{user?.name || "Workspace user"}</div>
                  <div className="truncate text-xs text-muted-foreground">{user?.email || "Signed in"}</div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-2xl" onClick={handleLogout} aria-label="Log out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 gap-4 p-4 lg:p-6">
        <aside className="hidden w-80 shrink-0 overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border/70 surface-panel lg:flex lg:flex-col">
          <ChatHistorySidebar />
        </aside>

        {showMobileSidebar ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowMobileSidebar(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col overflow-hidden border-r border-border/70 bg-background/95 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.85)]">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Conversation history</div>
                  <div className="text-xs text-muted-foreground">Switch threads or start a fresh session.</div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-2xl" onClick={() => setShowMobileSidebar(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="border-b border-border/70 px-4 py-3">
                <Button className="w-full rounded-2xl" onClick={handleNewSession}>
                  <Plus className="mr-2 h-4 w-4" />
                  New session
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <ChatHistorySidebar onSessionSelect={() => setShowMobileSidebar(false)} />
              </div>
            </aside>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border/70 surface-panel">
          <ChatContainer sessionId={sessionId} />
        </main>

        <aside className="hidden w-[320px] shrink-0 flex-col gap-4 xl:flex">
          <ConversationInsightsPanel compact className="overflow-hidden rounded-[calc(var(--radius)+4px)] border-border/70 surface-panel" />

          <div className="rounded-[calc(var(--radius)+4px)] border border-border/70 bg-card/70 p-5">
            <div className="text-sm font-semibold text-foreground">Use files to ground your chat</div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              Upload statements, screenshots, spreadsheets, or notes, then attach them in chat to give the AI real
              context before it responds.
            </div>
            <Link href="/files" className="mt-4 inline-flex no-underline">
              <Button className="rounded-2xl">
                Open files workspace
              </Button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

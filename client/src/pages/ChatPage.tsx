/**
 * @fileoverview Chat Page (AI Financial Strategist)
 *
 * The main AI chat interface. Provides a three-column layout:
 * - Left: Chat session history sidebar
 * - Center: Active chat conversation (ChatContainer)
 * - Right: Conversation insights panel + files workspace CTA
 *
 * LAYOUT MODES:
 * - Desktop (lg+): Full three-column layout
 * - Mobile (< lg): Center content only, sidebar via hamburger menu
 *
 * KEY FEATURES:
 * - Session management (create, select, delete, rename)
 * - Real-time AI streaming with workflow visualization
 * - AI status dialog for provider/key pool monitoring
 * - Multi-agent capability highlights in the header
 *
 * ROUTING:
 * - /chat → No session selected (shows welcome state)
 * - /chat/:sessionId → Specific session loaded
 *
 * @module pages/ChatPage
 */

import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  Bot,
  BrainCircuit,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";

import { AiStatusDialog } from "@/components/AiStatusDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChatContainer, ChatHistorySidebar } from "@/features/chat";
import { useAuth } from "@/hooks/useAuth";
import { useChatStore } from "@/stores/chatStore";

/** Capability highlights shown in the header (hidden on small screens) */
const capabilityHighlights = [
  {
    icon: BrainCircuit,
    label: "Multi-agent reasoning",
    description: "Budget, debt, portfolio, and educator views can shape one answer.",
  },
  {
    icon: Workflow,
    label: "Autopilot-ready actions",
    description: "Preview tools and workflows before anything is applied.",
  },
  {
    icon: ShieldCheck,
    label: "Provider visibility",
    description: "Check failover status, metadata, and provider health in one place.",
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
    <div className="relative flex h-dvh flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-8 top-0 h-72 w-72 rounded-full bg-white/6 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      <header className="relative border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1.5 px-4 py-2 lg:px-5">
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="flex min-w-0 items-start gap-2.5">
              <Button
                variant="ghost"
                size="icon"
                className="mt-1 rounded-2xl lg:hidden"
                onClick={() => setShowMobileSidebar((value) => !value)}
                aria-label="Toggle chat history"
              >
                {showMobileSidebar ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2.5 rounded-[calc(var(--radius)-6px)] border border-border/70 bg-card/75 px-2.5 py-1.5 no-underline"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold leading-4 text-foreground">Personal Finance</div>
                      <div className="text-[11px] leading-4 text-muted-foreground">Finance assistant</div>
                    </div>
                  </Link>

                  <Badge className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-primary sm:inline-flex">
                    AI chat
                  </Badge>
                </div>

                <div className="max-w-[48rem] space-y-0.5">
                  <h1 className="sr-only text-base font-semibold leading-tight tracking-tight text-foreground lg:not-sr-only lg:text-lg xl:text-[1.55rem]">
                    Chat with your finance assistant
                  </h1>
                  <p className="hidden max-w-3xl text-xs leading-5 text-muted-foreground lg:block">
                    Ask about your budget, debts, goals, or uploaded files.
                  </p>
                </div>

                <div className="hidden flex-wrap gap-1 2xl:flex">
                  {capabilityHighlights.map((item) => (
                    <div
                      key={item.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-2 py-1"
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-primary">
                        <item.icon className="h-2.5 w-2.5" />
                      </div>
                      <div className="text-[10px] font-medium text-foreground">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 xl:max-w-[540px] xl:justify-end">
              <AiStatusDialog />
              <ThemeToggle compact />

              <Button variant="outline" onClick={handleNewSession} title="New session" className="h-9 w-9 rounded-2xl p-0 sm:h-10 sm:w-auto sm:px-4">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">New session</span>
              </Button>

                <Button asChild variant="ghost" className="h-9 w-9 rounded-2xl p-0 sm:h-10 sm:w-auto sm:px-4">
                  <Link href="/workflows" title="Workflows">
                  <Workflow className="h-4 w-4 sm:mr-2" />
                  <span className="sr-only sm:not-sr-only">Workflows</span>
                  </Link>
                </Button>

                <Button asChild variant="ghost" className="h-9 w-9 rounded-2xl p-0 sm:h-10 sm:w-auto sm:px-4">
                  <Link href="/dashboard" title="Dashboard">
                  <LayoutDashboard className="h-4 w-4 sm:mr-2" />
                  <span className="sr-only sm:not-sr-only">Dashboard</span>
                  </Link>
                </Button>

                <Button asChild variant="ghost" className="h-9 w-9 rounded-2xl p-0 sm:h-10 sm:w-auto sm:px-4">
                  <Link href="/files" title="Files">
                    <FileText className="h-4 w-4 sm:mr-2" />
                    <span className="sr-only sm:not-sr-only">Files</span>
                  </Link>
                </Button>

              <div className="absolute right-4 top-2 flex items-center gap-2.5 xl:static xl:rounded-[calc(var(--radius)-6px)] xl:border xl:border-border/70 xl:bg-card/75 xl:px-2.5 xl:py-1.5">
                <Avatar className="hidden h-8 w-8 xl:flex">
                  <AvatarImage src={user?.photoURL || ""} alt={user?.name || ""} />
                  <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <div className="hidden min-w-0 max-w-[138px] xl:block">
                  <div className="truncate text-xs font-medium text-foreground">{user?.name || "Workspace user"}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{user?.email || "Signed in"}</div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-2xl" onClick={handleLogout} aria-label="Log out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 gap-2.5 p-2.5 lg:gap-2.5 lg:p-2.5">
        <aside className="hidden w-[264px] shrink-0 overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border/70 surface-panel lg:flex lg:flex-col xl:w-[276px]">
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
                <Button variant="ghost" size="icon" aria-label="Close conversation history" className="rounded-2xl" onClick={() => setShowMobileSidebar(false)}>
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

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border/70 surface-panel">
          <ChatContainer sessionId={sessionId} />
        </main>

      </div>
    </div>
  );
}

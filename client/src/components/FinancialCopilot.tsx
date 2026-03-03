import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  X,
  Send,
  ChevronDown,
  Lightbulb,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { processAICommand } from "@/lib/api/ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Page Context Suggestions ───────────────────────────

type PageContext = {
  pageKey: string;
  label: string;
  suggestions: string[];
};

const PAGE_CONTEXTS: Record<string, PageContext> = {
  "/dashboard": {
    pageKey: "dashboard",
    label: "Dashboard",
    suggestions: [
      "Give me a quick financial health check",
      "What should I focus on this month?",
      "Summarize my spending vs last month",
    ],
  },
  "/transactions": {
    pageKey: "transactions",
    label: "Transactions",
    suggestions: [
      "Find my largest expenses this month",
      "Are there any duplicate transactions?",
      "Which category am I overspending in?",
    ],
  },
  "/analytics": {
    pageKey: "analytics",
    label: "Analytics",
    suggestions: [
      "What are my spending trends?",
      "Predict my expenses for next month",
      "Compare my income vs expenses over time",
    ],
  },
  "/goals-debts": {
    pageKey: "goals",
    label: "Goals & Debts",
    suggestions: [
      "How can I pay off my debt faster?",
      "Am I on track for my savings goals?",
      "What's the best debt payoff strategy?",
    ],
  },
  "/portfolio": {
    pageKey: "portfolio",
    label: "Portfolio",
    suggestions: [
      "How is my portfolio performing?",
      "Should I rebalance my investments?",
      "What's my current asset allocation?",
    ],
  },
  "/finance": {
    pageKey: "finance",
    label: "Finance OS",
    suggestions: [
      "How is my budget tracking this month?",
      "Show me budget utilization by category",
      "Any recurring payments I should review?",
    ],
  },
  "/workflows": {
    pageKey: "workflows",
    label: "Workflows",
    suggestions: [
      "What automations should I set up?",
      "Show me workflow execution history",
      "Suggest a budget alert workflow",
    ],
  },
};

function getPageContext(location: string): PageContext {
  // Try exact match first, then prefix match
  if (PAGE_CONTEXTS[location]) return PAGE_CONTEXTS[location];
  for (const [path, ctx] of Object.entries(PAGE_CONTEXTS)) {
    if (location.startsWith(path)) return ctx;
  }
  return {
    pageKey: "general",
    label: "FinWise",
    suggestions: [
      "What's my financial health score?",
      "How much did I spend this week?",
      "Give me a savings tip",
    ],
  };
}

// ─── Chat Message Type ──────────────────────────────────

interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ─── Main Component ─────────────────────────────────────

export function FinancialCopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [location] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageContext = getPageContext(location);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      return processAICommand(question, { narrative: false });
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.response || "I've analyzed your request. Check the response above.",
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          role: "assistant",
          content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
          timestamp: new Date(),
        },
      ]);
    },
  });

  const handleSend = useCallback(
    (text?: string) => {
      const question = (text || input).trim();
      if (!question || askMutation.isPending) return;

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: question,
          timestamp: new Date(),
        },
      ]);
      setInput("");
      askMutation.mutate(question);
    },
    [input, askMutation]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* ─── Floating Action Button ────────────────────── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 lg:bottom-8 lg:right-8 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-xl shadow-violet-500/30 flex items-center justify-center transition-shadow hover:shadow-2xl hover:shadow-violet-500/40"
            aria-label="Open AI Copilot"
            data-testid="copilot-fab"
          >
            <Sparkles className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Copilot Panel ─────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed bottom-6 right-6 z-50 lg:bottom-8 lg:right-8 w-[380px] max-w-[calc(100vw-48px)] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            style={{ maxHeight: isMinimized ? "56px" : "520px" }}
            data-testid="copilot-panel"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500/10 to-purple-600/10 border-b border-border cursor-pointer"
              onClick={() => isMinimized && setIsMinimized(false)}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">AI Copilot</p>
                  <p className="text-[10px] text-muted-foreground">
                    {pageContext.label} context • Quick financial insights
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMinimized(!isMinimized);
                  }}
                  data-testid="copilot-minimize"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${isMinimized ? "rotate-180" : ""}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    setIsMinimized(false);
                  }}
                  data-testid="copilot-close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Body (hidden when minimized) */}
            {!isMinimized && (
              <>
                {/* Messages */}
                <ScrollArea className="flex-1 min-h-0" style={{ maxHeight: "340px" }}>
                  <div ref={scrollRef} className="p-4 space-y-3">
                    {messages.length === 0 ? (
                      <div className="space-y-4">
                        {/* Welcome */}
                        <div className="text-center py-3">
                          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center mb-3">
                            <MessageSquare className="w-6 h-6 text-violet-500" />
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            How can I help?
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Ask me anything about your finances
                          </p>
                        </div>

                        {/* Contextual suggestions */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
                            <Lightbulb className="w-3 h-3 inline mr-1" />
                            Suggestions for {pageContext.label}
                          </p>
                          {pageContext.suggestions.map((suggestion, i) => (
                            <motion.button
                              key={i}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.08 }}
                              onClick={() => handleSend(suggestion)}
                              className="w-full text-left px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted text-xs text-foreground transition-colors"
                              data-testid={`copilot-suggestion-${i}`}
                            >
                              {suggestion}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-muted text-foreground rounded-bl-md"
                            }`}
                          >
                            {msg.role === "assistant" ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:text-foreground [&_p]:my-1 [&_ul]:my-1 [&_li]:text-xs [&_p]:text-sm">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <p>{msg.content}</p>
                            )}
                          </div>
                        </motion.div>
                      ))
                    )}

                    {/* Loading indicator */}
                    {askMutation.isPending && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-start"
                      >
                        <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                          <span className="text-xs text-muted-foreground">Thinking…</span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="px-3 py-2.5 border-t border-border bg-card">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about your finances…"
                      className="flex-1 bg-muted/50 rounded-xl px-3.5 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:bg-muted transition-colors"
                      disabled={askMutation.isPending}
                      data-testid="copilot-input"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!input.trim() || askMutation.isPending}
                      className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-sm"
                      data-testid="copilot-send"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

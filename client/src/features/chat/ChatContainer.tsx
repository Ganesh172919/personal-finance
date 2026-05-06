/**
 * @fileoverview Chat Container (Orchestration Component)
 *
 * The main chat orchestrator that wires together the message list, input,
 * suggestions, and chat store. Manages session lifecycle and message flow.
 *
 * RESPONSIBILITIES:
 * - Load session on mount (if sessionId provided)
 * - Create new session if none exists
 * - Delegate message sending to the chat store
 * - Show suggestions when no messages exist
 * - Show loading/error states
 *
 * ARCHITECTURE:
 * This is a "smart" component that connects the chat store (state) to
 * "dumb" presentational components (ChatMessageList, ChatInput, ChatSuggestions).
 *
 * @module features/chat/ChatContainer
 */

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ChatSuggestions } from "./ChatSuggestions";

interface ChatContainerProps {
  sessionId?: string;
}

export function ChatContainer({ sessionId }: ChatContainerProps) {
  const {
    sessions,
    currentSessionId,
    messages,
    isLoadingMessages,
    isSending,
    currentPhase,
    currentAgent,
    selectSession,
    createSession,
    sendMessage,
    clearCurrentSession
  } = useChatStore();

  // Load session if sessionId is provided
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      selectSession(sessionId);
    }
  }, [sessionId, currentSessionId, selectSession]);

  const handleSendMessage = async (content: string, options?: { narrative?: boolean; fileIds?: string[] }) => {
    // If no current session, create one first
    if (!currentSessionId) {
      const newSession = await createSession();
      if (newSession) {
        await sendMessage(content, options);
      }
    } else {
      await sendMessage(content, options);
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    clearCurrentSession();
    handleSendMessage(suggestion);
  };

  const hasMessages = messages.length > 0;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const latestAssistantMetadata = [...messages].reverse().find((message) => message.role === "assistant")?.metadata;

  return (
    <motion.div
      className="flex h-full flex-col bg-background/70"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Chat Header - simplified without New Chat button */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground sm:text-base">Personal Finance AI Assistant</h1>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
              {currentSession?.aiSessionId ? (
                <span className="rounded-full border border-border/70 px-2 py-0.5">
                  Session {currentSession.aiSessionStatus || "active"}
                </span>
              ) : null}
              {latestAssistantMetadata?.activeProvider ? (
                <span className="rounded-full border border-border/70 px-2 py-0.5">
                  {latestAssistantMetadata.activeProvider}
                </span>
              ) : null}
              {latestAssistantMetadata?.activeModel ? (
                <span className="max-w-[180px] truncate rounded-full border border-border/70 px-2 py-0.5">
                  {latestAssistantMetadata.activeModel}
                </span>
              ) : null}
              {latestAssistantMetadata?.recoveredFromCheckpoint ? (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  resumed
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <p className="hidden text-[11px] text-muted-foreground lg:block">
          {currentPhase ? `Phase: ${currentPhase}` : "Your intelligent financial co-pilot"}
        </p>
      </div>

      {/* Chat Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {hasMessages || isLoadingMessages ? (
          <ChatMessageList
            messages={messages}
            isLoading={isLoadingMessages}
            isSending={isSending}
            currentPhase={currentPhase}
            currentAgent={currentAgent}
          />
        ) : (
          <ChatSuggestions onSelect={handleSuggestionSelect} />
        )}
      </div>

      {/* Chat Input */}
      <ChatInput onSend={handleSendMessage} isSending={isSending} />
    </motion.div>
  );
}

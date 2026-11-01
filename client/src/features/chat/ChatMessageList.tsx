/**
 * @fileoverview Chat Message List Component
 *
 * Renders the scrollable list of chat messages with auto-scroll behavior.
 * Shows a typing indicator when the AI is processing.
 *
 * AUTO-SCROLL:
 * Keeps a newly completed answer's beginning visible. Pending sends follow
 * the typing indicator without pulling the reader down on every phase update.
 *
 * LOADING STATES:
 * - isLoading: Initial message load (shows skeleton)
 * - isSending: Message being processed (shows TypingIndicator)
 *
 * @module features/chat/ChatMessageList
 */

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { ChatMessage } from "./ChatMessage";
import { TypingIndicator, type WorkflowPhase } from "./TypingIndicator";
import type { IChatAttachment, IChatMessage } from "@/types/chat.types";

interface ChatMessageListProps {
  messages: IChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  currentPhase?: WorkflowPhase | null;
  currentAgent?: string | null;
  onUseDocument?: (file: IChatAttachment) => void;
  documentActionsDisabled?: boolean;
}

export function ChatMessageList({
  messages,
  isLoading,
  isSending,
  currentPhase,
  currentAgent,
  onUseDocument,
  documentActionsDisabled,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const latestMessage = messages[messages.length - 1];

  // Long answers have sources and action cards below them; scrolling to their
  // bottom hides the actual answer. Reveal its beginning on completion/reload.
  useEffect(() => {
    if (isLoading) return;
    if (!isSending && latestMessage?.role === "assistant") {
      latestMessageRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
    }
  }, [latestMessage?.id, latestMessage?.role, isSending, isLoading]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex space-x-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">Loading messages...</span>
        </div>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Conversation messages" tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary" ref={scrollRef}>
      <div className="py-3">
        {messages.map((message, index) => (
          <div key={message.id} ref={index === messages.length - 1 ? latestMessageRef : undefined}>
            <ChatMessage message={message} onUseDocument={onUseDocument} isSending={isSending || documentActionsDisabled} />
          </div>
        ))}
        
        <AnimatePresence>
          {isSending && (
            <TypingIndicator 
              phase={currentPhase || undefined} 
              agentName={currentAgent || undefined} 
            />
          )}
        </AnimatePresence>
        
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { ChatMessage } from "./ChatMessage";
import { TypingIndicator, type WorkflowPhase } from "./TypingIndicator";
import type { IChatMessage } from "@/types/chat.types";
import { ScrollArea } from "@/components/ui/ScrollArea";

interface ChatMessageListProps {
  messages: IChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  currentPhase?: WorkflowPhase | null;
  currentAgent?: string | null;
}

export function ChatMessageList({ 
  messages, 
  isLoading, 
  isSending,
  currentPhase,
  currentAgent
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, currentPhase]);

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
    <ScrollArea className="flex-1" ref={scrollRef}>
      <div className="py-3">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
          />
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
    </ScrollArea>
  );
}

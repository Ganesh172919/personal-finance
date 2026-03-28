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
    currentSessionId,
    messages,
    isLoadingMessages,
    isSending,
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

  return (
    <motion.div
      className="flex h-full flex-col bg-background/70"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Chat Header - simplified without New Chat button */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/80 px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground sm:text-lg">Personal Finance AI Assistant</h1>
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Your intelligent financial co-pilot
        </p>
      </div>

      {/* Chat Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {hasMessages || isLoadingMessages ? (
          <ChatMessageList
            messages={messages}
            isLoading={isLoadingMessages}
            isSending={isSending}
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

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
 * MINDMAP FLOW
 * ------------
 * ```
 * ChatContainer Orchestrator
 * ├── 1. Session Lifecycle Synchronization
 * │   ├── Mount Effect: If sessionId prop provided -> selectSession(sessionId)
 * │   └── Session switch detection and teardown
 * ├── 2. Zustand Store Integration (useChatStore)
 * │   ├── State: messages, isLoadingMessages, isSending, currentPhase, currentAgent
 * │   └── Actions: selectSession, createSession, sendMessage, clearCurrentSession
 * ├── 3. Child Component Orchestration
 * │   ├── ChatSuggestions: Rendered when messages.length === 0
 * │   ├── ChatMessageList: Rendered when messages exist (renders citations & agent tags)
 * │   ├── TypingIndicator: Displays live agent and phase state
 * │   └── ChatInput: Message drafting, document/receipt attachment picker
 * └── 4. Framer-Motion Animations
 *     └── Fade-in transitions and sticky-scroll behavior
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |                     ChatContainer Mounts                      |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                 Evaluate Active Chat Session                  |
 *   |   [Has sessionId?] -> Load Session via selectSession()        |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *                     [Are there any messages?]
 *                               /      \
 *                             YES       NO
 *                             /          \
 *                            v            v
 *              +-------------------+   +--------------------+
 *              | ChatMessageList   |   | ChatSuggestions    |
 *              | (Scrollable list  |   | (Starter Prompts   |
 *              |  with evidence)   |   |  & templates)      |
 *              +---------+---------+   +---------+----------+
 *                        \                      /
 *                         \                    /
 *                          v                  v
 *              +--------------------------------------------+
 *              | ChatInput Bar (Textarea + Attachments)     |
 *              | - Triggers sendMessage(content, files)     |
 *              +--------------------------------------------+
 * ```
 *
 * @module features/chat/ChatContainer
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ChatSuggestions } from "./ChatSuggestions";
import { Button } from "@/components/ui/Button";
import { useQueryClient } from "@tanstack/react-query";
import type { IChatAttachment } from "@/types/chat.types";

interface ChatContainerProps {
  sessionId?: string;
}

export function ChatContainer({ sessionId }: ChatContainerProps) {
  const {
    sessions,
    currentSessionId,
    messages,
    isLoadingMessages,
    messageLoadError,
    isSending,
    currentPhase,
    currentAgent,
    selectSession,
    sendMessage,
    clearCurrentSession
  } = useChatStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isComposerBusy, setIsComposerBusy] = useState(false);
  const [savedFileDraft, setSavedFileDraft] = useState<{ sessionId: string | null; files: IChatAttachment[] }>({ sessionId: null, files: [] });
  const workspaceAttachments = savedFileDraft.sessionId === currentSessionId ? savedFileDraft.files : [];
  const handleUseDocument = (file: IChatAttachment) => {
    if (isSending || isComposerBusy || !currentSessionId) return;
    setSavedFileDraft(previous => {
      const files = previous.sessionId === currentSessionId ? previous.files : [];
      return { sessionId: currentSessionId, files: files.some(item => item.workspaceFileId === file.workspaceFileId) ? files : [...files, file].slice(0, 10) };
    });
  };

  // Load session if sessionId is provided
  useEffect(() => {
    const state = useChatStore.getState();
    const targetId = sessionId || state.currentSessionId;
    if (targetId && !state.isSending && (targetId !== state.currentSessionId || state.messages.length === 0)) {
      void selectSession(targetId);
    }
  }, [sessionId, selectSession]);

  const handleSendMessage = async (content: string, options?: { narrative?: boolean; fileIds?: string[] }) => {
    const sendingSessionId = useChatStore.getState().currentSessionId;
    const sent = await sendMessage(content, options);
    if (sent) setSavedFileDraft(previous => previous.sessionId === sendingSessionId ? { ...previous, files: [] } : previous);
    if (sent && useChatStore.getState().messages.at(-1)?.metadata?.generatedDocuments?.length) {
      void queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    }
    const activeId = useChatStore.getState().currentSessionId;
    if (activeId && activeId !== sessionId) navigate(`/chat/${activeId}`, { replace: true });
    return sent;
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
            <h2 className="text-sm font-semibold text-foreground sm:text-base">Finance assistant</h2>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
              {hasMessages && currentSession?.aiSessionId ? (
                <span className="rounded-full border border-border/70 px-2 py-0.5">
                  {isSending ? "Analyzing" : currentSession.aiSessionStatus === "completed" ? "Response ready" : `Session ${currentSession.aiSessionStatus || "active"}`}
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
        {messageLoadError && !hasMessages && !isLoadingMessages ? (
          <div role="alert" className="m-auto max-w-md space-y-3 p-6 text-center">
            <h3 className="font-semibold text-foreground">Conversation unavailable</h3>
            <p className="text-sm text-muted-foreground">{messageLoadError}</p>
            <Button variant="outline" onClick={() => currentSessionId && void selectSession(currentSessionId)}>Try loading conversation again</Button>
          </div>
        ) : hasMessages || isLoadingMessages ? (
          <ChatMessageList
            messages={messages}
            isLoading={isLoadingMessages}
            isSending={isSending}
            currentPhase={currentPhase}
            currentAgent={currentAgent}
            onUseDocument={handleUseDocument}
            documentActionsDisabled={isComposerBusy}
          />
        ) : (
          <ChatSuggestions onSelect={handleSuggestionSelect} />
        )}
      </div>

      {/* Chat Input */}
      <ChatInput onSend={handleSendMessage} isSending={isSending} onBusyChange={setIsComposerBusy} workspaceAttachments={workspaceAttachments} onRemoveWorkspaceAttachment={id => setSavedFileDraft(previous => ({ ...previous, files: previous.files.filter(file => file.workspaceFileId !== id) }))} />
    </motion.div>
  );
}

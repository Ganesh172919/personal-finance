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

import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "wouter";
import { motion } from "framer-motion";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ChatSuggestions } from "./ChatSuggestions";
import { LiveVoiceChat } from "./LiveVoiceChat";
import { Button } from "@/components/ui/Button";
import { useQueryClient } from "@tanstack/react-query";
import type { IChatAttachment } from "@/types/chat.types";
import { getWorkspaceFile } from "@/lib/api/files";
import { isWorkspaceFileId } from "@/lib/fileReferences";

// Component property contract for the primary chat interface orchestrator.
// Supports passing an optional active session ID to load conversation history.
// Determines whether an existing chat thread or a blank workspace is mounted.
interface ChatContainerProps {
  sessionId?: string;
  basePath?: string;
  localFiles?: boolean;
}

// Primary chat experience orchestrator integrating Zustand stores and layout panes.
// Coordinates session hydration, message drafting, file attachments, and prompt suggestions.
// Renders active agent indicators, conversation threads, and responsive error banners.
export function ChatContainer({ sessionId, basePath = "/chat", localFiles = false }: ChatContainerProps) {
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
    sendMessage
  } = useChatStore();
  const [, navigate] = useLocation();
  const [handoffParams] = useSearchParams();
  const attachmentId = handoffParams.get("attachment");
  const initialMessage = (handoffParams.get("message") || "").slice(0, 8000);
  const queryClient = useQueryClient();
  const [isComposerBusy, setIsComposerBusy] = useState(false);
  const [isLoadingAttachment, setIsLoadingAttachment] = useState(Boolean(attachmentId));
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentRetry, setAttachmentRetry] = useState(0);
  const consumedAttachment = useRef<string | null>(null);
  const [savedFileDraft, setSavedFileDraft] = useState<{ sessionId: string | null; files: IChatAttachment[] }>({ sessionId: null, files: [] });
  const workspaceAttachments = savedFileDraft.sessionId === currentSessionId ? savedFileDraft.files : [];
  useEffect(() => {
    let active = true;
    setAttachmentError(null);
    if (!attachmentId) { consumedAttachment.current = null; setIsLoadingAttachment(false); return; }
    if (consumedAttachment.current === attachmentId) { setIsLoadingAttachment(false); return; }
    if (!isWorkspaceFileId(attachmentId)) {
      setIsLoadingAttachment(false);
      setAttachmentError("This document link is invalid. Open Files and select a saved document.");
      return;
    }
    setIsLoadingAttachment(true);
    void getWorkspaceFile(attachmentId).then(({ file }) => {
      if (!active) return;
      if (file.id !== attachmentId) throw new Error("The requested document was not returned.");
      consumedAttachment.current = attachmentId;
      const attachment: IChatAttachment = {
        workspaceFileId: file.id, fileId: file.fileId, originalName: file.originalName,
        mimeType: file.mimeType, sizeBytes: file.sizeBytes,
      };
      setSavedFileDraft(previous => {
        const files = previous.sessionId === currentSessionId ? previous.files : [];
        return { sessionId: currentSessionId, files: [...files.filter(item => item.workspaceFileId !== file.id), attachment].slice(0, 10) };
      });
    }).catch(() => {
      if (active) setAttachmentError("The document could not be attached. It may be unavailable in this workspace. Try again or choose a file in Files.");
    }).finally(() => { if (active) setIsLoadingAttachment(false); });
    return () => { active = false; };
  }, [attachmentId, currentSessionId, attachmentRetry]);
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

  const handleSendMessage = async (content: string, options?: { narrative?: boolean; fileIds?: string[] }, clearFileDraft = true) => {
    const sendingSessionId = useChatStore.getState().currentSessionId;
    const sent = await sendMessage(content, localFiles ? { ...options, fileDestination: "local" } : options);
    if (sent && clearFileDraft) setSavedFileDraft(previous => previous.sessionId === sendingSessionId ? { ...previous, files: [] } : previous);
    if (sent && useChatStore.getState().messages.at(-1)?.metadata?.generatedDocuments?.length) {
      void queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    }
    const activeId = useChatStore.getState().currentSessionId;
    if (activeId && activeId !== sessionId) navigate(`${basePath}/${activeId}`, { replace: true });
    return sent;
  };

  const handleSuggestionSelect = (suggestion: string) => {
    // Suggestions only render for an empty thread, so reuse the open session
    // (e.g. one just created with "New session") instead of orphaning it.
    void handleSendMessage(suggestion);
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
      {isLoadingAttachment ? <p role="status" className="px-4 py-2 text-sm text-muted-foreground">Attaching saved document...</p> : null}
      {attachmentError ? <div role="alert" className="space-y-2 px-4 py-2 text-sm">
        <p>{attachmentError}</p>
        {isWorkspaceFileId(attachmentId) ? <Button size="sm" variant="outline" onClick={() => setAttachmentRetry(value => value + 1)}>Try attaching again</Button> : null}
      </div> : null}
      <LiveVoiceChat initiallyOpen={handoffParams.get("voice") === "live"} sessionId={currentSessionId} disabled={isSending || isComposerBusy || isLoadingAttachment || isLoadingMessages} onSend={async (text) => {
        const before = useChatStore.getState();
        const sent = await handleSendMessage(text, undefined, false);
        const after = useChatStore.getState();
        const reply = after.messages.at(-1);
        if (sent && (!before.currentSessionId || before.currentSessionId === after.currentSessionId) &&
          reply?.role === "assistant" && reply.id !== before.messages.at(-1)?.id) {
          return reply.metadata?.fallbackUsed && reply.metadata.llmCallCount === 0
            ? "The finance assistant is temporarily unavailable. Please try your question again."
            : reply.content;
        }
      }} />
      <ChatInput sessionId={currentSessionId} initialMessage={initialMessage} onSend={handleSendMessage} isSending={isSending || isLoadingAttachment} onBusyChange={setIsComposerBusy} workspaceAttachments={workspaceAttachments} onRemoveWorkspaceAttachment={id => setSavedFileDraft(previous => ({ ...previous, files: previous.files.filter(file => file.workspaceFileId !== id) }))} />
    </motion.div>
  );
}

/**
 * @fileoverview Chat Input Component
 *
 * The message input area for the AI chat. Supports:
 * - Auto-resizing textarea (grows with content)
 * - File attachment with upload-to-workspace flow
 * - Narrative mode toggle (request detailed narrative responses)
 * - Enter to send (Shift+Enter for newline)
 * - Loading state during message sending
 *
 * FILE ATTACHMENT FLOW:
 * 1. User clicks paperclip → file picker opens
 * 2. Selected files are stored locally (not yet uploaded)
 * 3. On send, files are uploaded to the workspace first
 * 4. File IDs are included in the message payload
 *
 * @module features/chat/ChatInput
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Globe, Loader2, Paperclip, Send, X, Mic, Upload } from "lucide-react";

import { useToast } from "@/hooks/useToast";
import { uploadWorkspaceFiles } from "@/lib/api/files";
import { transcribeVoice } from "@/lib/api/voice";
import { transcribeLiveVoice } from "@/lib/liveVoice";
import { prepareVoiceRecording } from "@/lib/voiceRecording";
import { Button } from "@/components/ui/Button";
import { Switch as ToggleSwitch } from "@/components/ui/Switch";
import type { IChatAttachment } from "@/types/chat.types";

const WEB_SEARCH_PREFIX = "Search the web for ";

// Property definition contract for the conversational chat input component.
// Configures send dispatchers, loading states, custom placeholders, and attachments.
// Connects parent notification callbacks for composer busy state changes.
interface ChatInputProps {
  onSend: (message: string, options?: { narrative?: boolean; fileIds?: string[] }) => Promise<boolean>;
  isSending: boolean;
  placeholder?: string;
  initialMessage?: string;
  sessionId?: string | null;
  workspaceAttachments?: IChatAttachment[];
  onRemoveWorkspaceAttachment?: (id: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

// Interactive message composer supporting multi-line text and file uploads.
// Coordinates workspace file attachment staging, uploading, and error recovery.
// Implements narrative mode toggles and keyboard shortcuts for prompt submission.
export function ChatInput({
  onSend,
  isSending,
  initialMessage = "",
  sessionId,
  workspaceAttachments = [],
  onRemoveWorkspaceAttachment,
  onBusyChange,
  placeholder = "Ask a question or attach a file...",
}: ChatInputProps) {
  const [message, setMessage] = useState(initialMessage);
  const webSearch = message.toLowerCase().startsWith(WEB_SEARCH_PREFIX.toLowerCase());
  const searchQuestionMissing = webSearch && !message.slice(WEB_SEARCH_PREFIX.length).trim();
  const [narrative, setNarrative] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  // Reuse uploads after a send failure. These IDs stay only in this composer,
  // and removal/unmount discards the reference without deleting workspace data.
  const uploadedFilesRef = useRef(new Map<File, string>());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const [dictationOpen, setDictationOpen] = useState(false);
  const [dictationPhase, setDictationPhase] = useState("");
  const [canFinishDictation, setCanFinishDictation] = useState(false);
  const [dictationError, setDictationError] = useState("");
  const dictation = useRef<AbortController | null>(null);
  const finishDictation = useRef<(() => void) | null>(null);
  const dictationFile = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDictationPhase("");
    setCanFinishDictation(false);
    setDictationError("");
    setDictationOpen(false);
    return () => {
      dictation.current?.abort();
      dictation.current = null;
      finishDictation.current = null;
    };
  }, [sessionId]);

  const dictate = async (clip?: File) => {
    if (dictation.current || inFlightRef.current || isSending) return;
    const controller = new AbortController();
    dictation.current = controller;
    const { signal } = controller;
    setDictationError("");
    setDictationPhase(clip ? "Transcribing audio with Gnani Prisma…" : "Allow microphone access to start dictation…");
    try {
      let text: string;
      if (clip) {
        if (clip.size > 8 * 1024 * 1024) throw new Error("Choose a short audio file under 8 MB.");
        const wav = await prepareVoiceRecording(clip, false).catch(() => {
          throw new Error("Choose a supported audio clip of 30 seconds or less.");
        });
        signal.throwIfAborted();
        const result = await transcribeVoice({ audioBlob: wav, language: "auto", codeMixed: true }, signal);
        if (result.provider !== "gnani_prisma_v3_live") throw new Error("Live transcription is unavailable. Try again or type your question.");
        text = result.transcript;
      } else {
        const result = await transcribeLiveVoice({
          signal,
          registerCommit: commit => {
            finishDictation.current = commit;
            setCanFinishDictation(true);
          },
          onEvent: event => {
            if (signal.aborted) return;
            if (event === "processing") setCanFinishDictation(false);
            setDictationPhase(event === "processing" ? "Transcribing audio with Gnani Prisma…" : "Listening. Pause or select Finish dictation.");
          },
        });
        text = result.text;
      }
      if (signal.aborted) return;
      if (!text.trim()) throw new Error("No speech was detected. Try a clearer recording.");
      setMessage(previous => [previous.trimEnd(), text.trim()].filter(Boolean).join(" ").slice(0, 4000));
      setDictationOpen(false);
      textareaRef.current?.focus();
    } catch (error) {
      if (!signal.aborted) setDictationError(error instanceof Error ? error.message : "Dictation failed. Try again.");
    } finally {
      if (dictation.current === controller) {
        dictation.current = null;
        finishDictation.current = null;
        setCanFinishDictation(false);
        setDictationPhase("");
      }
    }
  };
  useEffect(() => {
    if (workspaceAttachments.length) textareaRef.current?.focus();
  }, [workspaceAttachments.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [message]);

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setSelectedFiles((currentFiles) => {
      const nextFiles = [...currentFiles];

      files.forEach((file) => {
        const duplicate = nextFiles.some(
          (currentFile) =>
            currentFile.name === file.name &&
            currentFile.size === file.size &&
            currentFile.lastModified === file.lastModified
        );
        if (!duplicate) {
          nextFiles.push(file);
        }
      });

      return nextFiles.slice(0, 10);
    });

    event.target.value = "";
  };

  const handleRemoveFile = (indexToRemove: number) => {
    uploadedFilesRef.current.delete(selectedFiles[indexToRemove]);
    setSelectedFiles((currentFiles) => currentFiles.filter((_, index) => index !== indexToRemove));
  };

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    const hasMessage = Boolean(trimmedMessage);
    const hasFiles = selectedFiles.length > 0 || workspaceAttachments.length > 0;
    if ((!hasMessage && !hasFiles) || isSending || inFlightRef.current || dictation.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    onBusyChange?.(true);
    setSendError(null);

    try {
      if (searchQuestionMissing) {
        setSendError("Enter a public question to search for.");
        return;
      }
      if (webSearch && (selectedFiles.length || workspaceAttachments.length)) {
        setSendError("Send the public question separately from workspace files.");
        return;
      }
      if (selectedFiles.length + workspaceAttachments.length > 10) {
        setSendError("Attach up to 10 files per message. Remove a file before sending. Your draft is kept.");
        return;
      }
      const pendingFiles = selectedFiles.filter(file => !uploadedFilesRef.current.has(file));
      if (pendingFiles.length) {
        const uploadResponse = await uploadWorkspaceFiles(pendingFiles);
        if (uploadResponse.files.length !== pendingFiles.length || uploadResponse.files.some(file => !file.id)) {
          throw new Error("The attachment upload was incomplete. Please retry.");
        }
        uploadResponse.files.forEach((file, index) => uploadedFilesRef.current.set(pendingFiles[index], file.id));
      }
      const uploadedFileIds = [...new Set([...workspaceAttachments.map(file => file.workspaceFileId), ...selectedFiles.map(file => uploadedFilesRef.current.get(file)!)])];

      const sent = await onSend(
        hasMessage ? trimmedMessage : "Please analyze the attached files and tell me what matters most.",
        {
          narrative,
          fileIds: uploadedFileIds,
        }
      );
      if (!sent) {
        setSendError("Message wasn't sent. Your draft and attachments are kept. Send again to retry.");
        return;
      }

      setMessage("");
      setSelectedFiles([]);
      uploadedFilesRef.current.clear();
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      setSendError("Message wasn't sent. Your draft and attachments are kept. Send again to retry.");
      toast({
        title: "Message failed",
        description: error instanceof Error ? error.message : "Could not send your message.",
        variant: "destructive",
      });
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
      onBusyChange?.(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      void handleSend();
    }
  };

  const isBusy = isSending || isSubmitting;

  return (
    <motion.div
      className="border-t border-border bg-background px-4 py-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mx-auto max-w-none">
        {workspaceAttachments.length ? <div className="mb-3 space-y-2">
          <p className="text-xs text-muted-foreground">Saved files selected for this question</p>
          <div className="flex flex-wrap gap-2">{workspaceAttachments.map(file => <div key={file.workspaceFileId} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-2 text-xs">
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 max-w-[220px] truncate">{file.originalName}</span>
            <button type="button" disabled={isBusy} aria-label={`Remove saved ${file.originalName}`} onClick={() => onRemoveWorkspaceAttachment?.(file.workspaceFileId)} className="shrink-0"><X className="h-3.5 w-3.5" /></button>
          </div>)}</div>
        </div> : null}
        {selectedFiles.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-2 text-xs text-foreground"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="min-w-0 max-w-[220px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  disabled={isBusy}
                  className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {sendError ? <p role="alert" className="mb-3 text-sm text-destructive">{sendError}</p> : null}
        {dictationOpen && <div className="mb-3 space-y-2 rounded-lg border border-border p-2">
          {dictationPhase && <p role="status" className="text-sm">{dictationPhase}</p>}
          {dictationError && <p role="alert" className="text-sm text-destructive">{dictationError}</p>}
          <div className="flex flex-wrap gap-2">
            {!dictationPhase && <>
              <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void dictate()}>Start microphone dictation</Button>
              <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => dictationFile.current?.click()}>
                <Upload aria-hidden="true" className="mr-2 size-4" /> Import audio for dictation
              </Button>
            </>}
            {canFinishDictation && <Button type="button" size="sm" variant="outline" onClick={() => finishDictation.current?.()}>Finish dictation</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => {
              dictation.current?.abort();
              dictation.current = null;
              finishDictation.current = null;
              setCanFinishDictation(false);
              setDictationError("");
              setDictationPhase("");
              setDictationOpen(false);
            }}>{dictationPhase ? "Cancel dictation" : "Close dictation"}</Button>
          </div>
          <input ref={dictationFile} type="file" accept="audio/*,.wav,.webm" aria-label="Dictation audio file" hidden onChange={event => {
            const clip = event.target.files?.[0];
            event.target.value = "";
            if (clip) void dictate(clip);
          }} />
        </div>}

        <div className="gradient-border rounded-xl p-1">
          <div className="flex items-end gap-3 rounded-lg bg-background p-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/20 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Attach files"
              disabled={isBusy}
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setDictationOpen((prev) => !prev)}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-muted/20 px-3 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dictate with Gnani Prisma"
              aria-expanded={dictationOpen}
              disabled={isBusy}
              title="Dictate a draft with Gnani Prisma"
            >
              <Mic className="h-4 w-4" />
            </button>

            <input ref={fileInputRef} type="file" multiple className="hidden" aria-label="Choose files for chat" disabled={isBusy} onChange={handleFileSelection} />

            <textarea
              aria-label="Message to your finance assistant"
              aria-describedby="chat-composer-hint"
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isBusy}
              rows={1}
              maxLength={4000}
              className="min-h-[24px] max-h-[220px] min-w-0 flex-1 resize-none border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
            />

            <Button
              aria-label={isBusy ? "Sending message" : "Send message"}
              onClick={() => void handleSend()}
              disabled={searchQuestionMissing || (!message.trim() && selectedFiles.length === 0 && workspaceAttachments.length === 0) || isBusy || Boolean(dictationPhase)}
              size="sm"
              className="flex-shrink-0 rounded-2xl"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={webSearch ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={webSearch}
              aria-describedby={webSearch ? "chat-composer-hint" : undefined}
              disabled={isBusy || Boolean(dictationPhase)}
              onClick={() => {
                setMessage(webSearch ? message.slice(WEB_SEARCH_PREFIX.length) : WEB_SEARCH_PREFIX + message);
                setSendError(null);
                textareaRef.current?.focus();
              }}
            >
              <Globe className="mr-1 h-4 w-4" aria-hidden="true" /> Search web
            </Button>
            <span className="text-xs text-muted-foreground">Narrative mode</span>
            <ToggleSwitch aria-label="Narrative mode" checked={narrative} onCheckedChange={setNarrative} disabled={isBusy} />
            <span className="text-xs text-muted-foreground">{narrative ? "deeper analysis" : "faster response"}</span>
          </div>

          <p id="chat-composer-hint" className="text-xs text-muted-foreground">
            {webSearch ? "Use public information. Only this question is sent to web search." : "Press Enter to send, Shift+Enter for a new line."}
            {message.length >= 3600 ? ` ${message.length}/4000 characters` : ""}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

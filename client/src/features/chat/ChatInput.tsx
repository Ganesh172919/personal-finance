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
import { Loader2, Paperclip, Send, X } from "lucide-react";

import { useToast } from "@/hooks/useToast";
import { uploadWorkspaceFiles } from "@/lib/api/files";
import { Button } from "@/components/ui/Button";
import { Switch as ToggleSwitch } from "@/components/ui/Switch";
import type { IChatAttachment } from "@/types/chat.types";

interface ChatInputProps {
  onSend: (message: string, options?: { narrative?: boolean; fileIds?: string[] }) => Promise<boolean>;
  isSending: boolean;
  placeholder?: string;
  workspaceAttachments?: IChatAttachment[];
  onRemoveWorkspaceAttachment?: (id: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function ChatInput({
  onSend,
  isSending,
  workspaceAttachments = [],
  onRemoveWorkspaceAttachment,
  onBusyChange,
  placeholder = "Ask me anything about your finances or attach files for context...",
}: ChatInputProps) {
  const [message, setMessage] = useState("");
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
    if ((!hasMessage && !hasFiles) || isSending || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    onBusyChange?.(true);
    setSendError(null);

    try {
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
              disabled={(!message.trim() && selectedFiles.length === 0 && workspaceAttachments.length === 0) || isBusy}
              size="sm"
              className="flex-shrink-0 rounded-2xl"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Narrative mode</span>
            <ToggleSwitch aria-label="Narrative mode" checked={narrative} onCheckedChange={setNarrative} disabled={isBusy} />
            <span className="text-xs text-muted-foreground">{narrative ? "deeper analysis" : "faster response"}</span>
          </div>

          <p id="chat-composer-hint" className="text-xs text-muted-foreground">
            Press Enter to send, Shift+Enter for a new line.
            {message.length >= 3600 ? ` ${message.length}/4000 characters` : ""}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

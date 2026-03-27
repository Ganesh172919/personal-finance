import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Paperclip, Send, X } from "lucide-react";

import { useToast } from "@/hooks/useToast";
import { uploadWorkspaceFiles } from "@/lib/api/files";
import { Button } from "@/components/ui/Button";
import { Switch as ToggleSwitch } from "@/components/ui/Switch";

interface ChatInputProps {
  onSend: (message: string, options?: { narrative?: boolean; fileIds?: string[] }) => Promise<void>;
  isSending: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  isSending,
  placeholder = "Ask me anything about your finances or attach files for context...",
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [narrative, setNarrative] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

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
    setSelectedFiles((currentFiles) => currentFiles.filter((_, index) => index !== indexToRemove));
  };

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    const hasMessage = Boolean(trimmedMessage);
    const hasFiles = selectedFiles.length > 0;
    if ((!hasMessage && !hasFiles) || isSending || isUploadingFiles) return;

    let uploadedFileIds: string[] = [];

    try {
      if (hasFiles) {
        setIsUploadingFiles(true);
        const uploadResponse = await uploadWorkspaceFiles(selectedFiles);
        uploadedFileIds = uploadResponse.files.map((file) => file.id);
      }

      await onSend(
        hasMessage ? trimmedMessage : "Please analyze the attached files and tell me what matters most.",
        {
          narrative,
          fileIds: uploadedFileIds,
        }
      );

      setMessage("");
      setSelectedFiles([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      toast({
        title: "Message failed",
        description: error instanceof Error ? error.message : "Could not send your message.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const isBusy = isSending || isUploadingFiles;

  return (
    <motion.div
      className="border-t border-border bg-background p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mx-auto max-w-4xl">
        {selectedFiles.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-2 text-xs text-foreground"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="max-w-[220px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="gradient-border rounded-xl p-1">
          <div className="flex items-end gap-3 rounded-lg bg-background p-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/20 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelection} />

            <textarea
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isBusy}
              rows={1}
              className="min-h-[24px] max-h-[220px] flex-1 resize-none border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
            />

            <Button
              onClick={() => void handleSend()}
              disabled={(!message.trim() && selectedFiles.length === 0) || isBusy}
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
            <ToggleSwitch checked={narrative} onCheckedChange={setNarrative} />
            <span className="text-xs text-muted-foreground">{narrative ? "deeper analysis" : "faster response"}</span>
          </div>

          <p className="text-xs text-muted-foreground">
            Press Enter to send, Shift+Enter for a new line.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch as ToggleSwitch } from "@/components/ui/Switch";

interface ChatInputProps {
  onSend: (message: string, options?: { narrative?: boolean }) => void;
  isSending: boolean;
  placeholder?: string;
}

export function ChatInput({ 
  onSend, 
  isSending, 
  placeholder = "Ask me anything about your finances..." 
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [narrative, setNarrative] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSend = () => {
    if (message.trim() && !isSending) {
      onSend(message.trim(), { narrative });
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div 
      className="border-t border-border bg-background p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="gradient-border rounded-xl p-1">
          <div className="flex items-end gap-3 bg-background rounded-lg p-3">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isSending}
              rows={1}
              className="flex-1 bg-transparent border-none outline-none resize-none text-sm placeholder:text-muted-foreground min-h-[24px] max-h-[200px] focus:ring-0"
            />
            <Button
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              size="sm"
              className="flex-shrink-0"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-xs text-muted-foreground">Narrative</span>
          <ToggleSwitch checked={narrative} onCheckedChange={setNarrative} />
          <span className="text-xs text-muted-foreground">faster is off</span>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </motion.div>
  );
}

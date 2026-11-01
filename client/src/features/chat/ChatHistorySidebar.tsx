/**
 * @fileoverview Chat History Sidebar
 *
 * Displays the list of chat sessions with search, create, rename, and delete.
 * Shows session title, last message time, and message count.
 *
 * FEATURES:
 * - Search sessions by title
 * - Create new session
 * - Inline rename (double-click or edit button)
 * - Delete with confirmation
 * - Active session highlighting
 * - Relative time display ("2h ago", "Yesterday")
 *
 * @module features/chat/ChatHistorySidebar
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import {
  Check,
  Clock,
  Edit2,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useChatStore } from "@/stores/chatStore";
import type { IChatSession } from "@/types/chat.types";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";

interface ChatHistorySidebarProps {
  onSessionSelect?: (sessionId: string) => void;
}

export function ChatHistorySidebar({ onSessionSelect }: ChatHistorySidebarProps) {
  const {
    sessions,
    currentSessionId,
    isLoadingSessions,
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
  } = useChatStore();
  const [, navigate] = useLocation();
  const { formatTime: formatOrgTime, formatDate } = useOrgFormatters();

  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleNewChat = async () => {
    const session = await createSession();
    if (!session) return;

    navigate(`/chat/${session.id}`);
    onSessionSelect?.(session.id);
  };

  const handleSelectSession = (sessionId: string) => {
    void selectSession(sessionId);
    navigate(`/chat/${sessionId}`);
    onSessionSelect?.(sessionId);
  };

  const handleStartRename = (session: IChatSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveRename = async (sessionId: string) => {
    if (editTitle.trim()) {
      await renameSession(sessionId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm("Delete this conversation?")) return;
    await deleteSession(sessionId);
  };

  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedSessions = groupSessionsByDate(filteredSessions);

  const formatTime = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return formatOrgTime(date);
    }

    if (diffDays < 7) {
      return formatDate(date, { weekday: "short" });
    }

    return formatDate(date, { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <Button onClick={handleNewChat} className="flex w-full items-center justify-center gap-2">
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            aria-label="Search conversations"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-4">
          {isLoadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs">Start a new chat to begin</p>
            </div>
          ) : (
            Object.entries(groupedSessions).map(([group, groupSessions]) => (
              <div key={group} className="mb-4">
                <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">{group}</h3>
                <AnimatePresence>
                  {groupSessions.map((session) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className={`group flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors ${
                        currentSessionId === session.id
                          ? "border border-primary/20 bg-primary/10 text-foreground"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open conversation ${session.title}`}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          handleSelectSession(session.id);
                        }
                      }}
                      onClick={() => handleSelectSession(session.id)}
                    >
                      <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

                      {editingId === session.id ? (
                        <div className="flex flex-1 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                          <Input
                            aria-label="Conversation title"
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            className="h-6 text-sm"
                            autoFocus
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void handleSaveRename(session.id);
                              if (event.key === "Escape") handleCancelRename();
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => void handleSaveRename(session.id)}
                            aria-label="Save conversation title"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={handleCancelRename}
                            aria-label="Cancel conversation rename"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{session.title}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatTime(session.lastMessageAt)}
                              <span>&bull;</span>
                              {session.messageCount}{" "}
                              {session.messageCount === 1 ? "message" : "messages"}
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleStartRename(session)}
                              aria-label="Rename conversation"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => void handleDelete(session.id)}
                              aria-label="Delete conversation"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function groupSessionsByDate(sessions: IChatSession[]): Record<string, IChatSession[]> {
  const groups: Record<string, IChatSession[]> = {};
  const now = new Date();

  sessions.forEach((session) => {
    const date = new Date(session.lastMessageAt);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    let groupName = "Older";
    if (diffDays === 0) {
      groupName = "Today";
    } else if (diffDays === 1) {
      groupName = "Yesterday";
    } else if (diffDays < 7) {
      groupName = "Last 7 Days";
    } else if (diffDays < 30) {
      groupName = "Last 30 Days";
    }

    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(session);
  });

  return groups;
}

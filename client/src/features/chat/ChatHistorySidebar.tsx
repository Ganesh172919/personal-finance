import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Search, 
  MessageSquare, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  Clock 
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { IChatSession } from "@/types/chat.types";

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
    renameSession
  } = useChatStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleNewChat = async () => {
    const session = await createSession();
    if (session && onSessionSelect) {
      onSessionSelect(session.id);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    selectSession(sessionId);
    if (onSessionSelect) {
      onSessionSelect(sessionId);
    }
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
    if (confirm("Delete this conversation?")) {
      await deleteSession(sessionId);
    }
  };

  // Filter sessions by search query
  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group sessions by date
  const groupedSessions = groupSessionsByDate(filteredSessions);

  const formatTime = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* New Chat Button */}
      <div className="p-4 border-b border-border">
        <Button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-4">
          {isLoadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs">Start a new chat to begin</p>
            </div>
          ) : (
            Object.entries(groupedSessions).map(([group, sessions]) => (
              <div key={group} className="mb-4">
                <h3 className="text-xs font-medium text-muted-foreground px-2 py-1">
                  {group}
                </h3>
                <AnimatePresence>
                  {sessions.map((session) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        currentSessionId === session.id
                          ? "bg-primary/10 border border-primary/20 text-foreground"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                      onClick={() => handleSelectSession(session.id)}
                    >
                      <MessageSquare className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      
                      {editingId === session.id ? (
                        <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="h-6 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(session.id);
                              if (e.key === "Escape") handleCancelRename();
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleSaveRename(session.id)}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={handleCancelRename}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {session.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {formatTime(session.lastMessageAt)}
                              <span>•</span>
                              {Math.ceil(session.messageCount / 2)} {Math.ceil(session.messageCount / 2) === 1 ? 'message' : 'messages'}
                            </div>
                          </div>
                          
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleStartRename(session)}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(session.id)}
                            >
                              <Trash2 className="w-3 h-3" />
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

// Helper function to group sessions by date
function groupSessionsByDate(sessions: IChatSession[]): Record<string, IChatSession[]> {
  const groups: Record<string, IChatSession[]> = {};
  const now = new Date();
  
  sessions.forEach(session => {
    const date = new Date(session.lastMessageAt);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    let groupName: string;
    if (diffDays === 0) {
      groupName = "Today";
    } else if (diffDays === 1) {
      groupName = "Yesterday";
    } else if (diffDays < 7) {
      groupName = "Last 7 Days";
    } else if (diffDays < 30) {
      groupName = "Last 30 Days";
    } else {
      groupName = "Older";
    }
    
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(session);
  });
  
  return groups;
}

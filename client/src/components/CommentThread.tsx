/**
 * @fileoverview CommentThread — reusable threaded comment system for any resource type
 * (transaction, budget, goal, workflow, insight) with create, edit, and delete support.
 *
 * WHAT IT DOES
 *  - Fetches comments for a given `resourceType` + `resourceId` via `listResourceComments`.
 *  - Renders each comment with an avatar (initials + deterministic colour), author name,
 *    relative timestamp, and edit indicator.
 *  - Own comments show a kebab menu with Edit (inline input) and Delete options.
 *  - New comments are submitted via a form at the bottom with Enter-to-send.
 *
 * KEY PROPS & DATA FLOW
 *  - `resourceType` ("transaction" | "budget" | "goal" | "workflow" | "insight") — the entity type.
 *  - `resourceId` (string) — the specific entity ID.
 *  - `compact` (boolean) — smaller padding / no card wrapper for inline use.
 *  - Mutations: `createComment`, `updateCommentApi`, `deleteCommentApi`.
 *
 * ARCHITECTURE NOTES
 *  - Designed to be embedded inside detail views (e.g. transaction detail, insight modal).
 *  - Query key is `["comments", resourceType, resourceId]` so multiple instances don't collide.
 *  - Framer Motion stagger (0.04 s) for comment entry animation.
 *  - `useAuth` determines which comments are "own" to show edit/delete controls.
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Send,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  listResourceComments,
  createComment,
  updateComment as updateCommentApi,
  deleteComment as deleteCommentApi,
  type CommentItem,
} from "@/lib/api/v1/collaboration";
import { useAuth } from "@/hooks/useAuth";

// ─── Helpers ────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-blue-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-pink-500",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Props ──────────────────────────────────────────────

interface CommentThreadProps {
  resourceType: "transaction" | "budget" | "goal" | "workflow" | "insight";
  resourceId: string;
  /** Compact mode for inline use (smaller padding, no card wrapper) */
  compact?: boolean;
}

// ─── Main Component ─────────────────────────────────────

export function CommentThread({
  resourceType,
  resourceId,
  compact = false,
}: CommentThreadProps) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const commentsKey = ["comments", resourceType, resourceId];

  const commentsQuery = useQuery({
    queryKey: commentsKey,
    queryFn: () => listResourceComments(resourceType, resourceId),
    staleTime: 30_000,
  });

  const comments = commentsQuery.data?.comments ?? [];

  // ─── Mutations ──────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: (text: string) =>
      createComment({ resource_type: resourceType, resource_id: resourceId, text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsKey });
      setNewText("");
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => updateCommentApi(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsKey });
      setEditingId(null);
      setEditText("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCommentApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsKey });
      setMenuOpen(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newText.trim();
    if (!text || addMutation.isPending) return;
    addMutation.mutate(text);
  };

  const startEdit = (comment: CommentItem) => {
    setEditingId(comment.id);
    setEditText(comment.text);
    setMenuOpen(null);
  };

  const submitEdit = () => {
    if (!editingId || !editText.trim() || editMutation.isPending) return;
    editMutation.mutate({ id: editingId, text: editText.trim() });
  };

  return (
    <div
      className={compact ? "space-y-3" : "rounded-xl border border-border bg-card p-4 space-y-4"}
      data-testid={`comment-thread-${resourceType}-${resourceId}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <p className={`font-semibold text-foreground ${compact ? "text-xs" : "text-sm"}`}>
          Comments
          {comments.length > 0 && (
            <span className="ml-1.5 text-muted-foreground font-normal">({comments.length})</span>
          )}
        </p>
      </div>

      {/* Comments list */}
      {commentsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-4 justify-center text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 text-center py-3">
          No comments yet. Start a discussion!
        </p>
      ) : (
        <div className="space-y-2.5">
          {comments.map((comment, idx) => {
            const isOwn = user && String((user as any)._id || (user as any).id) === comment.author.id;
            const isEditing = editingId === comment.id;

            return (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                className="group relative flex gap-2.5"
              >
                {/* Avatar */}
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-lg ${getAvatarColor(
                    comment.author.name
                  )} flex items-center justify-center`}
                >
                  <span className="text-[10px] font-bold text-white">
                    {getInitials(comment.author.name)}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {comment.author.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {timeAgo(comment.created_at)}
                    </span>
                    {comment.edited_at && (
                      <span className="text-[10px] text-muted-foreground/40 italic">edited</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-1 flex gap-1.5">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitEdit()}
                        className="flex-1 bg-muted/50 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:bg-muted"
                        autoFocus
                      />
                      <Button size="icon" className="h-7 w-7" onClick={submitEdit} disabled={editMutation.isPending}>
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">
                      {comment.text}
                    </p>
                  )}
                </div>

                {/* Actions (own comments only) */}
                {isOwn && !isEditing && (
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setMenuOpen(menuOpen === comment.id ? null : comment.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md flex items-center justify-center hover:bg-accent text-muted-foreground"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    <AnimatePresence>
                      {menuOpen === comment.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="absolute right-0 top-7 z-20 bg-popover border border-border rounded-lg shadow-xl py-1 w-28"
                        >
                          <button
                            onClick={() => startEdit(comment)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(comment.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* New comment input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 bg-muted/50 rounded-xl px-3.5 py-2 text-xs outline-none placeholder:text-muted-foreground/40 focus:bg-muted transition-colors"
          disabled={addMutation.isPending}
          data-testid="comment-input"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!newText.trim() || addMutation.isPending}
          className="h-8 w-8 rounded-xl"
          data-testid="comment-submit"
        >
          {addMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </Button>
      </form>
    </div>
  );
}

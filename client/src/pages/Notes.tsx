/**
 * @fileoverview Financial journaling page with handwriting canvas, offline stroke sync,
 * AI insights, and dense 64-dimensional semantic vector search.
 *
 * Combines a free-form handwriting canvas (HTML5 canvas) with OCR
 * recognition, offline draft caching & batch synchronization, and AI-powered
 * journal analysis. Users draw financial notes, submit them for text recognition
 * or save them offline, then explore notes via semantic vector cosine search.
 *
 * Key data flows:
 * - listJournalEntries / getJournalEntry provide paginated journal CRUD.
 * - recognizeHandwriting() sends canvas strokes to the OCR service.
 * - syncOfflineJournalNotes() flushes queued offline notes with clientDraftId deduplication.
 * - searchJournalEntries() performs semantic cosine similarity searches with category filtering.
 * - generateJournalInsights() produces AI analysis of the entry text.
 * - createGoal() is offered when the AI detects goal-like intent.
 * - createTasksFromPlan() converts an insight plan into actionable tasks.
 *
 * Feature-flagged behind journal_enabled and tasks_enabled; the page
 * renders a disabled notice when the flag is off.
 *
 * Accessible from the sidebar under "Notes" for authenticated users.
 */

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cloud, CloudOff, RefreshCw, Search, Sparkles, Tag, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/hooks/useToast";
import {
  ApiError,
  createGoal,
  createTasksFromPlan,
  generateJournalInsights,
  getJournalEntry,
  listJournalEntries,
  patchJournalEntry,
  recognizeHandwriting,
  searchJournalEntries,
  syncOfflineJournalNotes,
  updateFinancialProfile,
  type JournalSearchResult,
  type SyncOfflineNotePayload,
} from "@/lib/apiClient";
import { HandwritingCanvas, type HandwritingCanvasHandle } from "@/features/journaling/HandwritingCanvas";
import { useAppConfig } from "@/hooks/useAppConfig";
import { buildApiUrl } from "@/lib/apiBase";

// LocalStorage key for caching offline handwritten notes and journal entries.
// Stores pending sync payloads when the browser lacks network connectivity.
// Flushed and reconciled automatically upon network reconnection.
const OFFLINE_QUEUE_KEY = "finwise_offline_journal_queue";

// Formats API and runtime error instances into descriptive notification text.
// Appends server request identifiers when ApiError structures are detected.
// Provides safe fallback messaging when error objects lack details.
const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

// Calculates a YYYY-MM-DD formatted date string offset by specified months.
// Facilitates default date range filtering for past journal query searches.
// Pads month and day digits with leading zeros for ISO compliance.
const ymdFromNow = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Retrieves and parses queued offline journal notes from browser local storage.
// Validates that the parsed data is an array to prevent runtime crashes.
// Returns an empty array if storage is empty, corrupted, or inaccessible.
const getStoredOfflineNotes = (): SyncOfflineNotePayload[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Persists an array of pending offline journal notes to browser local storage.
// Catches quota exceeded and storage access exceptions silently.
// Safeguards local note drafts during offline editing sessions.
const setStoredOfflineNotes = (notes: SyncOfflineNotePayload[]) => {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(notes));
  } catch {
    // Local storage unavailable or quota exceeded
  }
};

// Inspects stroke arrays to verify actual handwritten ink exists on canvas.
// Confirms presence of at least one drawn coordinate point within stroke sets.
// Prevents submitting or uploading empty blank handwriting canvases.
/** True when the canvas holds at least one drawn point (empty notes are not saved). */
const hasInk = (strokes: unknown): boolean =>
  Array.isArray(strokes) && strokes.some((stroke) => Array.isArray(stroke) && stroke.length > 0);

// Higher-order keyboard event handler for accessible interactive card elements.
// Triggers activation callback when Enter or Space keys are pressed.
// Restricts trigger to direct target to avoid bubbling from nested inputs.
/** Lets clickable cards open on Enter/Space like a native button. */
const activateOnKey = (open: () => void) => (event: React.KeyboardEvent<HTMLElement>) => {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    open();
  }
};

// Maps financial sentiment tags to thematic badge colors and borders.
// Returns emerald for optimistic, amber for concerned, and rose for urgent.
// Defaults to cool blue for neutral or unclassified journal emotions.
const getSentimentColor =(sentiment?: string) => {
  switch (sentiment) {
    case "optimistic":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "concerned":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "urgent":
      return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";
    default:
      return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
  }
};

// Digital handwriting and financial reflection journaling interface.
// Supports vector canvas stylus drawing, AI OCR handwriting recognition, and offline sync.
// Extracts structured action items, transaction hints, and financial sentiment analysis.
export default function Notes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HandwritingCanvasHandle | null>(null);
  const configQuery = useAppConfig();
  const journalEnabled = configQuery.data?.features.journal_enabled;
  const tasksEnabled = configQuery.data?.features.tasks_enabled;

  const [recognition, setRecognition] = useState<any | null>(null);
  const [, setInsights] = useState<any | null>(null);
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [selectedInsights, setSelectedInsights] = useState<any | null>(null);

  // Offline queue & connectivity state
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [offlineQueue, setOfflineQueue] = useState<SyncOfflineNotePayload[]>(() => getStoredOfflineNotes());
  const [offlineDraftTitle, setOfflineDraftTitle] = useState("");

  // Semantic Vector Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<JournalSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [page] = useState(1);
  const [limit] = useState(10);


  // Offline Sync Mutation
  const syncOfflineMutation = useMutation({
    mutationFn: async (notesToSync: SyncOfflineNotePayload[]) => {
      return syncOfflineJournalNotes(notesToSync);
    },
    onSuccess: async (data) => {
      setStoredOfflineNotes([]);
      setOfflineQueue([]);
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-journal/entries"] });
      toast({
        title: "Offline notes synced",
        description: `Synced ${data.syncedCount} new note(s)${
          data.duplicatesSkipped > 0 ? ` (${data.duplicatesSkipped} duplicates skipped)` : ""
        }.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Sync failed",
        description: formatError(error, "Failed to synchronize offline notes."),
        variant: "destructive",
      });
    },
  });

  // Monitor network connectivity & auto-sync upon reconnecting
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const stored = getStoredOfflineNotes();
      if (stored.length > 0) {
        syncOfflineMutation.mutate(stored);
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncOfflineMutation]);

  const entriesQuery = useQuery({
    queryKey: ["/api/financial-journal/entries", page, limit],
    queryFn: () => listJournalEntries({ page, limit }),
    enabled: journalEnabled === true,
  });

  const selectedEntryQuery = useQuery({
    queryKey: ["/api/financial-journal/entries", selectedEntryId, "detail"],
    queryFn: () => getJournalEntry(String(selectedEntryId)),
    enabled: Boolean(selectedEntryId) && journalEnabled === true,
  });

  const selectedEntry = (selectedEntryQuery.data as any)?.entry;

  useEffect(() => {
    if (!selectedEntryId) {
      setEditedText("");
      setSelectedInsights(null);
      return;
    }
    setSelectedInsights(null);
  }, [selectedEntryId]);

  useEffect(() => {
    if (!selectedEntry) return;
    if (typeof selectedEntry.recognizedText === "string") {
      setEditedText(selectedEntry.recognizedText);
    }
  }, [selectedEntry]);



  // Save current canvas to offline queue
  const handleSaveOfflineDraft = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      toast({ title: "Canvas not ready", variant: "destructive" });
      return;
    }
    const strokes = canvas.getStrokes();
    if (!hasInk(strokes)) {
      toast({ title: "Nothing to save", description: "Write a note on the canvas first.", variant: "destructive" });
      return;
    }
    const clientDraftId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const title = offlineDraftTitle.trim() || `Offline Note ${new Date().toLocaleDateString()}`;
    const newDraft: SyncOfflineNotePayload = {
      clientDraftId,
      title,
      strokes,
      recognizedText: title,
      createdAt: new Date().toISOString(),
      tags: ["offline"],
    };

    const nextQueue = [newDraft, ...offlineQueue];
    setStoredOfflineNotes(nextQueue);
    setOfflineQueue(nextQueue);
    setOfflineDraftTitle("");
    toast({
      title: "Draft saved locally",
      description: "Note saved to offline queue. It will sync automatically when connected.",
    });
  }, [offlineDraftTitle, offlineQueue, toast]);

  // Semantic Vector Search trigger
  const handlePerformSemanticSearch = useCallback(
    async (overrideTag?: string) => {
      const activeTag = overrideTag !== undefined ? overrideTag : selectedTag;
      if (!searchQuery.trim() && activeTag === "all") {
        setSearchResults(null);
        return;
      }
      setIsSearching(true);
      try {
        const queryTerm = searchQuery.trim() || (activeTag !== "all" ? activeTag : "finance");
        const res = await searchJournalEntries({
          query: queryTerm,
          threshold: 0.1,
          limit: 15,
          tag: activeTag !== "all" ? activeTag : undefined,
        });
        setSearchResults(res.results || []);
      } catch (err) {
        toast({
          title: "Search failed",
          description: formatError(err, "Semantic vector search query failed."),
          variant: "destructive",
        });
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery, selectedTag, toast]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSelectedTag("all");
    setSearchResults(null);
  }, []);

  const recognizeMutation = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("Canvas not ready");
      }
      const strokes = canvas.getStrokes();
      if (!hasInk(strokes)) {
        throw new Error("Write a note on the canvas before recognizing it.");
      }
      const blob = await canvas.exportBlob();
      const file = new File([blob], `journal-${Date.now()}.png`, { type: "image/png" });
      return recognizeHandwriting(file, { strokes });
    },
    onSuccess: async (data) => {
      setRecognition(data);
      setInsights(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-journal/entries"] });
      if (data.recognized_text && data.recognized_text.trim()) {
        toast({ title: "Recognized", description: "Handwriting converted to text." });
      } else {
        const warnings = data.warnings?.length
          ? data.warnings.join("; ")
          : "AI recognition service may not be configured.";
        toast({
          title: "Recognition incomplete",
          description: `Entry saved but no text was recognized. ${warnings}`,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Recognition failed",
        description: formatError(error, "Failed to recognize handwriting."),
        variant: "destructive",
      });
    },
  });

  const selectedInsightsMutation = useMutation({
    mutationFn: (entryId: string) => generateJournalInsights(entryId),
    onSuccess: (data) => {
      setSelectedInsights(data);
    },
    onError: (error) => {
      toast({
        title: "Insights failed",
        description: formatError(error, "Failed to generate insights."),
        variant: "destructive",
      });
    },
  });

  const patchMutation = useMutation({
    mutationFn: (payload: { entryId: string; recognized_text: string }) =>
      patchJournalEntry(payload.entryId, payload.recognized_text),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-journal/entries"] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/financial-journal/entries", selectedEntryId, "detail"],
      });
      setSelectedInsights(null);
      toast({ title: "Saved", description: "Journal entry updated." });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: formatError(error, "Failed to update journal entry."),
        variant: "destructive",
      });
    },
  });

  const createTasksMutation = useMutation({
    mutationFn: (payload: { plan: any; source?: { agentOutputId?: string; requestId?: string } }) =>
      createTasksFromPlan({ plan: payload.plan, source: payload.source }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      const created = Number((data as any)?.created || 0);
      toast({
        title: "Tasks updated",
        description: created > 0 ? `Added ${created} tasks.` : "No new tasks — already added.",
      });
    },
    onError: (error) => {
      toast({
        title: "Tasks failed",
        description: formatError(error, "Couldn't add tasks from this plan."),
        variant: "destructive",
      });
    },
  });

  const createGoalMutation = useMutation({
    mutationFn: createGoal,
    onSuccess: async () => {
      toast({ title: "Goal created", description: "Saved to your financial profile." });
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
    },
    onError: (error) => {
      toast({
        title: "Goal failed",
        description: formatError(error, "Failed to create goal."),
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (payload: any) => updateFinancialProfile(payload),
    onSuccess: async () => {
      toast({ title: "Profile updated", description: "Monthly expenses updated." });
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-profiles/me"] });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: formatError(error, "Failed to update profile."),
        variant: "destructive",
      });
    },
  });

  const detected = recognition?.detected_values || {};
  const goalCandidate = Array.isArray(detected.goal_candidates) ? detected.goal_candidates[0] : null;
  const firstAmount = Array.isArray(detected.amounts) ? detected.amounts[0] : null;

  const target = Number(goalCandidate?.target ?? firstAmount?.value);
  const suggestedGoal = {
    name: String(goalCandidate?.name || "Savings Goal"),
    target: Number.isFinite(target) && target > 0 ? target : 0,
  };

  const intentChips = useMemo(() => {
    const intent = (selectedEntry?.parsedIntent || {}) as any;
    const chips: string[] = [];

    if (Array.isArray(intent.amounts)) {
      for (const a of intent.amounts) {
        if (typeof a?.value === "number") {
          chips.push(`${a.currency || "Amount"}: ${a.value}`);
        }
      }
    }
    if (Array.isArray(intent.percentages)) {
      for (const p of intent.percentages) {
        if (typeof p === "number") {
          chips.push(`${p}%`);
        }
      }
    }
    if (Array.isArray(intent.dates)) {
      for (const d of intent.dates) {
        if (typeof d === "string") {
          chips.push(d);
        }
      }
    }
    return chips;
  }, [selectedEntry?.parsedIntent]);

  if (journalEnabled === false) {
    return (
      <div className="p-6">
        <Card className="p-6" data-testid="journal-disabled-card">
          <h2 className="text-xl font-bold">Notes / Financial Journal</h2>
          <p className="mt-2 text-sm text-muted-foreground">Financial Journal is disabled on this server.</p>
        </Card>
      </div>
    );
  }

  const CATEGORY_TAGS = [
    { id: "all", label: "All Notes" },
    { id: "savings", label: "#savings" },
    { id: "budget", label: "#budget" },
    { id: "debt", label: "#debt" },
    { id: "investing", label: "#investing" },
    { id: "lifestyle", label: "#lifestyle" },
  ];

  return (
    <div className="p-6 space-y-6" data-testid="notes-page">
      {/* Page Header with Connectivity & Offline Sync Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Journal & Handwriting Notes</h1>
          <p className="text-sm text-muted-foreground">
            Draw financial notes, synchronize offline drafts, and search your journal via vector embeddings.
          </p>
        </div>

        {/* Offline & Connectivity Controls */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              isOnline
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
            data-testid="connection-status-pill"
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? "Online" : "Offline Mode"}
          </div>

          {offlineQueue.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncOfflineMutation.mutate(offlineQueue)}
              disabled={syncOfflineMutation.isPending || !isOnline}
              className="gap-2 text-xs"
              data-testid="btn-sync-offline-strokes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncOfflineMutation.isPending ? "animate-spin" : ""}`} />
              Sync Offline Notes
              <span
                className="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-bold text-[10px]"
                data-testid="badge-offline-queue-count"
              >
                {offlineQueue.length}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Offline Status Cockpit if notes are queued */}
      {offlineQueue.length > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5 space-y-2" data-testid="card-offline-journal-sync">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <CloudOff className="w-4 h-4" />
              <span>{offlineQueue.length} Offline Draft(s) Queued for Synchronization</span>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => syncOfflineMutation.mutate(offlineQueue)}
              disabled={syncOfflineMutation.isPending || !isOnline}
              className="text-xs"
            >
              {syncOfflineMutation.isPending ? "Syncing…" : "Flush & Sync Now"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Strokes and notes saved while offline are held locally in your secure client queue. They sync
            automatically when network connectivity resumes.
          </p>
        </Card>
      )}

      {/* Main Grid: Canvas + Suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Handwriting Canvas */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Handwriting note</div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="undo-btn"
                  onClick={() => canvasRef.current?.undo()}
                >
                  Undo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="clear-btn"
                  onClick={() => canvasRef.current?.clear()}
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="btn-save-offline-draft"
                  onClick={handleSaveOfflineDraft}
                  title="Save current canvas locally to sync offline"
                  className="gap-1.5"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  Save Offline Draft
                </Button>
                <Button
                  size="sm"
                  data-testid="recognize-btn"
                  onClick={() => recognizeMutation.mutate()}
                  disabled={recognizeMutation.isPending}
                >
                  {recognizeMutation.isPending ? "Recognizing…" : "Recognize"}
                </Button>
              </div>
            </div>

            <HandwritingCanvas ref={canvasRef} height={360} />
          </Card>

          {/* OCR Result Box */}
          {recognition ? (
            <Card className="p-4 space-y-3" data-testid="recognition-result-card">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">Recognized content</div>
                <div className="text-xs text-muted-foreground" data-testid="recognition-confidence">
                  Confidence: {Math.round(((recognition.confidence?.overall ?? 0) as number) * 100)}%
                </div>
              </div>

              {/* Tags & Sentiment Badges */}
              <div className="flex flex-wrap items-center gap-2">
                {recognition.sentiment && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${getSentimentColor(
                      recognition.sentiment
                    )}`}
                    data-testid="badge-recognition-sentiment"
                  >
                    {recognition.sentiment}
                  </span>
                )}
                {Array.isArray(recognition.tags) &&
                  recognition.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
              </div>

              <textarea
                data-testid="recognized-text-area"
                value={recognition.recognized_text || ""}
                readOnly
                className="w-full min-h-24 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
              />
            </Card>
          ) : null}
        </div>

        {/* Right Col: Goal Suggestions & Quick Profile Sync */}
        <div className="space-y-4">
          {suggestedGoal.target > 0 ? (
            <Card className="p-4 space-y-3" data-testid="goal-suggestion-box">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                Detected goal suggestion
              </div>
              <p className="text-xs text-muted-foreground">
                We found a financial goal target in your handwriting. Add it directly to your financial profile:
              </p>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-medium text-foreground">{suggestedGoal.name}</div>
                <div className="text-muted-foreground">Target: ${suggestedGoal.target.toLocaleString()}</div>
              </div>
              <Button
                className="w-full"
                data-testid="create-goal-btn"
                onClick={() =>
                  createGoalMutation.mutate({
                    name: suggestedGoal.name,
                    target: suggestedGoal.target,
                    current: 0,
                    deadline: ymdFromNow(6),
                    priority: 1,
                  })
                }
                disabled={createGoalMutation.isPending}
              >
                {createGoalMutation.isPending ? "Creating…" : "Save Goal to Profile"}
              </Button>
            </Card>
          ) : null}

          {/* Quick Profile Expenses Update */}
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-foreground">Update monthly expenses</div>
            <p className="text-xs text-muted-foreground">
              Adjust baseline expenses based on your notebook estimates.
            </p>
            <div className="space-y-2">
              <input
                type="number"
                placeholder="e.g. 3500"
                value={monthlyExpenses}
                onChange={(e) => setMonthlyExpenses(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                data-testid="monthly-expenses-input"
              />
              <Button
                className="w-full"
                variant="outline"
                data-testid="update-expenses-btn"
                onClick={() =>
                  updateProfileMutation.mutate({
                    monthly_expenses: Number(monthlyExpenses),
                  })
                }
                disabled={!monthlyExpenses || updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? "Updating…" : "Update Profile"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Semantic Vector Search Cockpit */}
      <Card className="p-5 space-y-4" data-testid="card-journal-semantic-search">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Semantic Vector Search & Concept Filter
            </h2>
            <p className="text-xs text-muted-foreground">
              Query your journal notes using 64-dimensional vector embeddings and cosine similarity.
            </p>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search concepts (e.g. emergency savings cushion, grocery budget, debt payoff)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePerformSemanticSearch()}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background"
              data-testid="input-semantic-search"
            />
          </div>
          <Button
            size="sm"
            onClick={() => handlePerformSemanticSearch()}
            disabled={isSearching}
            data-testid="btn-semantic-search"
          >
            {isSearching ? "Searching…" : "Search"}
          </Button>
          {(searchQuery || selectedTag !== "all" || searchResults) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSearch}
              data-testid="btn-clear-search"
            >
              Clear
            </Button>
          )}
        </div>

        {/* Tag Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" /> Concept:
          </span>
          {CATEGORY_TAGS.map((tag) => (
            <button
              key={tag.id}
              onClick={() => {
                setSelectedTag(tag.id);
                handlePerformSemanticSearch(tag.id);
              }}
              data-testid={`chip-tag-${tag.id}`}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedTag === tag.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground"
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>

        {/* Search Results Display */}
        {searchResults !== null && (
          <div className="mt-4 space-y-3 pt-3 border-t border-border" data-testid="semantic-search-results">
            <div className="text-xs font-semibold text-muted-foreground">
              Found {searchResults.length} semantic vector match(es):
            </div>
            {searchResults.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2" data-testid="empty-search-results">
                No matching notes found matching this semantic vector threshold.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 cursor-pointer transition-all space-y-2"
                    data-testid="search-result-item"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open journal note: ${(result.recognizedText || "Handwritten note").slice(0, 80)}`}
                    onClick={() => setSelectedEntryId(result.id)}
                    onKeyDown={activateOnKey(() => setSelectedEntryId(result.id))}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20"
                        data-testid={`badge-similarity-score-${result.id}`}
                      >
                        {Math.round(result.similarityScore * 100)}% Match
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize border ${getSentimentColor(
                          result.sentiment
                        )}`}
                      >
                        {result.sentiment}
                      </span>
                    </div>

                    <div className="text-sm font-medium line-clamp-2">
                      {result.recognizedText || "(Handwritten note)"}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {result.tags.map((t) => (
                        <span key={t} className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Recent Journal Entries List */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Recent Journal Notes</h2>
            <div className="text-xs text-muted-foreground">
              Total notes: {entriesQuery.data?.pagination?.total ?? 0}
            </div>
          </div>

          {entriesQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading journal notes…</div>
          ) : (
            <div className="space-y-3">
              {entriesQuery.data?.entries?.map((entry: any) => (
                <div
                  key={entry.id}
                  data-testid="journal-entry-item"
                  className="rounded-lg border border-border p-4 hover:bg-muted/40 cursor-pointer transition-colors space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open journal note from ${new Date(entry.createdAt).toLocaleString()}`}
                  onClick={() => setSelectedEntryId(String(entry.id))}
                  onKeyDown={activateOnKey(() => setSelectedEntryId(String(entry.id)))}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.sentiment && (
                        <span
                          className={`rounded-full border px-2 py-0.2 text-[10px] font-medium capitalize ${getSentimentColor(
                            entry.sentiment
                          )}`}
                          data-testid={`badge-sentiment-${entry.id}`}
                        >
                          {entry.sentiment}
                        </span>
                      )}
                      {entry.hasEmbedding && (
                        <span className="text-[10px] text-primary/80 font-mono">64d vector</span>
                      )}
                    </div>
                  </div>

                  <div className="text-sm">{String(entry.recognizedText || "").slice(0, 200)}</div>

                  {Array.isArray(entry.tags) && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {entry.tags.map((tag: string) => (
                        <span key={tag} className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!entriesQuery.data?.entries?.length ? (
                <div className="text-sm text-muted-foreground" data-testid="journal-empty-entries">
                  No journal entries yet.
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Entry Detail Sheet */}
      <Sheet open={Boolean(selectedEntryId)} onOpenChange={(open) => !open && setSelectedEntryId(null)}>
        <SheetContent side="right" className="sm:max-w-xl w-full" data-testid="journal-detail-sheet">
          <SheetHeader>
            <SheetTitle>Journal entry</SheetTitle>
            <SheetDescription>Edit text, review intent, tags, and generate insights.</SheetDescription>
          </SheetHeader>

          {!selectedEntry ? (
            <div className="mt-4 text-sm text-muted-foreground">
              {selectedEntryQuery.isLoading ? "Loading…" : "No entry selected."}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {selectedEntry.fileId ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <img
                    src={buildApiUrl(`/media/${selectedEntry.fileId}`)}
                    alt="Journal entry"
                    className="w-full h-auto"
                  />
                </div>
              ) : null}

              {/* Sentiment & Tags */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedEntry.sentiment && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${getSentimentColor(
                      selectedEntry.sentiment
                    )}`}
                  >
                    {selectedEntry.sentiment}
                  </span>
                )}
                {Array.isArray(selectedEntry.tags) &&
                  selectedEntry.tags.map((t: string) => (
                    <span
                      key={t}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      #{t}
                    </span>
                  ))}
              </div>

              {intentChips.length ? (
                <div className="flex flex-wrap gap-2" data-testid="sheet-intent-chips">
                  {intentChips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}

              <div>
                <label className="text-sm font-medium">Recognized text</label>
                <textarea
                  data-testid="sheet-recognized-text"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="mt-1 w-full min-h-40 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  maxLength={5000}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    variant="outline"
                    data-testid="sheet-save-btn"
                    onClick={() =>
                      patchMutation.mutate({ entryId: String(selectedEntry.id), recognized_text: editedText })
                    }
                    disabled={patchMutation.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    data-testid="sheet-generate-insights-btn"
                    onClick={() => selectedInsightsMutation.mutate(String(selectedEntry.id))}
                    disabled={selectedInsightsMutation.isPending}
                  >
                    Generate insights
                  </Button>
                </div>
              </div>

              {selectedInsights?.response ? (
                <Card className="p-4 space-y-3" data-testid="sheet-ai-insights-box">
                  <div className="text-sm font-semibold text-foreground">AI insights</div>
                  <div className="text-sm whitespace-pre-wrap text-foreground">
                    {String(selectedInsights.response)}
                  </div>

                  {selectedInsights.plan ? (
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        data-testid="sheet-add-tasks-btn"
                        onClick={() =>
                          createTasksMutation.mutate({
                            plan: selectedInsights.plan,
                            source: {
                              agentOutputId: selectedInsights.agent_output_id,
                              requestId: selectedInsights.request_id,
                            },
                          })
                        }
                        disabled={createTasksMutation.isPending || tasksEnabled === false}
                        title={
                          tasksEnabled === false
                            ? "Tasks are disabled on this server."
                            : "Add tasks from this plan"
                        }
                      >
                        Add tasks from plan
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

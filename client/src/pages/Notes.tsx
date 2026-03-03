import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  updateFinancialProfile,
} from "@/lib/apiClient";
import { HandwritingCanvas, type HandwritingCanvasHandle } from "@/features/journaling/HandwritingCanvas";
import { useAppConfig } from "@/hooks/useAppConfig";
import { buildApiUrl } from "@/lib/apiBase";

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

const ymdFromNow = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export default function Notes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HandwritingCanvasHandle | null>(null);
  const configQuery = useAppConfig();
  const journalEnabled = configQuery.data?.features.journal_enabled;
  const tasksEnabled = configQuery.data?.features.tasks_enabled;

  const [recognition, setRecognition] = useState<any | null>(null);
  const [insights, setInsights] = useState<any | null>(null);
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [selectedInsights, setSelectedInsights] = useState<any | null>(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(10);

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

  const recognizeMutation = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("Canvas not ready");
      }
      const blob = await canvas.exportBlob();
      const file = new File([blob], `journal-${Date.now()}.png`, { type: "image/png" });
      const strokes = canvas.getStrokes();
      return recognizeHandwriting(file, { strokes });
    },
    onSuccess: async (data) => {
      setRecognition(data);
      setInsights(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-journal/entries"] });
      if (data.recognized_text && data.recognized_text.trim()) {
        toast({ title: "Recognized", description: "Handwriting converted to text." });
      } else {
        const warnings = data.warnings?.length ? data.warnings.join("; ") : "AI recognition service may not be configured.";
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

  const insightsMutation = useMutation({
    mutationFn: (entryId: string) => generateJournalInsights(entryId),
    onSuccess: (data) => {
      setInsights(data);
    },
    onError: (error) => {
      toast({
        title: "Insights failed",
        description: formatError(error, "Failed to generate insights."),
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
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-journal/entries", selectedEntryId, "detail"] });
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
      for (const item of intent.amounts.slice(0, 3)) {
        if (item && typeof item === "object" && typeof item.value === "number") {
          chips.push(`Amount: ${item.currency ? `${item.currency} ` : ""}${item.value}`);
        }
      }
    }
    if (Array.isArray(intent.percentages)) {
      for (const p of intent.percentages.slice(0, 3)) {
        chips.push(`Pct: ${p}%`);
      }
    }
    if (Array.isArray(intent.dates)) {
      for (const d of intent.dates.slice(0, 3)) {
        chips.push(`Date: ${d}`);
      }
    }
    if (Array.isArray(intent.goal_candidates) && intent.goal_candidates.length) {
      const c = intent.goal_candidates[0];
      if (c?.name) chips.push(`Goal: ${c.name}`);
    }
    return chips;
  }, [selectedEntry?.parsedIntent]);

  if (journalEnabled === false) {
    return (
      <div className="flex-1 p-6 overflow-auto" data-testid="notes-page">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
          <Card className="p-6">
            <h1 className="text-2xl font-bold text-foreground">Financial Journal</h1>
            <p className="text-sm text-muted-foreground mt-2">Financial Journal is disabled on this server.</p>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="notes-page">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold text-foreground">Financial Journal</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => canvasRef.current?.undo()}>
              Undo
            </Button>
            <Button variant="outline" onClick={() => canvasRef.current?.clear()}>
              Clear
            </Button>
            <Button onClick={() => recognizeMutation.mutate()} disabled={recognizeMutation.isPending}>
              Recognize
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground mb-6">
          Write budget notes or goals by hand, convert to searchable text, then ask AI for insights.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium">Canvas</div>
            <HandwritingCanvas
              ref={canvasRef}
              height={360}
              className="w-full rounded-md border border-border bg-background text-foreground touch-none"
            />
            <div className="text-xs text-muted-foreground">
              Tip: use a stylus for best handwriting recognition.
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Recognition</div>
              {recognition?.entry_id ? (
                <Button
                  variant="outline"
                  onClick={() => insightsMutation.mutate(recognition.entry_id)}
                  disabled={insightsMutation.isPending}
                >
                  Generate Insights
                </Button>
              ) : null}
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Recognized text</label>
              <textarea
                value={String(recognition?.recognized_text || "")}
                readOnly
                className="mt-1 w-full min-h-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Your recognized text will appear here…"
              />
              {recognition?.confidence?.overall !== undefined ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Confidence: {Math.round(Number(recognition.confidence.overall) * 100)}%
                </div>
              ) : null}
            </div>

            {Array.isArray(detected.amounts) && detected.amounts.length ? (
              <div className="text-sm">
                <div className="font-medium">Detected values</div>
                <div className="mt-1 text-muted-foreground text-xs">
                  Amounts:{" "}
                  {detected.amounts
                    .slice(0, 5)
                    .map((a: any) => `${a.currency ? a.currency + " " : ""}${a.value}`)
                    .join(", ")}
                </div>
                {Array.isArray(detected.percentages) && detected.percentages.length ? (
                  <div className="text-muted-foreground text-xs">
                    Percentages: {detected.percentages.slice(0, 5).join(", ")}%
                  </div>
                ) : null}
                {Array.isArray(detected.dates) && detected.dates.length ? (
                  <div className="text-muted-foreground text-xs">
                    Dates: {detected.dates.slice(0, 5).join(", ")}
                  </div>
                ) : null}
              </div>
            ) : null}

            {suggestedGoal.target > 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="text-sm">
                  <div className="font-medium">Goal suggestion</div>
                  <div className="text-xs text-muted-foreground">
                    {suggestedGoal.name}: {suggestedGoal.target}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    createGoalMutation.mutate({
                      name: suggestedGoal.name,
                      target: suggestedGoal.target,
                      current: 0,
                      deadline: ymdFromNow(12),
                      priority: 1,
                    })
                  }
                  disabled={createGoalMutation.isPending}
                >
                  Create Goal
                </Button>
              </div>
            ) : null}

            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="text-sm font-medium">Update monthly expenses</div>
              <div className="flex gap-2">
                <input
                  value={monthlyExpenses}
                  onChange={(e) => setMonthlyExpenses(e.target.value)}
                  type="number"
                  min={0}
                  step="1"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. 35000"
                />
                <Button
                  variant="outline"
                  onClick={() => updateProfileMutation.mutate({ monthly_expenses: Number(monthlyExpenses) })}
                  disabled={updateProfileMutation.isPending || !(Number(monthlyExpenses) > 0)}
                >
                  Update
                </Button>
              </div>
            </div>

            {insights?.response ? (
              <div className="rounded-md border border-border p-3">
                <div className="text-sm font-medium mb-1">AI insights</div>
                <div className="text-sm whitespace-pre-wrap">{String(insights.response)}</div>
              </div>
            ) : null}
          </Card>
        </div>

        <Card className="p-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Recent entries</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>

          {entriesQuery.isLoading ? (
            <div className="mt-3 text-sm text-muted-foreground">Loading entries…</div>
          ) : (
            <div className="mt-3 space-y-2">
              {(entriesQuery.data?.entries || []).map((entry: any) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-border p-3 cursor-pointer hover:bg-accent/30"
                  onClick={() => setSelectedEntryId(String(entry.id))}
                >
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                  <div className="text-sm mt-1">{String(entry.recognizedText || "").slice(0, 200)}</div>
                </div>
              ))}
              {!entriesQuery.data?.entries?.length ? (
                <div className="text-sm text-muted-foreground">No journal entries yet.</div>
              ) : null}
            </div>
          )}
        </Card>
      </motion.div>

      <Sheet open={Boolean(selectedEntryId)} onOpenChange={(open) => !open && setSelectedEntryId(null)}>
        <SheetContent side="right" className="sm:max-w-xl w-full">
          <SheetHeader>
            <SheetTitle>Journal entry</SheetTitle>
            <SheetDescription>Edit text, review intent, and generate insights.</SheetDescription>
          </SheetHeader>

          {!selectedEntry ? (
            <div className="mt-4 text-sm text-muted-foreground">
              {selectedEntryQuery.isLoading ? "Loading…" : "No entry selected."}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {selectedEntry.fileId ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <img src={buildApiUrl(`/media/${selectedEntry.fileId}`)} alt="Journal entry" className="w-full h-auto" />
                </div>
              ) : null}

              {intentChips.length ? (
                <div className="flex flex-wrap gap-2">
                  {intentChips.map((chip) => (
                    <span key={chip} className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}

              <div>
                <label className="text-sm font-medium">Recognized text</label>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="mt-1 w-full min-h-40 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  maxLength={5000}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      patchMutation.mutate({ entryId: String(selectedEntry.id), recognized_text: editedText })
                    }
                    disabled={patchMutation.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => selectedInsightsMutation.mutate(String(selectedEntry.id))}
                    disabled={selectedInsightsMutation.isPending}
                  >
                    Generate insights
                  </Button>
                </div>
              </div>

              {selectedInsights?.response ? (
                <Card className="p-4 space-y-3">
                  <div className="text-sm font-semibold text-foreground">AI insights</div>
                  <div className="text-sm whitespace-pre-wrap text-foreground">{String(selectedInsights.response)}</div>

                  {selectedInsights.plan ? (
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
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
                        title={tasksEnabled === false ? "Tasks are disabled on this server." : "Add tasks from this plan"}
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

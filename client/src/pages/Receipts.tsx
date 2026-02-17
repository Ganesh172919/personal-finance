import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/hooks/useToast";
import { useAppConfig } from "@/hooks/useAppConfig";
import { buildApiUrl } from "@/lib/apiBase";
import {
  ApiError,
  confirmReceipt,
  deleteReceipt,
  getReceiptById,
  listReceipts,
  type ReceiptConfirmPayload,
  type ReceiptRecord,
  type ReceiptStatus,
} from "@/lib/apiClient";

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

const formatDateTime = (value?: string | Date) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

const toNumberOr = (value: any, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export default function ReceiptsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const configQuery = useAppConfig();
  const receiptsEnabled = configQuery.data?.features.receipts_ocr_enabled;

  const [tab, setTab] = useState<ReceiptStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["/api/receipts", page, limit],
    queryFn: () => listReceipts({ page, limit }),
    enabled: receiptsEnabled === true,
  });

  const receipts = useMemo(() => {
    const rows = (listQuery.data?.receipts || []) as ReceiptRecord[];
    if (tab === "all") return rows;
    return rows.filter((r) => r.status === tab);
  }, [listQuery.data?.receipts, tab]);

  const detailQuery = useQuery({
    queryKey: ["/api/receipts", selectedId, "detail"],
    queryFn: () => getReceiptById(String(selectedId)),
    enabled: Boolean(selectedId) && receiptsEnabled === true,
  });

  const receipt = detailQuery.data?.receipt;

  const [form, setForm] = useState<ReceiptConfirmPayload>({
    vendor: "",
    date: "",
    total: 0,
    tax: undefined,
    currency: "INR",
    category: "Other",
    description: "",
    items: undefined,
  });

  useEffect(() => {
    if (!receipt) return;
    const extracted = (receipt.corrections || receipt.extracted || {}) as any;
    setForm({
      vendor: String(extracted.vendor || "").trim(),
      date: String(extracted.date || "").trim(),
      total: toNumberOr(extracted.total, 0),
      tax: extracted.tax === null || extracted.tax === undefined ? undefined : toNumberOr(extracted.tax, 0),
      currency: String(extracted.currency || "INR").trim() || "INR",
      category: String((receipt.extracted as any)?.category_suggestion || "Other").trim() || "Other",
      description: String(extracted.vendor || "").trim(),
      items: Array.isArray(extracted.items) ? extracted.items : undefined,
    });
  }, [receipt]);

  const confirmMutation = useMutation({
    mutationFn: (payload: { id: string; data: ReceiptConfirmPayload }) => confirmReceipt(payload.id, payload.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Confirmed", description: "Transaction created from receipt." });
      setSelectedId(null);
    },
    onError: (error) => {
      toast({ title: "Confirm failed", description: formatError(error, "Failed to confirm receipt."), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReceipt(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      toast({ title: "Deleted", description: "Receipt deleted." });
      setSelectedId(null);
    },
    onError: (error) => {
      toast({ title: "Delete failed", description: formatError(error, "Failed to delete receipt."), variant: "destructive" });
    },
  });

  if (receiptsEnabled === false) {
    return (
      <div className="flex-1 p-6 overflow-auto" data-testid="receipts-page">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
          <Card className="p-6">
            <h1 className="text-2xl font-bold text-foreground">Receipts</h1>
            <p className="text-sm text-muted-foreground mt-2">Receipt OCR is disabled on this server.</p>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="receipts-page">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Receipts</h1>
          <p className="text-sm text-muted-foreground">Review, correct, and confirm OCR results.</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="parsed">Parsed</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <Card className="p-4">
              {configQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : listQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading receipts…</div>
              ) : listQuery.error ? (
                <div className="text-sm text-muted-foreground">
                  {formatError(listQuery.error, "Failed to load receipts.")}
                </div>
              ) : receipts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No receipts found.</div>
              ) : (
                <div className="space-y-2">
                  {receipts.map((r) => {
                    const base = (r.corrections || r.extracted || {}) as any;
                    return (
                      <div
                        key={r.id}
                        className="rounded-md border border-border p-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-accent/30"
                        onClick={() => setSelectedId(r.id)}
                      >
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">{r.status}</div>
                          <div className="font-medium text-foreground truncate">{String(base.vendor || "Unknown vendor")}</div>
                          <div className="text-xs text-muted-foreground">
                            {String(base.date || "—")} • Total: {base.total ?? "—"} {String(base.currency || "")}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground flex-shrink-0">{formatDateTime(r.createdAt)}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Prev
                </Button>
                <div className="text-xs text-muted-foreground">Page {page}</div>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= (listQuery.data?.pagination.totalPages || 1)}>
                  Next
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="sm:max-w-xl w-full">
          <SheetHeader>
            <SheetTitle>Receipt</SheetTitle>
            <SheetDescription>Review extracted fields and confirm.</SheetDescription>
          </SheetHeader>

          {!receipt ? (
            <div className="mt-4 text-sm text-muted-foreground">{detailQuery.isLoading ? "Loading…" : "No receipt selected."}</div>
          ) : (
            <div className="mt-4 space-y-4">
              {receipt.fileId ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <img src={buildApiUrl(`/media/${receipt.fileId}`)} alt="Receipt" className="w-full h-auto" />
                </div>
              ) : null}

              <div className="rounded-md border border-border p-3 text-sm">
                <div className="text-muted-foreground">Status: {receipt.status}</div>
                <div className="text-muted-foreground">Created: {formatDateTime(receipt.createdAt)}</div>
              </div>

              {receipt.status === "confirmed" ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  This receipt is already confirmed and cannot be deleted.
                </div>
              ) : null}

              <Card className="p-4 space-y-3">
                <div className="text-sm font-semibold text-foreground">Confirm fields</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Vendor</Label>
                    <Input value={form.vendor} onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} placeholder="YYYY-MM-DD" />
                  </div>
                  <div>
                    <Label>Total</Label>
                    <Input
                      value={form.total}
                      onChange={(e) => setForm((p) => ({ ...p, total: toNumberOr(e.target.value, 0) }))}
                      type="number"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label>Tax</Label>
                    <Input
                      value={form.tax ?? ""}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, tax: e.target.value === "" ? undefined : toNumberOr(e.target.value, 0) }))
                      }
                      type="number"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Input value={form.currency || ""} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description</Label>
                    <Input value={form.description || ""} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  {receipt.status === "parsed" ? (
                    <Button
                      variant="destructive"
                      onClick={() => selectedId && deleteMutation.mutate(selectedId)}
                      disabled={deleteMutation.isPending}
                      title="Delete receipt (only allowed before confirmation)"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  ) : null}

                  <Button
                    onClick={() =>
                      selectedId &&
                      confirmMutation.mutate({
                        id: selectedId,
                        data: {
                          vendor: form.vendor.trim(),
                          date: form.date,
                          total: Number(form.total),
                          tax: form.tax === undefined ? undefined : Number(form.tax),
                          currency: form.currency?.trim() || undefined,
                          category: form.category.trim(),
                          description: form.description?.trim() || undefined,
                          items: Array.isArray(form.items) ? form.items : undefined,
                        },
                      })
                    }
                    disabled={
                      confirmMutation.isPending ||
                      receipt.status === "confirmed" ||
                      !form.vendor.trim() ||
                      !form.date ||
                      !(Number(form.total) > 0)
                    }
                  >
                    Confirm & Create
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}


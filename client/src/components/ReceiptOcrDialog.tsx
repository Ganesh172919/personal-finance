import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { useToast } from "@/hooks/useToast";
import { useAppConfig } from "@/hooks/useAppConfig";
import {
  ApiError,
  confirmReceipt,
  parseReceipt,
  type ReceiptConfirmPayload,
  type ReceiptParseResponse,
} from "@/lib/apiClient";

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

const toNumberOr = (value: any, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const confidenceLabel = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return `${Math.round(Math.max(0, Math.min(1, num)) * 100)}%`;
};

export function ReceiptOcrDialog(props: { onConfirmed?: () => void; currencyHint?: string }) {
  const currencyHint = props.currencyHint || "INR";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const configQuery = useAppConfig();
  const receiptsEnabled = configQuery.data?.features.receipts_ocr_enabled;

  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ReceiptParseResponse | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);

  const [form, setForm] = useState<ReceiptConfirmPayload>({
    vendor: "",
    date: "",
    total: 0,
    tax: undefined,
    currency: currencyHint,
    category: "Other",
    description: "",
    items: undefined,
  });

  const reset = () => {
    setResult(null);
    setItemsOpen(false);
    setForm({
      vendor: "",
      date: "",
      total: 0,
      tax: undefined,
      currency: currencyHint,
      category: "Other",
      description: "",
      items: undefined,
    });
  };

  const parseMutation = useMutation({
    mutationFn: (file: File) => parseReceipt(file, { currencyHint }),
    onSuccess: (data) => {
      setResult(data);
      const extracted = (data?.extracted || {}) as any;
      const items = Array.isArray(extracted.items) ? extracted.items : undefined;
      setForm({
        vendor: String(extracted.vendor || "").trim(),
        date: String(extracted.date || "").trim(),
        total: toNumberOr(extracted.total, 0),
        tax: extracted.tax === null || extracted.tax === undefined ? undefined : toNumberOr(extracted.tax, 0),
        currency: String(extracted.currency || currencyHint).trim() || currencyHint,
        category: String(extracted.category_suggestion || "Other").trim() || "Other",
        description: String(extracted.vendor || "").trim(),
        items,
      });
      setItemsOpen(false);
    },
    onError: (error) => {
      toast({
        title: "OCR failed",
        description: formatError(error, "Failed to extract receipt data."),
        variant: "destructive",
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (payload: { receiptId: string; data: ReceiptConfirmPayload }) =>
      confirmReceipt(payload.receiptId, payload.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setOpen(false);
      reset();
      props.onConfirmed?.();
      toast({ title: "Saved", description: "Transaction created from receipt." });
    },
    onError: (error) => {
      toast({
        title: "Confirm failed",
        description: formatError(error, "Failed to confirm receipt."),
        variant: "destructive",
      });
    },
  });

  const extractedItems = useMemo(() => {
    const items = (result?.extracted as any)?.items;
    return Array.isArray(items) ? items : [];
  }, [result?.extracted]);

  const handleFile = (file: File) => {
    reset();
    parseMutation.mutate(file);
  };

  const handleConfirm = async () => {
    if (!result?.receipt_id) return;

    const payload: ReceiptConfirmPayload = {
      vendor: form.vendor.trim(),
      date: form.date,
      total: Number(form.total),
      tax: form.tax === undefined ? undefined : Number(form.tax),
      currency: form.currency?.trim() || undefined,
      category: form.category.trim(),
      description: form.description?.trim() || undefined,
      items: Array.isArray(form.items) ? form.items : undefined,
    };

    await confirmMutation.mutateAsync({ receiptId: result.receipt_id, data: payload });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={receiptsEnabled === false}
          title={receiptsEnabled === false ? "Receipt OCR is disabled on this server." : undefined}
        >
          Scan Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Receipt OCR</DialogTitle>
          <DialogDescription>Upload a receipt image, review extracted fields, then confirm.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              handleFile(file);
            }}
          />

          {parseMutation.isPending ? (
            <Card className="p-4 text-sm text-muted-foreground">Extracting receipt details…</Card>
          ) : null}

          {result?.warnings?.length ? (
            <Card className="p-4">
              <div className="text-sm font-medium mb-2">Warnings</div>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                {result.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          {result ? (
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">
                    Vendor{" "}
                    <span className="text-xs text-muted-foreground">
                      {confidenceLabel((result.confidence as any)?.vendor)}
                    </span>
                  </label>
                  <input
                    value={form.vendor}
                    onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                    placeholder="Vendor"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Date{" "}
                    <span className="text-xs text-muted-foreground">
                      {confidenceLabel((result.confidence as any)?.date)}
                    </span>
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Total{" "}
                    <span className="text-xs text-muted-foreground">
                      {confidenceLabel((result.confidence as any)?.total)}
                    </span>
                  </label>
                  <input
                    type="number"
                    value={form.total}
                    onChange={(e) => setForm((prev) => ({ ...prev, total: toNumberOr(e.target.value, 0) }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                    min={0}
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Tax{" "}
                    <span className="text-xs text-muted-foreground">
                      {confidenceLabel((result.confidence as any)?.tax)}
                    </span>
                  </label>
                  <input
                    type="number"
                    value={form.tax ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        tax: e.target.value === "" ? undefined : toNumberOr(e.target.value, 0),
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                    min={0}
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Category</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                    placeholder="Food, Rent..."
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <input
                    value={form.currency || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                    placeholder="INR"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm font-medium">Description</label>
                  <input
                    value={form.description || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                    placeholder="Optional"
                  />
                </div>
              </div>

              {extractedItems.length ? (
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setItemsOpen((v) => !v)}>
                    {itemsOpen ? "Hide" : "Show"} items ({extractedItems.length})
                  </Button>
                  {itemsOpen ? (
                    <div className="mt-2 overflow-x-auto rounded-md border border-border">
                      <table className="min-w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-3 py-2 text-left">Description</th>
                            <th className="px-3 py-2 text-left">Total</th>
                            <th className="px-3 py-2 text-left">Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extractedItems.slice(0, 20).map((item: any, idx: number) => (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-3 py-2">{String(item.description || "")}</td>
                              <td className="px-3 py-2">{item.total ?? ""}</td>
                              <td className="px-3 py-2">{confidenceLabel(item.confidence)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={
                    confirmMutation.isPending ||
                    !form.vendor.trim() ||
                    !form.date ||
                    !(Number(form.total) > 0)
                  }
                >
                  Confirm & Create
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

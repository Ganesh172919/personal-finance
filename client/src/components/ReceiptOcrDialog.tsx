/**
 * @fileoverview ReceiptOcrDialog — two-step receipt scanning flow: upload an image to
 * extract vendor/date/total/tax via OCR, then review and confirm to create a transaction.
 *
 * WHAT IT DOES
 *  - Step 1 (Parse): user uploads a receipt image; `parseReceipt` mutation sends it to
 *    the server which returns extracted fields, confidence scores, line items, and warnings.
 *  - Step 2 (Confirm): user reviews/edits extracted fields (vendor, date, total, tax,
 *    category, currency, description) and optionally toggles a line-items table.
 *    On confirm, `confirmReceipt` mutation creates a transaction on the server.
 *  - Feature-gated: disabled button when `receipts_ocr_enabled` is false in app config.
 *
 * KEY PROPS & DATA FLOW
 *  - `onConfirmed` (() => void) — optional callback after successful transaction creation.
 *  - `currencyHint` (string) — fallback currency from org config.
 *  - Mutations: `parseReceipt`, `confirmReceipt`.
 *
 * ARCHITECTURE NOTES
 *  - Triggered by a "Scan Receipt" button rendered inline in the transactions page.
 *  - Uses file input with `capture="environment"` for mobile camera support.
 *  - Confidence labels with color-coded badges are displayed next to each extracted field
 *    so users know which values may need manual correction.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
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

/** Color-coded confidence score badge */
const ConfidenceBadge = ({ score, field }: { score?: unknown; field: string }) => {
  const num = Number(score);
  if (!Number.isFinite(num)) return null;
  const pct = Math.round(Math.max(0, Math.min(1, num)) * 100);
  const color =
    num >= 0.7
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : num >= 0.4
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30";

  return (
    <Badge
      variant="outline"
      data-testid={`badge-confidence-${field}`}
      className={`${color} border text-[10px] font-mono`}
    >
      {pct}%
    </Badge>
  );
};

export function ReceiptOcrDialog(props: { onConfirmed?: () => void; currencyHint?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const configQuery = useAppConfig();
  const currencyHint = props.currencyHint || configQuery.data?.org?.currency || "USD";
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
        date: String(extracted.date || "").trim() || new Date().toISOString().slice(0, 10),
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
          data-testid="btn-scan-receipt"
        >
          Scan Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl" data-testid="dialog-receipt-ocr">
        <DialogHeader>
          <DialogTitle>Receipt OCR</DialogTitle>
          <DialogDescription>Upload a receipt image, review extracted fields, then confirm.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            type="file"
            aria-label="Receipt image"
            data-testid="input-receipt-file"
            className="block w-full min-w-0 max-w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              handleFile(file);
            }}
          />

          {parseMutation.isPending ? (
            <Card className="p-4 text-sm text-muted-foreground animate-pulse" data-testid="ocr-loading-card">
              Extracting receipt details…
            </Card>
          ) : null}

          {result?.warnings?.length ? (
            <Card className="p-4 border-amber-500/30 bg-amber-500/5" data-testid="ocr-warnings-card">
              <div className="text-sm font-medium text-amber-400 mb-2">Warnings</div>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                {result.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          {result ? (
            <Card className="p-4 space-y-4" data-testid="ocr-review-form">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="ocr-vendor" className="text-sm font-medium">
                      Vendor
                    </Label>
                    <ConfidenceBadge score={(result.confidence as any)?.vendor} field="vendor" />
                  </div>
                  <Input
                    id="ocr-vendor"
                    data-testid="input-ocr-vendor"
                    value={form.vendor}
                    onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
                    placeholder="Vendor"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="ocr-date" className="text-sm font-medium">
                      Date
                    </Label>
                    <ConfidenceBadge score={(result.confidence as any)?.date} field="date" />
                  </div>
                  <Input
                    id="ocr-date"
                    data-testid="input-ocr-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="ocr-total" className="text-sm font-medium">
                      Total
                    </Label>
                    <ConfidenceBadge score={(result.confidence as any)?.total} field="total" />
                  </div>
                  <Input
                    id="ocr-total"
                    data-testid="input-ocr-total"
                    type="number"
                    value={form.total}
                    onChange={(e) => setForm((prev) => ({ ...prev, total: toNumberOr(e.target.value, 0) }))}
                    min={0}
                    step="0.01"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="ocr-tax" className="text-sm font-medium">
                      Tax
                    </Label>
                    <ConfidenceBadge score={(result.confidence as any)?.tax} field="tax" />
                  </div>
                  <Input
                    id="ocr-tax"
                    data-testid="input-ocr-tax"
                    type="number"
                    value={form.tax ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        tax: e.target.value === "" ? undefined : toNumberOr(e.target.value, 0),
                      }))
                    }
                    min={0}
                    step="0.01"
                  />
                </div>

                <div>
                  <Label htmlFor="ocr-category" className="text-sm font-medium mb-1 block">
                    Category
                  </Label>
                  <Input
                    id="ocr-category"
                    data-testid="input-ocr-category"
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                    placeholder="Food, Rent..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="ocr-currency" className="text-sm font-medium">
                      Currency
                    </Label>
                    <ConfidenceBadge score={(result.confidence as any)?.currency} field="currency" />
                  </div>
                  <Input
                    id="ocr-currency"
                    data-testid="input-ocr-currency"
                    value={form.currency || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                    placeholder={currencyHint}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="ocr-description" className="text-sm font-medium mb-1 block">
                    Description
                  </Label>
                  <Input
                    id="ocr-description"
                    data-testid="input-ocr-description"
                    value={form.description || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional notes or details"
                  />
                </div>
              </div>

              {extractedItems.length ? (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="btn-toggle-ocr-items"
                    onClick={() => setItemsOpen((v) => !v)}
                  >
                    {itemsOpen ? "Hide" : "Show"} items ({extractedItems.length})
                  </Button>
                  {itemsOpen ? (
                    <div className="mt-2 overflow-x-auto rounded-md border border-border" data-testid="ocr-items-table">
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
                            <tr key={idx} className="border-t border-border" data-testid={`ocr-item-row-${idx}`}>
                              <td className="px-3 py-2">{String(item.description || "")}</td>
                              <td className="px-3 py-2">{item.total ?? ""}</td>
                              <td className="px-3 py-2">
                                <ConfidenceBadge score={item.confidence} field={`item-${idx}`} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" data-testid="btn-cancel-ocr" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  data-testid="btn-confirm-ocr"
                  onClick={handleConfirm}
                  disabled={
                    confirmMutation.isPending ||
                    !form.vendor.trim() ||
                    !form.date ||
                    !(Number(form.total) > 0)
                  }
                >
                  {confirmMutation.isPending ? "Confirming..." : "Confirm & Create"}
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

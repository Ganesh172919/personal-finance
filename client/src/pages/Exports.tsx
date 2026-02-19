import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { useToast } from "@/hooks/useToast";
import {
  ApiError,
  createExport,
  downloadExportFile,
  listExports,
  triggerBrowserDownload,
  type ExportJob,
  type ExportJobStatus,
} from "@/lib/apiClient";

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

const bytesToHuman = (bytes: unknown) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export default function Exports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDateTime } = useOrgFormatters();

  const [statusFilter, setStatusFilter] = useState<ExportJobStatus | "all">("all");

  const exportsQuery = useQuery({
    queryKey: ["v1/exports", statusFilter],
    queryFn: () => listExports({ status: statusFilter === "all" ? undefined : statusFilter, limit: 50 }),
    refetchInterval: (query) => {
      const data = (query.state.data as any)?.exports as ExportJob[] | undefined;
      if (!Array.isArray(data)) return false;
      const hasInFlight = data.some((job) => job.status === "queued" || job.status === "running");
      return hasInFlight ? 4000 : false;
    },
  });

  const exportsList = exportsQuery.data?.exports || [];

  const defaultPeriodKey = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, []);

  const [csvDateFrom, setCsvDateFrom] = useState("");
  const [csvDateTo, setCsvDateTo] = useState("");
  const [csvTxType, setCsvTxType] = useState<"" | "income" | "expense" | "investment">("");
  const [csvCategory, setCsvCategory] = useState("");

  const [pdfPeriodKey, setPdfPeriodKey] = useState(defaultPeriodKey);

  const createMutation = useMutation({
    mutationFn: createExport,
    onSuccess: async (resp) => {
      await queryClient.invalidateQueries({ queryKey: ["v1/exports"] });
      toast({
        title: "Export created",
        description: resp.queued ? "Queued for processing." : "Processed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Export failed",
        description: formatError(error, "Couldn't create export."),
        variant: "destructive",
      });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (exportId: string) => downloadExportFile(exportId),
    onSuccess: (resp) => {
      triggerBrowserDownload({ blob: resp.blob, filename: resp.filename });
      toast({ title: "Download started", description: resp.filename });
    },
    onError: (error) => {
      const fallback =
        error instanceof ApiError && error.code === "EXPORT_NOT_READY"
          ? "Export is not ready yet."
          : "Couldn't download export.";
      toast({ title: "Download failed", description: formatError(error, fallback), variant: "destructive" });
    },
  });

  const createTransactionsCsv = () => {
    const params: Record<string, unknown> = {};
    if (csvDateFrom.trim()) params.date_from = new Date(csvDateFrom).toISOString();
    if (csvDateTo.trim()) params.date_to = new Date(csvDateTo).toISOString();
    if (csvTxType) params.tx_type = csvTxType;
    if (csvCategory.trim()) params.category = csvCategory.trim();

    createMutation.mutate({ type: "transactions_csv", params });
  };

  const createMonthlySummaryPdf = () => {
    const key = pdfPeriodKey.trim();
    if (!/^\d{4}-\d{2}$/.test(key)) {
      toast({ title: "Invalid period", description: "Use YYYY-MM format.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ type: "monthly_summary_pdf", params: { period_key: key } });
  };

  return (
    <div className="p-6 space-y-4" data-testid="exports-page">
      <div className="space-y-1">
        <div className="text-xl font-semibold text-foreground">Exports</div>
        <div className="text-sm text-muted-foreground">
          Create CSV and PDF exports. Downloads are tenant-scoped and auditable.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Transactions CSV</CardTitle>
            <CardDescription>Export filtered transactions as CSV.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Date from</Label>
                <Input type="date" value={csvDateFrom} onChange={(e) => setCsvDateFrom(e.target.value)} />
              </div>
              <div>
                <Label>Date to</Label>
                <Input type="date" value={csvDateTo} onChange={(e) => setCsvDateTo(e.target.value)} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={csvTxType} onValueChange={(v) => setCsvTxType(v as any)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any</SelectItem>
                    <SelectItem value="income">income</SelectItem>
                    <SelectItem value="expense">expense</SelectItem>
                    <SelectItem value="investment">investment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Input value={csvCategory} onChange={(e) => setCsvCategory(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={createTransactionsCsv} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create CSV export"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly summary PDF</CardTitle>
            <CardDescription>Quick summary for a calendar month (UTC).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Month</Label>
              <Input
                type="month"
                value={pdfPeriodKey}
                onChange={(e) => setPdfPeriodKey(e.target.value)}
                placeholder="YYYY-MM"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={createMonthlySummaryPdf} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create PDF export"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent exports</CardTitle>
          <CardDescription>
            Status updates automatically while exports are running.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div className="w-56">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all</SelectItem>
                  <SelectItem value="queued">queued</SelectItem>
                  <SelectItem value="running">running</SelectItem>
                  <SelectItem value="succeeded">succeeded</SelectItem>
                  <SelectItem value="failed">failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => exportsQuery.refetch()} disabled={exportsQuery.isFetching}>
              {exportsQuery.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exportsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6}>Loading…</TableCell>
                  </TableRow>
                ) : exportsList.length ? (
                  exportsList.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.created_at ? formatDateTime(job.created_at) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{job.type}</TableCell>
                      <TableCell className="text-xs">{job.status}</TableCell>
                      <TableCell className="text-xs">{job.filename || "—"}</TableCell>
                      <TableCell className="text-xs">{bytesToHuman(job.bytes)}</TableCell>
                      <TableCell className="text-right">
                        {job.status === "succeeded" ? (
                          <Button
                            size="sm"
                            onClick={() => downloadMutation.mutate(job.id)}
                            disabled={downloadMutation.isPending}
                          >
                            {downloadMutation.isPending ? "Downloading…" : "Download"}
                          </Button>
                        ) : job.status === "failed" ? (
                          <span className="text-xs text-destructive" title={job.error || ""}>
                            Failed
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6}>No exports yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * @fileoverview Data exports page for CSV and PDF generation.
 *
 * Provides two export forms -- Transactions CSV (with date range, type,
 * category filters, and quick presets) and Monthly Summary PDF (by YYYY-MM
 * period key with quick period buttons). A status-filtered table lists
 * recent export jobs with auto-refresh while jobs are queued or running.
 *
 * Key data flows:
 * - createExport() enqueues a new export job on the server.
 * - listExports() with optional status filter loads the export history;
 *   refetchInterval polls every 4 seconds while in-flight jobs exist.
 * - downloadExportFile() fetches the blob and triggers a browser download
 *   via triggerBrowserDownload().
 *
 * Tenant-scoped: all exports are isolated to the active organization.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useToast } from "@/hooks/useToast";
import {
  FileSpreadsheet,
  FileText,
  Download,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Mail,
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  Send,
  Cloud,
  Webhook,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  ApiError,
  createExport,
  downloadExportFile,
  listExports,
  triggerBrowserDownload,
  listScheduledExports,
  createScheduledExport,
  updateScheduledExport,
  deleteScheduledExport,
  triggerScheduledExportNow,
  type ExportJob,
  type ExportJobStatus,
  type ScheduledExport,
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

const AVAILABLE_CSV_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount" },
  { key: "category", label: "Category" },
  { key: "type", label: "Type" },
  { key: "description", label: "Description" },
  { key: "id", label: "ID" },
  { key: "source_origin", label: "Source" },
  { key: "created_at", label: "Created At" },
];

export default function Exports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { formatDateTime } = useOrgFormatters();
  const configQuery = useAppConfig();

  const entitlements = configQuery.data?.entitlements;
  const plan = entitlements?.plan || "free";
  const exportAccess =
    entitlements?.limits?.export_access ?? (entitlements as any)?.features?.export ?? plan !== "free";

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
  const [csvTxType, setCsvTxType] = useState<"all" | "income" | "expense" | "investment">("all");
  const [csvCategory, setCsvCategory] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  const standardColumnKeys = ["date", "amount", "category", "type", "description"];
  const isColActive = (key: string) =>
    selectedColumns.length === 0 ? standardColumnKeys.includes(key) : selectedColumns.includes(key);

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

  // Scheduled recurring reports state & mutations
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleType, setScheduleType] = useState<"transactions_csv" | "monthly_summary_pdf">("monthly_summary_pdf");
  const [scheduleFrequency, setScheduleFrequency] = useState<"weekly" | "monthly">("monthly");
  const [scheduleDestination, setScheduleDestination] = useState<"email" | "webhook" | "cloud_storage">("email");
  const [scheduleEmail, setScheduleEmail] = useState("");
  const [scheduleWebhookUrl, setScheduleWebhookUrl] = useState("");
  const [scheduleAuthHeader, setScheduleAuthHeader] = useState("");
  const [scheduleCloudProvider, setScheduleCloudProvider] = useState<"s3" | "gcs">("s3");
  const [scheduleBucketName, setScheduleBucketName] = useState("");
  const [scheduleBucketRegion, setScheduleBucketRegion] = useState("us-east-1");
  const [scheduleBucketPrefix, setScheduleBucketPrefix] = useState("finwise-reports");
  const [scheduleCustomFilename, setScheduleCustomFilename] = useState("");

  const schedulesQuery = useQuery({
    queryKey: ["v1/exports/schedules"],
    queryFn: listScheduledExports,
    enabled: exportAccess,
  });

  const schedulesList: ScheduledExport[] = schedulesQuery.data?.schedules || [];

  const createScheduleMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      type: "transactions_csv" | "monthly_summary_pdf";
      frequency: "weekly" | "monthly";
      destination: "email" | "webhook" | "cloud_storage";
      delivery_email?: string;
      destination_config?: {
        webhook_url?: string;
        auth_header?: string;
        cloud_provider?: "s3" | "gcs";
        bucket_name?: string;
        bucket_region?: string;
        bucket_prefix?: string;
        custom_filename?: string;
      };
    }) => createScheduledExport(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["v1/exports/schedules"] });
      setIsScheduleDialogOpen(false);
      setScheduleName("");
      setScheduleEmail("");
      setScheduleWebhookUrl("");
      setScheduleAuthHeader("");
      setScheduleBucketName("");
      const targetDesc =
        data.schedule.destination === "webhook"
          ? `webhook push to ${data.schedule.destination_config?.webhook_url}`
          : data.schedule.destination === "cloud_storage"
          ? `cloud sync to ${data.schedule.destination_config?.cloud_provider || "s3"}://${data.schedule.destination_config?.bucket_name}`
          : `email delivery to ${data.schedule.delivery_email}`;

      toast({
        title: "Report Schedule Created",
        description: `Scheduled "${data.schedule.name}" for ${data.schedule.frequency} ${targetDesc}.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Failed to create schedule",
        description: formatError(err, "Could not create schedule."),
        variant: "destructive",
      });
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) =>
      updateScheduledExport(id, { status }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["v1/exports/schedules"] });
      toast({
        title: data.schedule.status === "paused" ? "Schedule Paused" : "Schedule Resumed",
        description: `"${data.schedule.name}" is now ${data.schedule.status}.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Update failed",
        description: formatError(err, "Could not update schedule."),
        variant: "destructive",
      });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: string) => deleteScheduledExport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v1/exports/schedules"] });
      toast({
        title: "Schedule Deleted",
        description: "The recurring report schedule has been removed.",
      });
    },
    onError: (err) => {
      toast({
        title: "Delete failed",
        description: formatError(err, "Could not delete schedule."),
        variant: "destructive",
      });
    },
  });

  const triggerScheduleMutation = useMutation({
    mutationFn: (id: string) => triggerScheduledExportNow(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["v1/exports/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["v1/exports"] });
      const targetSummary =
        data.result.destination === "webhook"
          ? `dispatched via webhook (${data.result.webhook_url})`
          : data.result.destination === "cloud_storage"
          ? `synced to cloud storage (${data.result.cloud_uri})`
          : `sent to ${data.result.delivery_email}`;

      toast({
        title: "Test Report Dispatched!",
        description: `Report was generated and ${targetSummary}.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Dispatch failed",
        description: formatError(err, "Could not execute report delivery."),
        variant: "destructive",
      });
    },
  });

  const toIsoSafe = (val: string) => {
    if (!val.trim()) return undefined;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  };

  const createTransactionsCsv = () => {
    const params: Record<string, unknown> = {};
    const fromIso = toIsoSafe(csvDateFrom);
    const toIso = toIsoSafe(csvDateTo);
    if (fromIso) params.date_from = fromIso;
    if (toIso) params.date_to = toIso;
    if (csvTxType && csvTxType !== "all") params.tx_type = csvTxType;
    if (csvCategory.trim()) params.category = csvCategory.trim();
    if (selectedColumns.length > 0) params.columns = selectedColumns;

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

  const formatDateYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const applyDatePreset = (preset: "this-month" | "last-month" | "last-90" | "ytd" | "all") => {
    const now = new Date();
    if (preset === "all") {
      setCsvDateFrom("");
      setCsvDateTo("");
      return;
    }
    if (preset === "this-month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setCsvDateFrom(formatDateYMD(start));
      setCsvDateTo(formatDateYMD(now));
      return;
    }
    if (preset === "last-month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setCsvDateFrom(formatDateYMD(start));
      setCsvDateTo(formatDateYMD(end));
      return;
    }
    if (preset === "last-90") {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      setCsvDateFrom(formatDateYMD(start));
      setCsvDateTo(formatDateYMD(now));
      return;
    }
    if (preset === "ytd") {
      const start = new Date(now.getFullYear(), 0, 1);
      setCsvDateFrom(formatDateYMD(start));
      setCsvDateTo(formatDateYMD(now));
      return;
    }
  };

  const applyPdfPeriodPreset = (preset: "current" | "previous") => {
    const now = new Date();
    if (preset === "current") {
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, "0");
      setPdfPeriodKey(`${y}-${m}`);
    } else {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = prev.getUTCFullYear();
      const m = String(prev.getUTCMonth() + 1).padStart(2, "0");
      setPdfPeriodKey(`${y}-${m}`);
    }
  };

  const renderStatusBadge = (status: ExportJobStatus) => {
    switch (status) {
      case "succeeded":
        return (
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] px-2 py-0"
          >
            succeeded
          </Badge>
        );
      case "running":
        return (
          <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-2 py-0 animate-pulse">
            running
          </Badge>
        );
      case "queued":
        return (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-2 py-0"
          >
            queued
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-[10px] px-2 py-0">
            failed
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-[10px] px-2 py-0">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="exports-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Data Exports</h1>
            <Badge variant="outline" className="text-xs">
              Tenant Scoped
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            Generate CSV ledgers and PDF monthly summaries with cryptographic integrity and audit tracking.
          </div>
        </div>
      </div>

      {/* Plan Entitlement Notification */}
      {!exportAccess && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Export Access Requires Pro or Team Plan</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs bg-background text-foreground"
              onClick={() => setLocation("/billing")}
              data-testid="button-upgrade-exports"
            >
              Upgrade Plan
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </AlertTitle>
          <AlertDescription className="text-xs mt-1">
            Free accounts can view transactions and dashboards. Upgrading unlocks CSV ledger downloads and verified monthly PDF summaries.
          </AlertDescription>
        </Alert>
      )}

      {/* Export Action Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Transactions CSV */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <FileSpreadsheet className="w-5 h-5 mr-2 text-primary" />
                Transactions CSV
              </CardTitle>
              <CardDescription>
                Export filtered transaction records into a structured CSV spreadsheet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Presets */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">Quick Date Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyDatePreset("this-month")}
                  >
                    This Month
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyDatePreset("last-month")}
                  >
                    Last Month
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyDatePreset("ytd")}
                  >
                    YTD
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyDatePreset("all")}
                  >
                    All Time
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="csv-date-from">Date from</Label>
                  <Input
                    id="csv-date-from"
                    type="date"
                    value={csvDateFrom}
                    onChange={(e) => setCsvDateFrom(e.target.value)}
                    data-testid="input-csv-from"
                  />
                </div>
                <div>
                  <Label htmlFor="csv-date-to">Date to</Label>
                  <Input
                    id="csv-date-to"
                    type="date"
                    value={csvDateTo}
                    onChange={(e) => setCsvDateTo(e.target.value)}
                    data-testid="input-csv-to"
                  />
                </div>
                <div>
                  <Label htmlFor="csv-tx-type">Transaction Type</Label>
                  <Select value={csvTxType} onValueChange={(v) => setCsvTxType(v as any)}>
                    <SelectTrigger id="csv-tx-type" className="mt-1" data-testid="select-csv-type">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="investment">Investment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="csv-category">Category</Label>
                  <Input
                    id="csv-category"
                    value={csvCategory}
                    onChange={(e) => setCsvCategory(e.target.value)}
                    placeholder="e.g. Groceries"
                    data-testid="input-csv-category"
                  />
                </div>
              </div>

              {/* Custom Column Selector */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">Columns to Include:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline font-medium"
                      onClick={() => setSelectedColumns(AVAILABLE_CSV_COLUMNS.map((c) => c.key))}
                      data-testid="btn-select-all-cols"
                    >
                      All
                    </button>
                    <span className="text-[11px] text-muted-foreground/60">•</span>
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline font-medium"
                      onClick={() => setSelectedColumns(["date", "amount", "category", "type", "description"])}
                      data-testid="btn-select-standard-cols"
                    >
                      Standard
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5" data-testid="csv-column-chips">
                  {AVAILABLE_CSV_COLUMNS.map((col) => {
                    const active = isColActive(col.key);
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => {
                          const currentActive = selectedColumns.length > 0 ? selectedColumns : standardColumnKeys;
                          if (active) {
                            if (currentActive.length > 1) {
                              setSelectedColumns(currentActive.filter((k) => k !== col.key));
                            }
                          } else {
                            setSelectedColumns([...currentActive, col.key]);
                          }
                        }}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                          active
                            ? "bg-primary/10 border-primary text-primary font-medium shadow-sm"
                            : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"
                        }`}
                        data-testid={`col-chip-${col.key}`}
                      >
                        {col.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </div>

          <div className="p-6 pt-0 flex justify-end">
            <Button
              onClick={createTransactionsCsv}
              disabled={createMutation.isPending}
              data-testid="button-create-csv"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1.5" />
              {createMutation.isPending ? "Creating…" : "Create CSV export"}
            </Button>
          </div>
        </Card>

        {/* Monthly Summary PDF */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" />
                Monthly Summary PDF
              </CardTitle>
              <CardDescription>
                Compile income, expenses, category breakdowns, and surplus into a verified monthly PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">Quick Period Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyPdfPeriodPreset("current")}
                  >
                    Current Month
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => applyPdfPeriodPreset("previous")}
                  >
                    Previous Month
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="pdf-period-key">Calendar Month (YYYY-MM)</Label>
                <Input
                  id="pdf-period-key"
                  type="month"
                  value={pdfPeriodKey}
                  onChange={(e) => setPdfPeriodKey(e.target.value)}
                  placeholder="YYYY-MM"
                  data-testid="input-pdf-month"
                />
              </div>
            </CardContent>
          </div>

          <div className="p-6 pt-0 flex justify-end">
            <Button
              onClick={createMonthlySummaryPdf}
              disabled={createMutation.isPending}
              data-testid="button-create-pdf"
            >
              <FileText className="w-4 h-4 mr-1.5" />
              {createMutation.isPending ? "Creating…" : "Create PDF export"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Scheduled Recurring Reports & Automated Email Delivery */}
      <Card data-testid="card-scheduled-reports" className="border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base flex items-center">
                  <Mail className="w-4 h-4 mr-2 text-primary" />
                  Scheduled Recurring Reports
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                  Automated Email Delivery
                </Badge>
              </div>
              <CardDescription>
                Automate weekly or monthly export generation with instant email dispatch directly to your finance team.
              </CardDescription>
            </div>

            <Button
              size="sm"
              onClick={() => setIsScheduleDialogOpen(true)}
              disabled={!exportAccess}
              data-testid="btn-open-schedule-dialog"
              className="h-8 text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Schedule Report
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-xl border border-border overflow-x-auto">
            <Table data-testid="table-scheduled-reports">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">Report Name</TableHead>
                  <TableHead className="text-xs font-semibold">Type</TableHead>
                  <TableHead className="text-xs font-semibold">Cadence</TableHead>
                  <TableHead className="text-xs font-semibold">Destination</TableHead>
                  <TableHead className="text-xs font-semibold">Next Run</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedulesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">
                      Loading scheduled reports…
                    </TableCell>
                  </TableRow>
                ) : schedulesList.length ? (
                  schedulesList.map((schedule) => (
                    <TableRow key={schedule.id} data-testid={`schedule-row-${schedule.id}`}>
                      <TableCell className="text-xs font-medium" data-testid={`schedule-name-${schedule.id}`}>
                        {schedule.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {schedule.type === "transactions_csv" ? "Transactions CSV" : "Monthly Summary PDF"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          <Clock className="w-3 h-3 mr-1" />
                          {schedule.frequency}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" data-testid={`schedule-destination-${schedule.id}`}>
                        {schedule.destination === "webhook" ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-primary" data-testid={`schedule-webhook-${schedule.id}`}>
                            <Webhook className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[170px]" title={schedule.destination_config?.webhook_url}>
                              {schedule.destination_config?.webhook_url || "Webhook"}
                            </span>
                          </div>
                        ) : schedule.destination === "cloud_storage" ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-600 dark:text-amber-400" data-testid={`schedule-cloud-${schedule.id}`}>
                            <Cloud className="w-3.5 h-3.5 shrink-0" />
                            <span
                              className="truncate max-w-[170px]"
                              title={`${schedule.destination_config?.cloud_provider || "s3"}://${schedule.destination_config?.bucket_name}${
                                schedule.destination_config?.bucket_prefix ? `/${schedule.destination_config.bucket_prefix}` : ""
                              }`}
                            >
                              {`${schedule.destination_config?.cloud_provider || "s3"}://${schedule.destination_config?.bucket_name}${
                                schedule.destination_config?.bucket_prefix ? `/${schedule.destination_config.bucket_prefix}` : ""
                              }`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate max-w-[170px]" data-testid={`schedule-email-${schedule.id}`}>
                              {schedule.delivery_email}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`schedule-next-run-${schedule.id}`}>
                        {schedule.next_run_at ? formatDateTime(schedule.next_run_at) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={schedule.status === "active" ? "default" : "secondary"}
                          className={`text-[10px] capitalize ${
                            schedule.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""
                          }`}
                          data-testid={`badge-schedule-status-${schedule.id}`}
                        >
                          {schedule.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2"
                            onClick={() => triggerScheduleMutation.mutate(schedule.id)}
                            disabled={triggerScheduleMutation.isPending}
                            title="Trigger execution and email delivery right now"
                            data-testid={`btn-send-now-schedule-${schedule.id}`}
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Send Now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() =>
                              updateScheduleMutation.mutate({
                                id: schedule.id,
                                status: schedule.status === "active" ? "paused" : "active",
                              })
                            }
                            disabled={updateScheduleMutation.isPending}
                            title={schedule.status === "active" ? "Pause schedule" : "Resume schedule"}
                            data-testid={`btn-toggle-schedule-${schedule.id}`}
                          >
                            {schedule.status === "active" ? (
                              <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                              <Play className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                            disabled={deleteScheduleMutation.isPending}
                            title="Delete schedule"
                            data-testid={`btn-delete-schedule-${schedule.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Mail className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <div className="text-sm font-medium text-foreground">No recurring schedules configured</div>
                      <div className="text-xs mt-0.5 max-w-sm mx-auto">
                        Automate your reporting workflow with weekly or monthly summaries delivered straight to your email.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Schedule Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-create-schedule">
          <DialogHeader>
            <DialogTitle className="flex items-center text-base">
              <Mail className="w-4 h-4 mr-2 text-primary" />
              Schedule Recurring Export Report
            </DialogTitle>
            <DialogDescription>
              Set up automated reports delivered to your email, external webhook endpoint, or cloud storage bucket.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!scheduleName.trim()) {
                toast({
                  title: "Missing fields",
                  description: "Please provide a report name.",
                  variant: "destructive",
                });
                return;
              }
              if (scheduleDestination === "email" && !scheduleEmail.trim()) {
                toast({
                  title: "Missing fields",
                  description: "Please provide a recipient email address.",
                  variant: "destructive",
                });
                return;
              }
              if (scheduleDestination === "webhook" && !scheduleWebhookUrl.trim()) {
                toast({
                  title: "Missing fields",
                  description: "Please provide a valid webhook destination URL.",
                  variant: "destructive",
                });
                return;
              }
              if (scheduleDestination === "cloud_storage" && !scheduleBucketName.trim()) {
                toast({
                  title: "Missing fields",
                  description: "Please provide a target bucket name.",
                  variant: "destructive",
                });
                return;
              }

              const destination_config =
                scheduleDestination === "webhook"
                  ? {
                      webhook_url: scheduleWebhookUrl.trim(),
                      auth_header: scheduleAuthHeader.trim() || undefined,
                    }
                  : scheduleDestination === "cloud_storage"
                  ? {
                      cloud_provider: scheduleCloudProvider,
                      bucket_name: scheduleBucketName.trim(),
                      bucket_region: scheduleBucketRegion.trim() || undefined,
                      bucket_prefix: scheduleBucketPrefix.trim() || undefined,
                      custom_filename: scheduleCustomFilename.trim() || undefined,
                    }
                  : undefined;

              const payload: any = {
                name: scheduleName.trim(),
                type: scheduleType,
                frequency: scheduleFrequency,
              };

              if (scheduleDestination === "email") {
                payload.delivery_email = scheduleEmail.trim();
              } else {
                payload.destination = scheduleDestination;
                if (destination_config) {
                  payload.destination_config = destination_config;
                }
              }

              createScheduleMutation.mutate(payload);
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="schedule-name">Report Name</Label>
              <Input
                id="schedule-name"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="e.g. Weekly Cash Flow Digest"
                data-testid="input-schedule-name"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="schedule-type">Report Format</Label>
                <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as any)}>
                  <SelectTrigger id="schedule-type" data-testid="select-schedule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly_summary_pdf">Monthly Summary PDF</SelectItem>
                    <SelectItem value="transactions_csv">Transactions CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="schedule-frequency">Delivery Cadence</Label>
                <Select value={scheduleFrequency} onValueChange={(v) => setScheduleFrequency(v as any)}>
                  <SelectTrigger id="schedule-frequency" data-testid="select-schedule-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="schedule-destination">Delivery Channel / Destination</Label>
              <Select value={scheduleDestination} onValueChange={(v) => setScheduleDestination(v as any)}>
                <SelectTrigger id="schedule-destination" data-testid="select-schedule-destination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email Inbox</SelectItem>
                  <SelectItem value="webhook">Automated Webhook Push</SelectItem>
                  <SelectItem value="cloud_storage">Cloud Storage Bucket (S3 / GCS)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scheduleDestination === "email" && (
              <div className="space-y-1.5">
                <Label htmlFor="schedule-email">Recipient Email Address</Label>
                <Input
                  id="schedule-email"
                  type="email"
                  value={scheduleEmail}
                  onChange={(e) => setScheduleEmail(e.target.value)}
                  placeholder="accounting@company.com"
                  data-testid="input-schedule-email"
                  required
                />
              </div>
            )}

            {scheduleDestination === "webhook" && (
              <div className="space-y-3 p-3 rounded-lg border border-border/70 bg-muted/30">
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-webhook-url">Target Webhook URL</Label>
                  <Input
                    id="schedule-webhook-url"
                    type="url"
                    value={scheduleWebhookUrl}
                    onChange={(e) => setScheduleWebhookUrl(e.target.value)}
                    placeholder="https://api.accounting-system.com/webhooks/finwise"
                    data-testid="input-schedule-webhook-url"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-webhook-auth">Authorization Header (Optional)</Label>
                  <Input
                    id="schedule-webhook-auth"
                    value={scheduleAuthHeader}
                    onChange={(e) => setScheduleAuthHeader(e.target.value)}
                    placeholder="Bearer acc_sec_..."
                    data-testid="input-schedule-webhook-auth"
                  />
                </div>
              </div>
            )}

            {scheduleDestination === "cloud_storage" && (
              <div className="space-y-3 p-3 rounded-lg border border-border/70 bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="schedule-cloud-provider">Cloud Provider</Label>
                    <Select value={scheduleCloudProvider} onValueChange={(v) => setScheduleCloudProvider(v as any)}>
                      <SelectTrigger id="schedule-cloud-provider" data-testid="select-schedule-cloud-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="s3">Amazon S3</SelectItem>
                        <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="schedule-bucket-name">Bucket Name</Label>
                    <Input
                      id="schedule-bucket-name"
                      value={scheduleBucketName}
                      onChange={(e) => setScheduleBucketName(e.target.value)}
                      placeholder="corporate-audit-vault"
                      data-testid="input-schedule-bucket-name"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="schedule-bucket-region">Region</Label>
                    <Input
                      id="schedule-bucket-region"
                      value={scheduleBucketRegion}
                      onChange={(e) => setScheduleBucketRegion(e.target.value)}
                      placeholder="us-east-1"
                      data-testid="input-schedule-bucket-region"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="schedule-bucket-prefix">Folder / Prefix</Label>
                    <Input
                      id="schedule-bucket-prefix"
                      value={scheduleBucketPrefix}
                      onChange={(e) => setScheduleBucketPrefix(e.target.value)}
                      placeholder="financial-exports"
                      data-testid="input-schedule-bucket-prefix"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-custom-filename">Custom Filename (Optional)</Label>
                  <Input
                    id="schedule-custom-filename"
                    value={scheduleCustomFilename}
                    onChange={(e) => setScheduleCustomFilename(e.target.value)}
                    placeholder="e.g. monthly-audit.pdf"
                    data-testid="input-schedule-custom-filename"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsScheduleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createScheduleMutation.isPending}
                data-testid="btn-submit-schedule"
              >
                {createScheduleMutation.isPending ? "Creating…" : "Save Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recent Exports Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-primary" />
                Recent Exports
              </CardTitle>
              <CardDescription>
                Status auto-refreshes every 4s while exports are queued or executing.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-36">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="text-xs h-8" data-testid="select-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="succeeded">Succeeded</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => exportsQuery.refetch()}
                disabled={exportsQuery.isFetching}
                className="h-8 text-xs"
                data-testid="button-refresh-exports"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${exportsQuery.isFetching ? "animate-spin" : ""}`} />
                {exportsQuery.isFetching ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-xl border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">Created</TableHead>
                  <TableHead className="text-xs font-semibold">Type</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Filename</TableHead>
                  <TableHead className="text-xs font-semibold">Size</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exportsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                      Loading recent exports…
                    </TableCell>
                  </TableRow>
                ) : exportsList.length ? (
                  exportsList.map((job) => (
                    <TableRow key={job.id} data-testid={`export-job-${job.id}`}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {job.created_at ? formatDateTime(job.created_at) : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {job.type === "transactions_csv" ? "Transactions CSV" : "Monthly Summary PDF"}
                      </TableCell>
                      <TableCell>{renderStatusBadge(job.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {job.filename || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {bytesToHuman(job.bytes)}
                      </TableCell>
                      <TableCell className="text-right">
                        {job.status === "succeeded" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2.5"
                            onClick={() => downloadMutation.mutate(job.id)}
                            disabled={downloadMutation.isPending}
                            data-testid={`button-download-${job.id}`}
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            {downloadMutation.isPending ? "Downloading…" : "Download"}
                          </Button>
                        ) : job.status === "failed" ? (
                          <span className="text-xs text-destructive font-medium" title={job.error || ""}>
                            {job.error ? `Failed: ${job.error}` : "Failed"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">In progress…</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <div className="text-sm font-medium text-foreground">No exports yet</div>
                      <div className="text-xs mt-0.5">
                        Create a CSV or PDF export above to download your financial data.
                      </div>
                    </TableCell>
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

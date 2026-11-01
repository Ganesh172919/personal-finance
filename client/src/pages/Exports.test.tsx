import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Exports from "./Exports";
import type { ExportJob } from "@/lib/apiClient";

const apiExports = vi.hoisted(() => ({
  createExport: vi.fn(),
  listExports: vi.fn(),
  downloadExportFile: vi.fn(),
  triggerBrowserDownload: vi.fn(),
  listScheduledExports: vi.fn(),
  createScheduledExport: vi.fn(),
  updateScheduledExport: vi.fn(),
  deleteScheduledExport: vi.fn(),
  triggerScheduledExportNow: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/exports", navigateMock],
}));

vi.mock("@/lib/apiClient", () => ({
  ...apiExports,
  ApiError: class extends Error {
    requestId = "req-export-123";
    code?: string;
  },
}));

let mockEntitlements = {
  plan: "pro",
  status: "active",
  limits: {
    export_access: true,
  },
};

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({
    data: {
      org: {
        role: "admin",
        currency: "USD",
        locale: "en-US",
      },
      entitlements: mockEntitlements,
    },
    isLoading: false,
  }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const mockJobs: ExportJob[] = [
  {
    id: "job-1",
    org_id: "org-1",
    user_id: "user-1",
    type: "transactions_csv",
    status: "succeeded",
    params: { tx_type: "expense" },
    filename: "transactions-2026-10.csv",
    bytes: 4096,
    created_at: "2026-10-28T12:00:00.000Z",
    completed_at: "2026-10-28T12:00:02.000Z",
  },
  {
    id: "job-2",
    org_id: "org-1",
    user_id: "user-1",
    type: "monthly_summary_pdf",
    status: "running",
    params: { period_key: "2026-10" },
    filename: "summary-2026-10.pdf",
    created_at: "2026-10-28T12:05:00.000Z",
  },
  {
    id: "job-3",
    org_id: "org-1",
    user_id: "user-1",
    type: "transactions_csv",
    status: "failed",
    error: "No transactions found in date range",
    params: {},
    created_at: "2026-10-28T11:00:00.000Z",
  },
];

const mockSchedules = [
  {
    id: "sched-1",
    name: "Weekly Cash Flow Digest",
    type: "transactions_csv",
    frequency: "weekly",
    delivery_email: "finance@company.com",
    status: "active",
    params: {},
    last_run_at: "2026-10-25T08:00:00.000Z",
    next_run_at: "2026-11-01T08:00:00.000Z",
    last_delivery_status: "success",
    last_error: null,
    created_at: "2026-10-18T08:00:00.000Z",
  },
  {
    id: "sched-2",
    name: "Monthly Summary PDF Report",
    type: "monthly_summary_pdf",
    frequency: "monthly",
    delivery_email: "execs@company.com",
    status: "paused",
    params: {},
    last_run_at: null,
    next_run_at: null,
    last_delivery_status: "none",
    last_error: null,
    created_at: "2026-10-20T08:00:00.000Z",
  },
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Exports page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntitlements = {
      plan: "pro",
      status: "active",
      limits: {
        export_access: true,
      },
    };
    apiExports.listExports.mockResolvedValue({ exports: mockJobs });
    apiExports.listScheduledExports.mockResolvedValue({ schedules: mockSchedules });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders page header, export cards, and list of export jobs", async () => {
    renderWithClient(<Exports />);

    expect(screen.getByTestId("exports-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data Exports" })).toBeInTheDocument();
    expect(screen.getByText("Transactions CSV")).toBeInTheDocument();
    expect(screen.getByText("Monthly Summary PDF")).toBeInTheDocument();
    expect(screen.getByText("Recent Exports")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("export-job-job-1")).toBeInTheDocument();
      expect(screen.getByTestId("export-job-job-2")).toBeInTheDocument();
      expect(screen.getByTestId("export-job-job-3")).toBeInTheDocument();
    });

    expect(screen.getByText("transactions-2026-10.csv")).toBeInTheDocument();
    expect(screen.getByText("4.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Failed: No transactions found in date range")).toBeInTheDocument();
  });

  it("displays entitlement upgrade banner when export access is disabled on free tier", () => {
    mockEntitlements = {
      plan: "free",
      status: "active",
      limits: {
        export_access: false,
      },
    };

    renderWithClient(<Exports />);

    expect(screen.getByText("Export Access Requires Pro or Team Plan")).toBeInTheDocument();
    const upgradeBtn = screen.getByTestId("button-upgrade-exports");
    expect(upgradeBtn).toBeInTheDocument();

    fireEvent.click(upgradeBtn);
    expect(navigateMock).toHaveBeenCalledWith("/billing");
  });

  it("applies CSV date presets when clicking preset buttons", () => {
    renderWithClient(<Exports />);

    const fromInput = screen.getByTestId("input-csv-from") as HTMLInputElement;
    const toInput = screen.getByTestId("input-csv-to") as HTMLInputElement;

    // Click This Month
    fireEvent.click(screen.getByRole("button", { name: "This Month" }));
    expect(fromInput.value).toMatch(/^\d{4}-\d{2}-01$/);
    expect(toInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Click All Time (clears)
    fireEvent.click(screen.getByRole("button", { name: "All Time" }));
    expect(fromInput.value).toBe("");
    expect(toInput.value).toBe("");
  });

  it("submits transactions CSV export mutation with filters", async () => {
    apiExports.createExport.mockResolvedValueOnce({
      id: "job-new-csv",
      queued: true,
      status: "queued",
    });

    renderWithClient(<Exports />);

    // Enter a category
    const categoryInput = screen.getByTestId("input-csv-category");
    fireEvent.change(categoryInput, { target: { value: "Groceries" } });

    const createBtn = screen.getByTestId("button-create-csv");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(apiExports.createExport.mock.calls[0][0]).toEqual({
        type: "transactions_csv",
        params: {
          category: "Groceries",
        },
      });
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Export created",
        })
      );
    });
  });

  it("validates and submits monthly summary PDF export", async () => {
    apiExports.createExport.mockResolvedValueOnce({
      id: "job-new-pdf",
      queued: true,
      status: "queued",
    });

    renderWithClient(<Exports />);

    // Test invalid format validation
    const monthInput = screen.getByTestId("input-pdf-month");
    fireEvent.change(monthInput, { target: { value: "invalid-month" } });

    const createPdfBtn = screen.getByTestId("button-create-pdf");
    fireEvent.click(createPdfBtn);

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Invalid period",
        variant: "destructive",
      })
    );
    expect(apiExports.createExport).not.toHaveBeenCalled();

    // Now set valid month and submit
    fireEvent.click(screen.getByRole("button", { name: "Current Month" }));
    fireEvent.click(createPdfBtn);

    await waitFor(() => {
      expect(apiExports.createExport.mock.calls[0][0]).toMatchObject({
        type: "monthly_summary_pdf",
      });
    });
  });

  it("downloads succeeded export file via browser download trigger", async () => {
    const fakeBlob = new Blob(["fake csv data"], { type: "text/csv" });
    apiExports.downloadExportFile.mockResolvedValueOnce({
      blob: fakeBlob,
      filename: "transactions-2026-10.csv",
    });

    renderWithClient(<Exports />);

    await waitFor(() => {
      expect(screen.getByTestId("button-download-job-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("button-download-job-1"));

    await waitFor(() => {
      expect(apiExports.downloadExportFile).toHaveBeenCalledWith("job-1");
      expect(apiExports.triggerBrowserDownload).toHaveBeenCalledWith({
        blob: fakeBlob,
        filename: "transactions-2026-10.csv",
      });
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Download started",
        })
      );
    });
  });

  it("renders empty state when no export jobs exist", async () => {
    apiExports.listExports.mockResolvedValueOnce({ exports: [] });

    renderWithClient(<Exports />);

    await waitFor(() => {
      expect(screen.getByText("No exports yet")).toBeInTheDocument();
      expect(
        screen.getByText("Create a CSV or PDF export above to download your financial data.")
      ).toBeInTheDocument();
    });
  });

  it("allows selecting custom columns and submits them in CSV export request", async () => {
    apiExports.createExport.mockResolvedValueOnce({
      id: "job-new-custom",
      queued: true,
      status: "queued",
    });

    renderWithClient(<Exports />);

    // Toggle column chips
    expect(screen.getByTestId("col-chip-date")).toBeInTheDocument();
    expect(screen.getByTestId("col-chip-id")).toBeInTheDocument();

    // Click All columns
    fireEvent.click(screen.getByTestId("btn-select-all-cols"));

    const createBtn = screen.getByTestId("button-create-csv");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(apiExports.createExport.mock.calls[0][0]).toMatchObject({
        type: "transactions_csv",
        params: expect.objectContaining({
          columns: expect.arrayContaining([
            "date",
            "amount",
            "category",
            "type",
            "description",
            "id",
            "source_origin",
            "created_at",
          ]),
        }),
      });
    });
  });

  it("renders scheduled recurring reports card with active and paused schedules", async () => {
    renderWithClient(<Exports />);

    expect(screen.getByTestId("card-scheduled-reports")).toBeInTheDocument();
    expect(screen.getByText("Scheduled Recurring Reports")).toBeInTheDocument();
    expect(screen.getByText("Automated Email Delivery")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("schedule-row-sched-1")).toBeInTheDocument();
      expect(screen.getByTestId("schedule-row-sched-2")).toBeInTheDocument();
    });

    expect(screen.getByTestId("schedule-name-sched-1")).toHaveTextContent("Weekly Cash Flow Digest");
    expect(screen.getByTestId("schedule-email-sched-1")).toHaveTextContent("finance@company.com");
    expect(screen.getByTestId("badge-schedule-status-sched-1")).toHaveTextContent("active");
    expect(screen.getByTestId("badge-schedule-status-sched-2")).toHaveTextContent("paused");
  });

  it("creates a new scheduled recurring export report via dialog", async () => {
    apiExports.createScheduledExport.mockResolvedValueOnce({
      schedule: {
        id: "sched-3",
        name: "Tax Preparation Digest",
        type: "transactions_csv",
        frequency: "monthly",
        delivery_email: "cpa@accounting.com",
        status: "active",
        next_run_at: "2026-12-01T00:00:00.000Z",
      },
    });

    renderWithClient(<Exports />);

    const openBtn = screen.getByTestId("btn-open-schedule-dialog");
    fireEvent.click(openBtn);

    expect(screen.getByTestId("dialog-create-schedule")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("input-schedule-name"), {
      target: { value: "Tax Preparation Digest" },
    });
    fireEvent.change(screen.getByTestId("input-schedule-email"), {
      target: { value: "cpa@accounting.com" },
    });

    fireEvent.click(screen.getByTestId("btn-submit-schedule"));

    await waitFor(() => {
      expect(apiExports.createScheduledExport).toHaveBeenCalledWith({
        name: "Tax Preparation Digest",
        type: "monthly_summary_pdf",
        frequency: "monthly",
        delivery_email: "cpa@accounting.com",
      });
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Report Schedule Created",
        })
      );
    });
  });

  it("toggles schedule status between active and paused", async () => {
    apiExports.updateScheduledExport.mockResolvedValueOnce({
      schedule: {
        ...mockSchedules[0],
        status: "paused",
      },
    });

    renderWithClient(<Exports />);

    await waitFor(() => {
      expect(screen.getByTestId("btn-toggle-schedule-sched-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-toggle-schedule-sched-1"));

    await waitFor(() => {
      expect(apiExports.updateScheduledExport).toHaveBeenCalledWith("sched-1", {
        status: "paused",
      });
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Schedule Paused",
        })
      );
    });
  });

  it("triggers 1-click test delivery now and shows toast notification", async () => {
    apiExports.triggerScheduledExportNow.mockResolvedValueOnce({
      result: {
        success: true,
        delivery_email: "finance@company.com",
        email_mode: "smtp",
        job_id: "job-exec-1",
      },
      schedule: mockSchedules[0],
    });

    renderWithClient(<Exports />);

    await waitFor(() => {
      expect(screen.getByTestId("btn-send-now-schedule-sched-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-send-now-schedule-sched-1"));

    await waitFor(() => {
      expect(apiExports.triggerScheduledExportNow).toHaveBeenCalledWith("sched-1");
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Test Report Dispatched!",
          description: expect.stringContaining("finance@company.com"),
        })
      );
    });
  });

  it("deletes a recurring schedule", async () => {
    apiExports.deleteScheduledExport.mockResolvedValueOnce({
      success: true,
      deleted_id: "sched-1",
    });

    renderWithClient(<Exports />);

    await waitFor(() => {
      expect(screen.getByTestId("btn-delete-schedule-sched-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-delete-schedule-sched-1"));

    await waitFor(() => {
      expect(apiExports.deleteScheduledExport).toHaveBeenCalledWith("sched-1");
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Schedule Deleted",
        })
      );
    });
  });

  it("renders multi-channel destinations for webhooks and cloud storage and displays destination badges", async () => {
    const multiChannelSchedules = [
      {
        id: "sched-hook",
        name: "Security Auditing Webhook",
        type: "monthly_summary_pdf",
        frequency: "monthly",
        destination: "webhook",
        destination_config: {
          webhook_url: "https://audit.secops.io/inbound/finwise",
        },
        status: "active",
        next_run_at: "2026-11-15T00:00:00.000Z",
        last_delivery_status: "success",
      },
      {
        id: "sched-cloud",
        name: "Data Lake Compliance S3 Sync",
        type: "transactions_csv",
        frequency: "weekly",
        destination: "cloud_storage",
        destination_config: {
          cloud_provider: "s3",
          bucket_name: "finwise-lake-vault",
          bucket_prefix: "ledger/weekly",
        },
        status: "active",
        next_run_at: "2026-11-08T00:00:00.000Z",
        last_delivery_status: "success",
      },
    ];

    apiExports.listScheduledExports.mockResolvedValueOnce({
      schedules: multiChannelSchedules,
    });

    renderWithClient(<Exports />);

    await waitFor(() => {
      expect(screen.getByTestId("schedule-row-sched-hook")).toBeInTheDocument();
      expect(screen.getByTestId("schedule-row-sched-cloud")).toBeInTheDocument();
    });

    expect(screen.getByTestId("schedule-webhook-sched-hook")).toHaveTextContent("https://audit.secops.io/inbound/finwise");
    expect(screen.getByTestId("schedule-cloud-sched-cloud")).toHaveTextContent("s3://finwise-lake-vault/ledger/weekly");
  });

  it("triggers test delivery for webhook and cloud storage targets with specific toast details", async () => {
    apiExports.triggerScheduledExportNow.mockResolvedValueOnce({
      result: {
        success: true,
        destination: "webhook",
        webhook_url: "https://audit.secops.io/inbound/finwise",
        http_code: 200,
        checksum_sha256: "abc123sha",
        job_id: "job-hook-1",
      },
      schedule: mockSchedules[0],
    });

    renderWithClient(<Exports />);

    await waitFor(() => {
      expect(screen.getByTestId("btn-send-now-schedule-sched-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-send-now-schedule-sched-1"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Test Report Dispatched!",
          description: expect.stringContaining("dispatched via webhook (https://audit.secops.io/inbound/finwise)"),
        })
      );
    });

    // Cloud storage trigger test
    apiExports.triggerScheduledExportNow.mockResolvedValueOnce({
      result: {
        success: true,
        destination: "cloud_storage",
        cloud_uri: "s3://finwise-lake-vault/ledger/weekly/data.csv",
        provider: "s3",
        checksum_sha256: "def456sha",
        job_id: "job-cloud-1",
      },
      schedule: mockSchedules[0],
    });

    fireEvent.click(screen.getByTestId("btn-send-now-schedule-sched-1"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Test Report Dispatched!",
          description: expect.stringContaining("synced to cloud storage (s3://finwise-lake-vault/ledger/weekly/data.csv)"),
        })
      );
    });
  });
});

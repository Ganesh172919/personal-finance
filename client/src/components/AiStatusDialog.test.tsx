import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiStatusDialog } from "./AiStatusDialog";

const mockApi = vi.hoisted(() => ({
  getAiCoreStatus: vi.fn(),
  getEnhancedAiStatus: vi.fn(),
  getCanaryHealth: vi.fn(),
  runCanaryProbes: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...mockApi,
}));

const mockCanaryData = {
  status: "success",
  canary: {
    status: "healthy",
    total_evaluations: 24,
    passed_evaluations: 24,
    failed_evaluations: 0,
    pass_rate_pct: 100.0,
    last_evaluated_at: "2026-11-02T07:30:00.000Z",
    by_invariant: {
      number_subset: { total: 10, passed: 10, failed: 0, pass_rate_pct: 100 },
      zero_sum_reallocation: { total: 6, passed: 6, failed: 0, pass_rate_pct: 100 },
      balance_sheet_conservation: { total: 4, passed: 4, failed: 0, pass_rate_pct: 100 },
      cashflow_conservation: { total: 4, passed: 4, failed: 0, pass_rate_pct: 100 },
    },
    by_source: {
      aggregator_synthesis: { total: 12, passed: 12, failed: 0, pass_rate_pct: 100 },
      synthetic_probe: { total: 12, passed: 12, failed: 0, pass_rate_pct: 100 },
    },
    recent_events: [
      {
        probe_id: "probe-subset-1",
        timestamp: "2026-11-02T07:29:50.000Z",
        invariant: "number_subset",
        source: "aggregator_synthesis",
        passed: true,
        duration_ms: 1.45,
        details: { candidate_numbers: ["15000", "25.0%"] },
        violations: [],
      },
      {
        probe_id: "probe-rebal-1",
        timestamp: "2026-11-02T07:29:40.000Z",
        invariant: "zero_sum_reallocation",
        source: "live_inference",
        passed: true,
        duration_ms: 0.85,
        details: { sum_deltas: 0 },
        violations: [],
      },
    ],
  },
};

const mockProbeReport = {
  status: "success",
  report: {
    suite_name: "production_canary_probe_suite",
    total_probes: 4,
    suite_passed: 4,
    suite_failed: 0,
    suite_pass_rate_pct: 100.0,
    elapsed_ms: 12.4,
    results: [
      {
        probe_id: "canary-subset-valid-standard",
        invariant: "number_subset",
        description: "Standard monthly cashflow narrative with valid numeric subset",
        expected_pass: true,
        actual_invariant_passed: true,
        probe_assertion_passed: true,
        duration_ms: 1.2,
        violations: [],
      },
      {
        probe_id: "canary-rebalance-valid-zero-sum",
        invariant: "zero_sum_reallocation",
        description: "Conservative envelope shift preserving total 50,000 budget",
        expected_pass: true,
        actual_invariant_passed: true,
        probe_assertion_passed: true,
        duration_ms: 0.9,
        violations: [],
      },
    ],
    health_summary: mockCanaryData.canary,
  },
};

describe("AiStatusDialog Component - Continuous Canary & Invariant Validation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockApi.getAiCoreStatus.mockResolvedValue({
      ai_core: { healthy: true },
      server: { ai_core_client: { state: "connected" } },
    });
    mockApi.getEnhancedAiStatus.mockResolvedValue({
      status: "healthy",
      service: "FinWise AI Core",
      request_id: "req-123",
      provider: {
        active: "gemini",
        display_name: "Google Gemini 2.5",
        default_model: "gemini-2.5-flash",
        fallback_chain: ["gemini", "groq"],
      },
      key_pools: {},
      model_catalog: { total_models: 12, enabled_models: 8, free_models: 4 },
      model_health: {},
      sessions: { total_sessions: 5, total_checkpoints: 15 },
      rate_limiter: {},
      llm_usage: {},
      last_route: {},
      vision: {},
      memory: { enabled: true },
      canary: mockCanaryData.canary,
    });
    mockApi.getCanaryHealth.mockResolvedValue(mockCanaryData);
    mockApi.runCanaryProbes.mockResolvedValue(mockProbeReport);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AiStatusDialog lastRequestId="req-999" fallbackUsed={false} llmCallCount={2} cacheHit={true} />
      </QueryClientProvider>,
    );

  it("renders the trigger button and opens dialog with Canary tab available", async () => {
    renderComponent();
    const trigger = screen.getByRole("button", { name: /AI Status/i });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(await screen.findByText("AI System Status")).toBeInTheDocument();

    const canaryTab = screen.getByTestId("tab-canary");
    expect(canaryTab).toBeInTheDocument();
    expect(canaryTab).toHaveTextContent("Canary / Invariants");
  });

  it("switches to Canary tab and renders the real-time invariant health metrics", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /AI Status/i }));

    const canaryTab = await screen.findByTestId("tab-canary");
    fireEvent.click(canaryTab);

    // Verify header and status badge
    expect(await screen.findByText("Continuous Invariant Canary Guard")).toBeInTheDocument();
    const statusBadge = screen.getByTestId("badge-canary-status");
    expect(statusBadge).toHaveTextContent("healthy");

    // Verify metrics strip
    expect(screen.getByTestId("metric-canary-pass-rate")).toHaveTextContent("100.0%");
    expect(screen.getByTestId("metric-canary-total")).toHaveTextContent("24");
    expect(screen.getByTestId("metric-canary-passed")).toHaveTextContent("24");
    expect(screen.getByTestId("metric-canary-failed")).toHaveTextContent("0");

    // Verify verified mathematical invariants checklist
    expect(screen.getByText("Number Safety Guard")).toBeInTheDocument();
    expect(screen.getByText("Zero-Sum Rebalancing")).toBeInTheDocument();
    expect(screen.getByText("Balance Sheet Identity")).toBeInTheDocument();
    expect(screen.getByText("Cash Flow Conservation")).toBeInTheDocument();

    // Verify recent audit log
    expect(screen.getByText("Recent Invariant Audit Log")).toBeInTheDocument();
    expect(screen.getByTestId("list-canary-audit-events")).toBeInTheDocument();
    expect(screen.getByText("number_subset")).toBeInTheDocument();
    expect(screen.getByText("zero_sum_reallocation")).toBeInTheDocument();
  });

  it("runs the synthetic canary probe suite on click and displays the execution report", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /AI Status/i }));

    const canaryTab = await screen.findByTestId("tab-canary");
    fireEvent.click(canaryTab);

    const runBtn = await screen.findByTestId("btn-run-canary-probes");
    expect(runBtn).toHaveTextContent("Run Canary Probe Suite");

    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(mockApi.runCanaryProbes).toHaveBeenCalledWith(12);
    });

    // Check that probe results card renders
    expect(await screen.findByTestId("card-canary-probe-report")).toBeInTheDocument();
    expect(screen.getByText(/Probe Suite Result: 4\/4 Passed \(100%\)/)).toBeInTheDocument();
    expect(screen.getByText("Standard monthly cashflow narrative with valid numeric subset")).toBeInTheDocument();
    expect(screen.getByText("Conservative envelope shift preserving total 50,000 budget")).toBeInTheDocument();
  });
});

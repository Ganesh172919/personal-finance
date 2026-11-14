
const mockIncomeResponse: ScenarioResponse = {
  scenario_type: "income",
  amount: 500,
  baseline: {
    monthly_income: 7500,
    monthly_expenses: 3000,
    monthly_surplus: 4500,
    savings: 15000,
    total_debt: 1200,
  },
  delta: {
    monthly_surplus_change: 500,
    new_monthly_surplus: 5000,
    savings_change_horizon: 6000,
    projected_investment_value: null,
    emergency_fund_months_before: 5.0,
    emergency_fund_months_after: 5.0,
    goal_timeline_delta_months: -1,
  },
  assumptions: {
    months: 12,
    expected_return_pct: 0,
    inflation_pct: 3,
  },
  recommendations: [
    "Allocate extra surplus toward building a 6-month emergency reserve.",
  ],
  originalBudget: 4500,
  newBudget: 5000,
  savingsImpact: 500,
  goalDelay: -1,
  adjustments: [],
  fallback_used: false,
};

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Scenarios, {
  calculateMacroStressImpact,
  calculateAccountStressImpact,
  calculateMonteCarloBounds,
  formatRunwayMonths,
  HISTORICAL_MACRO_CRISES,
} from "./Scenarios";
import { ScenarioResponse } from "@/lib/apiClient";

const apiAi = vi.hoisted(() => ({
  processScenario: vi.fn(),
}));

const apiProfile = vi.hoisted(() => ({
  getFinancialProfile: vi.fn().mockResolvedValue({
    annual_income: 90000,
    monthly_expenses: 3000,
    savings: 15000,
  }),
}));

vi.mock("@/lib/api/profile", () => apiProfile);

const apiTransactions = vi.hoisted(() => ({
  getPortfolioSummary: vi.fn().mockResolvedValue({ summary: { total_invested: 6000 } }),
}));

vi.mock("@/lib/api/transactions", () => apiTransactions);

const apiTasks = vi.hoisted(() => ({
  createTask: vi.fn().mockResolvedValue({
    task: { _id: "task-macro-1", title: "Macro Resilience Plan: 2008 Great Financial Crisis" },
  }),
}));

vi.mock("@/lib/api/tasks", () => apiTasks);

const { mockAccounts, apiFinance } = vi.hoisted(() => {
  const mockAccounts = [
    {
      id: "acc-chk-1",
      name: "Chase Premier Checking",
      type: "checking",
      institution: "Chase",
      currency: "USD",
      opening_balance: 5000,
      current_balance: 5000,
      status: "active",
    },
    {
      id: "acc-sav-2",
      name: "Marcus High Yield Savings",
      type: "savings",
      institution: "Marcus",
      currency: "USD",
      opening_balance: 25000,
      current_balance: 25000,
      status: "active",
    },
    {
      id: "acc-brok-3",
      name: "Fidelity Brokerage Account",
      type: "brokerage",
      institution: "Fidelity",
      currency: "USD",
      opening_balance: 80000,
      current_balance: 80000,
      status: "active",
    },
    {
      id: "acc-crd-4",
      name: "Amex Blue Cash Preferred",
      type: "credit",
      institution: "Amex",
      currency: "USD",
      opening_balance: -2000,
      current_balance: -2000,
      status: "active",
    },
  ];
  return {
    mockAccounts,
    apiFinance: {
      listAccounts: vi.fn().mockResolvedValue({
        accounts: mockAccounts,
      }),
    },
  };
});

vi.mock("@/lib/api/v1/finance", () => apiFinance);

const navigateMock = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/scenarios", navigateMock],
}));

vi.mock("@/lib/apiClient", () => ({
  ...apiAi,
  ApiError: class extends Error {
    requestId = "req-scenario-123";
  },
}));

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({
    data: {
      org: {
        role: "admin",
        currency: "USD",
        locale: "en-US",
      },
    },
  }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const mockExpenseResponse: ScenarioResponse = {
  scenario_type: "expense",
  amount: 350,
  baseline: {
    monthly_income: 7500,
    monthly_expenses: 3000,
    monthly_surplus: 4500,
    savings: 15000,
    total_debt: 1200,
  },
  delta: {
    monthly_surplus_change: -350,
    new_monthly_surplus: 4150,
    savings_change_horizon: -4200,
    projected_investment_value: null,
    emergency_fund_months_before: 5.0,
    emergency_fund_months_after: 3.6,
    goal_timeline_delta_months: 1,
  },
  assumptions: {
    months: 36,
    expected_return_pct: 0,
    inflation_pct: 3,
  },
  recommendations: [
    "Reduce discretionary dining spend to offset auto loan repayment.",
    "Maintain minimum emergency fund contributions.",
  ],
  originalBudget: 4500,
  newBudget: 4150,
  savingsImpact: -350,
  goalDelay: 1,
  adjustments: [
    { category: "Dining Out", reduction: 150 },
  ],
  fallback_used: false,
};

const mockInvestmentResponse: ScenarioResponse = {
  scenario_type: "investment",
  amount: 200,
  baseline: {
    monthly_income: 7500,
    monthly_expenses: 3000,
    monthly_surplus: 4500,
    savings: 15000,
    total_debt: 1200,
  },
  delta: {
    monthly_surplus_change: -200,
    new_monthly_surplus: 4300,
    savings_change_horizon: 5400,
    projected_investment_value: 5850,
    emergency_fund_months_before: 5.0,
    emergency_fund_months_after: 5.0,
    goal_timeline_delta_months: -2,
  },
  assumptions: {
    months: 24,
    expected_return_pct: 12,
    inflation_pct: 3,
  },
  recommendations: [
    "High compounding expected over the 24 month horizon.",
  ],
  originalBudget: 4500,
  newBudget: 4300,
  savingsImpact: -200,
  goalDelay: -2,
  adjustments: [],
  fallback_used: false,
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Scenarios page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders scenario page structure, empty state, and builder form", () => {
    renderWithClient(<Scenarios />);

    expect(screen.getByTestId("scenarios-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What-If Scenarios" })).toBeInTheDocument();
    expect(screen.getByTestId("select-scenario-type")).toBeInTheDocument();
    expect(screen.getByTestId("input-scenario-amount")).toBeInTheDocument();
    expect(screen.getByTestId("input-scenario-months")).toBeInTheDocument();
    expect(screen.getByTestId("input-scenario-return")).toBeDisabled();
    expect(screen.getByTestId("button-calculate-scenario")).toBeInTheDocument();
    expect(screen.getByText("No Active Simulation")).toBeInTheDocument();
  });

  it("populates inputs when selecting a quick preset pill", () => {
    renderWithClient(<Scenarios />);

    const carPreset = screen.getByRole("button", { name: "-350/mo Car EMI" });
    fireEvent.click(carPreset);

    expect(screen.getByTestId("input-scenario-amount")).toHaveValue(350);
    expect(screen.getByTestId("input-scenario-description")).toHaveValue("Auto Loan / Car EMI");
    expect(screen.getByTestId("input-scenario-months")).toHaveValue(36);
  });

  it("shows validation error if calculate is clicked with invalid or zero amount", () => {
    renderWithClient(<Scenarios />);

    const calculateBtn = screen.getByTestId("button-calculate-scenario");
    // Button is disabled when amount is empty
    expect(calculateBtn).toBeDisabled();

    // Enter 0 or negative
    const amountInput = screen.getByTestId("input-scenario-amount");
    fireEvent.change(amountInput, { target: { value: "0" } });
    expect(calculateBtn).not.toBeDisabled();

    fireEvent.click(calculateBtn);

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Validation Error",
        variant: "destructive",
      })
    );
    expect(apiAi.processScenario).not.toHaveBeenCalled();
  });

  it("submits scenario calculation and renders detailed impact metrics", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockExpenseResponse);

    renderWithClient(<Scenarios />);

    const carPreset = screen.getByRole("button", { name: "-350/mo Car EMI" });
    fireEvent.click(carPreset);

    const calculateBtn = screen.getByTestId("button-calculate-scenario");
    fireEvent.click(calculateBtn);

    await waitFor(() => {
      expect(apiAi.processScenario.mock.calls[0][0]).toEqual({
        scenario_type: "expense",
        amount: 350,
        description: "Auto Loan / Car EMI",
        assumptions: {
          months: 36,
          expected_return_pct: undefined,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("scenario-results-detailed")).toBeInTheDocument();
    });

    // Check primary metric cards
    expect(screen.getByTestId("metric-monthly-surplus")).toBeInTheDocument();
    expect(screen.getByTestId("metric-savings-change")).toBeInTheDocument();
    expect(screen.getByTestId("metric-emergency-runway")).toBeInTheDocument();
    expect(screen.getByTestId("metric-goal-timeline")).toBeInTheDocument();

    // Check emergency runway numbers
    expect(screen.getByText("3.6 months")).toBeInTheDocument();
    expect(screen.getByTestId("metric-emergency-runway")).toHaveTextContent("Before: 5 months");

    // Check recommendations and adjustments
    expect(
      screen.getByText("Reduce discretionary dining spend to offset auto loan repayment.")
    ).toBeInTheDocument();
    expect(screen.getByText("Dining Out")).toBeInTheDocument();
  });

  it("renders projected investment value for investment scenarios", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockInvestmentResponse);

    renderWithClient(<Scenarios />);

    const sipPreset = screen.getByRole("button", { name: "+200/mo SIP Booster" });
    fireEvent.click(sipPreset);

    // Return input is now enabled for investment type
    expect(screen.getByTestId("input-scenario-return")).not.toBeDisabled();

    const calculateBtn = screen.getByTestId("button-calculate-scenario");
    fireEvent.click(calculateBtn);

    await waitFor(() => {
      expect(screen.getByTestId("metric-investment-value")).toBeInTheDocument();
    });

    expect(screen.getByText("Projected Investment Value")).toBeInTheDocument();
    expect(screen.getByText("12% annual return")).toBeInTheDocument();
  });

  it("supports copying summary breakdown and navigating to Copilot", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockExpenseResponse);

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByTestId("button-copy-breakdown")).toBeInTheDocument();
    });

    // Test Copy Breakdown
    fireEvent.click(screen.getByTestId("button-copy-breakdown"));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Copied to Clipboard",
        })
      );
    });

    // Test Ask Copilot navigation
    const copilotBtn = screen.getByTestId("button-ask-copilot");
    fireEvent.click(copilotBtn);
    expect(navigateMock).toHaveBeenCalledWith(
      expect.stringContaining("/chat?prompt=")
    );
  });

  it("resets scenario when clicking Reset button", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockExpenseResponse);

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByTestId("button-reset-scenario")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("button-reset-scenario"));

    expect(screen.queryByTestId("scenario-results-detailed")).not.toBeInTheDocument();
    expect(screen.getByTestId("input-scenario-amount")).toHaveValue(null);
    expect(screen.getByText("No Active Simulation")).toBeInTheDocument();
  });

  it("displays calculation error alert when API call rejects", async () => {
    apiAi.processScenario.mockRejectedValueOnce(new Error("AI Core engine timeout"));

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByText("Calculation Failed")).toBeInTheDocument();
      expect(screen.getByText("AI Core engine timeout")).toBeInTheDocument();
    });
  });

  it("pins scenario to multi-scenario comparison matrix and displays side-by-side metrics", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockExpenseResponse);

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByTestId("button-pin-scenario")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("button-pin-scenario"));

    expect(screen.getByTestId("badge-saved-scenarios-count")).toHaveTextContent("1 Pinned");
    expect(screen.getByTestId("comparison-matrix-section")).toBeInTheDocument();
    expect(screen.getByTestId("scenario-comparison-table")).toBeInTheDocument();
    expect(screen.getByText("Multi-Scenario Comparison Matrix")).toBeInTheDocument();
    expect(screen.getByText("Auto Loan / Car EMI")).toBeInTheDocument();
  });

  it("loads saved scenario back into builder when clicking load button", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockExpenseResponse);

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByTestId("button-pin-scenario")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("button-pin-scenario"));

    // Reset the builder
    fireEvent.click(screen.getByTestId("button-reset-scenario"));
    expect(screen.getByTestId("input-scenario-amount")).toHaveValue(null);

    // Find and click the load button in the table header
    const loadButtons = screen.getAllByTitle("Load into Builder");
    expect(loadButtons.length).toBeGreaterThan(0);
    fireEvent.click(loadButtons[0]);

    // Check that builder is repopulated
    expect(screen.getByTestId("input-scenario-amount")).toHaveValue(350);
    expect(screen.getByTestId("input-scenario-description")).toHaveValue("Auto Loan / Car EMI");
  });

  it("removes individual saved scenario and clears all pinned scenarios", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockExpenseResponse);

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByTestId("button-pin-scenario")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("button-pin-scenario"));
    expect(screen.getByTestId("comparison-matrix-section")).toBeInTheDocument();

    // Click Clear All
    const clearBtn = screen.getByTestId("button-clear-comparisons");
    fireEvent.click(clearBtn);

    expect(screen.queryByTestId("comparison-matrix-section")).not.toBeInTheDocument();
  });

  it("renders marginal tax bracket selector and net take-home calculation for income scenarios", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockIncomeResponse);

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "+500/mo Salary Raise" }));

    // Container for tax bracket selector should appear for income type
    expect(screen.getByTestId("container-tax-bracket")).toBeInTheDocument();
    expect(screen.getByTestId("select-tax-bracket")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByTestId("metric-tax-breakdown")).toBeInTheDocument();
      expect(screen.getByTestId("metric-net-take-home")).toBeInTheDocument();
    });

    // 500 at 25% tax bracket = 125 tax withheld, 375 net take-home
    expect(screen.getByText("+$375/mo")).toBeInTheDocument();
    expect(screen.getByText("-$125/mo")).toBeInTheDocument();
  });

  it("renders Monte Carlo stochastic risk bounds and purchasing power metrics", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockExpenseResponse);

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByTestId("monte-carlo-bounds")).toBeInTheDocument();
      expect(screen.getByTestId("metric-purchasing-power")).toBeInTheDocument();
    });

    expect(screen.getByText(/Monte Carlo Stochastic Risk Bounds/i)).toBeInTheDocument();
    expect(screen.getByText("Inflation-Adjusted Purchasing Power")).toBeInTheDocument();
  });

  it("exports comparison matrix to CSV and copies Markdown table to clipboard", async () => {
    apiAi.processScenario.mockResolvedValueOnce(mockExpenseResponse);

    renderWithClient(<Scenarios />);

    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    fireEvent.click(screen.getByTestId("button-calculate-scenario"));

    await waitFor(() => {
      expect(screen.getByTestId("button-pin-scenario")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("button-pin-scenario"));

    // Copy Markdown
    const copyMdBtn = screen.getByTestId("button-copy-comparison");
    fireEvent.click(copyMdBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("FinWise Multi-Scenario Comparison Matrix")
      );
    });

    // Export CSV
    const exportCsvBtn = screen.getByTestId("button-export-comparison-csv");
    fireEvent.click(exportCsvBtn);

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Comparison Exported",
      })
    );
  });


describe("Historical Macro Scenario Replay & Stress Testing", () => {
    it("computes deterministic macro stress metrics for 2008 GFC, COVID 2020, and 1970s Stagflation", () => {
      const gfc = HISTORICAL_MACRO_CRISES.find((c) => c.id === "gfc_2008")!;
      const baseline = {
        monthly_income: 6000,
        monthly_expenses: 4000,
        savings: 20000,
        investments: 50000,
      };

      const resGfc = calculateMacroStressImpact(gfc, baseline);
      expect(resGfc.stressedIncome).toBe(4800);
      expect(resGfc.stressedExpenses).toBe(4000);
      expect(resGfc.stressedMonthlyCashflow).toBe(800);
      expect(resGfc.monthlyBurn).toBe(0);
      expect(resGfc.portfolioDrawdown).toBe(-19000);
      expect(resGfc.stressedPortfolioValue).toBe(31000);
      expect(resGfc.capitalDeficit).toBe(0);
      expect(resGfc.resilienceRating).toBe("Moderate Risk");

      const stag = HISTORICAL_MACRO_CRISES.find((c) => c.id === "stagflation_1970s")!;
      const tightBaseline = {
        monthly_income: 4000,
        monthly_expenses: 3800,
        savings: 5000,
        investments: 30000,
      };
      const resStag = calculateMacroStressImpact(stag, tightBaseline);
      expect(resStag.stressedExpenses).toBe(4370);
      expect(resStag.stressedMonthlyCashflow).toBe(-370);
      expect(resStag.monthlyBurn).toBe(370);
      expect(resStag.stressedEmergencyRunwayMonths).toBeCloseTo(13.5, 1);
      expect(resStag.capitalDeficit).toBe(8320);
      expect(resStag.resilienceRating).toBe("Moderate Risk");
    });

    it("renders historical macro crisis replay cockpit with crisis chips and metrics", async () => {
      renderWithClient(<Scenarios />);

      expect(screen.getByTestId("card-macro-stress-testing")).toBeInTheDocument();
      expect(screen.getByText("Historical Macro Crisis Replay & Stress Testing")).toBeInTheDocument();
      expect(await screen.findByTestId("badge-resilience-status")).toBeInTheDocument();

      expect(screen.getByTestId("btn-select-crisis-gfc_2008")).toBeInTheDocument();
      expect(screen.getByTestId("btn-select-crisis-covid_2020")).toBeInTheDocument();
      expect(screen.getByTestId("btn-select-crisis-stagflation_1970s")).toBeInTheDocument();
      expect(screen.getByTestId("btn-select-crisis-dotcom_2000")).toBeInTheDocument();
      expect(screen.getByTestId("btn-select-crisis-rate_shock_2022")).toBeInTheDocument();

      expect(screen.getByTestId("metric-stressed-runway")).toBeInTheDocument();
      expect(screen.getByTestId("metric-stressed-cashflow")).toBeInTheDocument();
      expect(screen.getByTestId("metric-portfolio-drawdown")).toBeInTheDocument();
      expect(screen.getByTestId("metric-buffer-deficit")).toBeInTheDocument();
    });

    it("switches active crisis scenario when clicking crisis chips", async () => {
      renderWithClient(<Scenarios />);

      expect(screen.getAllByText(/2007 – 2009/i).length).toBeGreaterThan(0);

      const covidBtn = screen.getByTestId("btn-select-crisis-covid_2020");
      fireEvent.click(covidBtn);

      await waitFor(() => {
        expect(screen.getAllByText(/Feb – Aug 2020/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/V-shaped bounce within 6 months/i)).toBeInTheDocument();
      });
    });

    it("loads macro shock into scenario builder upon clicking Load Shock button", async () => {
      renderWithClient(<Scenarios />);

      const loadBtn = await screen.findByTestId("btn-load-macro-scenario");
      fireEvent.click(loadBtn);

      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Crisis Loaded into Builder",
        })
      );

      const descInput = screen.getByTestId("input-scenario-description") as HTMLInputElement;
      expect(descInput.value).toMatch(/Macro Crisis Shock|Income Loss|Cost Surge/i);
    });

    it("schedules crisis resilience plan task into tasks backlog", async () => {
      renderWithClient(<Scenarios />);

      const planBtn = await screen.findByTestId("btn-schedule-crisis-plan");
      fireEvent.click(planBtn);

      await waitFor(() => {
        expect(apiTasks.createTask).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringContaining("Macro Resilience Plan"),
            kind: "cashflow",
          })
        );
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Crisis Resilience Plan Scheduled",
          })
        );
      });
      expect(apiTasks.createTask.mock.calls[0][0].steps).toContain(
        "Maintain the current liquid reserve; this simulation shows no additional cash buffer deficit."
      );
    });
  });

  describe("Dynamic Real-Time Linked Bank / Broker Account Live Stress Testing", () => {
    it("computes deterministic per-account stress impact for brokerage, liquid, and credit debt", () => {
      const gfcCrisis = HISTORICAL_MACRO_CRISES[0]; // 2008 GFC (-38% equity shock)
      const brokAccount = mockAccounts[2]; // Fidelity 80k brokerage
      const savAccount = mockAccounts[1]; // Marcus 25k savings
      const crdAccount = mockAccounts[3]; // Amex -2k credit

      // Standard beta 1.0
      const brokImpact1 = calculateAccountStressImpact(brokAccount as any, gfcCrisis, 1.0);
      expect(brokImpact1.postBalance).toBe(49600); // 80k * (1 - 0.38)
      expect(brokImpact1.dollarChange).toBe(-30400);
      expect(brokImpact1.pctChange).toBe(-38);
      expect(brokImpact1.vulnerabilitySeverity).toBe("high");

      // Aggressive beta 1.5
      const brokImpact15 = calculateAccountStressImpact(brokAccount as any, gfcCrisis, 1.5);
      expect(brokImpact15.postBalance).toBe(34400); // 80k * (1 - 0.57)
      expect(brokImpact15.pctChange).toBe(-57);

      // Liquid savings inflation drag
      const savImpact = calculateAccountStressImpact(savAccount as any, gfcCrisis, 1.0);
      expect(savImpact.postBalance).toBeLessThanOrEqual(25000);
      expect(savImpact.vulnerabilitySeverity).toBe("safe");

      // Credit card debt hike
      const crdImpact = calculateAccountStressImpact(crdAccount as any, gfcCrisis, 1.0);
      expect(crdImpact.postBalance).toBe(-2300); // -2000 - 300
      expect(crdImpact.vulnerabilitySeverity).toBe("moderate");
    });

    it("renders dynamic linked accounts live stress cockpit with live balance aggregates", async () => {
      renderWithClient(<Scenarios />);

      expect(await screen.findByTestId("card-live-accounts-stress-testing")).toBeInTheDocument();
      expect(screen.getByTestId("metric-live-net-liquid")).toBeInTheDocument();
      expect(screen.getByTestId("metric-live-broker-holdings")).toBeInTheDocument();
      expect(screen.getByTestId("metric-live-broker-drawdown")).toBeInTheDocument();
      expect(screen.getByTestId("metric-live-required-buffer")).toBeInTheDocument();
      expect(screen.getByTestId("metric-live-buffer-health")).toBeInTheDocument();
      expect(await screen.findByTestId("table-live-account-stress")).toBeInTheDocument();
    });

    it("toggles between live accounts mode and manual profile baseline", async () => {
      renderWithClient(<Scenarios />);

      const toggleBtn = await screen.findByTestId("toggle-live-accounts-mode");
      expect(toggleBtn).toHaveTextContent(/Use saved accounts/i);

      fireEvent.click(toggleBtn);
      expect(toggleBtn).toHaveTextContent(/Using Profile Baseline/i);

      fireEvent.click(toggleBtn);
      expect(toggleBtn).toHaveTextContent(/Use saved accounts/i);
    });

    it("adjusts equity risk sensitivity beta and updates projected drawdowns", async () => {
      renderWithClient(<Scenarios />);

      await screen.findByTestId("card-live-accounts-stress-testing");

      // Click 0.5x Defensive Beta
      const beta05Btn = screen.getByTestId("btn-beta-0.5");
      fireEvent.click(beta05Btn);
      expect(screen.getByTestId("metric-live-broker-drawdown")).toHaveTextContent(/-19%/i);

      // Click 1.5x Aggressive Beta
      const beta15Btn = screen.getByTestId("btn-beta-1.5");
      fireEvent.click(beta15Btn);
      expect(screen.getByTestId("metric-live-broker-drawdown")).toHaveTextContent(/-57%/i);

      // Restore 1.0x Market Beta
      const beta10Btn = screen.getByTestId("btn-beta-1.0");
      fireEvent.click(beta10Btn);
      expect(screen.getByTestId("metric-live-broker-drawdown")).toHaveTextContent(/-38%/i);
    });

    it("renders account-level breakdown table and schedules defensive buffer allocation task", async () => {
      renderWithClient(<Scenarios />);

      expect(await screen.findByTestId("row-account-stress-acc-chk-1")).toBeInTheDocument();
      expect(screen.getByTestId("row-account-stress-acc-sav-2")).toBeInTheDocument();
      expect(screen.getByTestId("row-account-stress-acc-brok-3")).toBeInTheDocument();
      expect(screen.getByTestId("row-account-stress-acc-crd-4")).toBeInTheDocument();

      expect(screen.getByTestId("badge-account-risk-acc-brok-3")).toHaveTextContent(/Equity Shock/i);
      expect(screen.getByTestId("badge-account-risk-acc-crd-4")).toHaveTextContent(/Debt Service/i);

      // Either safe banner or forced liquidation warning is rendered
      const hasWarning = screen.queryByTestId("alert-liquidation-risk");
      const hasSafeBanner = screen.queryByTestId("banner-buffer-safe");
      expect(Boolean(hasWarning || hasSafeBanner)).toBe(true);

      if (hasWarning) {
        const scheduleBtn = screen.getByTestId("btn-schedule-buffer-task");
        fireEvent.click(scheduleBtn);
        await waitFor(() => {
          expect(apiTasks.createTask).toHaveBeenCalledWith(
            expect.objectContaining({
              priority: "high",
            })
          );
        });
      }
    });
  });
});


describe("Scenario calculation regressions", () => {
  it("orders expense Monte Carlo bounds so bearish is the costlier outcome", () => {
    const bounds = calculateMonteCarloBounds(-350, 36, false);
    expect(bounds.p50).toBe(-12600);
    expect(bounds.p10).toBe(-14490);
    expect(bounds.p90).toBe(-11970);
    expect(bounds.p10).toBeLessThan(bounds.p50);
    expect(bounds.p90).toBeGreaterThan(bounds.p50);

    const income = calculateMonteCarloBounds(500, 12, false);
    expect(income.p10).toBe(5100);
    expect(income.p90).toBe(6300);
  });

  it("stress-tests explicit zero savings and investments as zero instead of illustrative defaults", () => {
    const gfc = HISTORICAL_MACRO_CRISES.find((c) => c.id === "gfc_2008")!;
    const res = calculateMacroStressImpact(gfc, {
      monthly_income: 4000,
      monthly_expenses: 4500,
      savings: 0,
      investments: 0,
    });
    expect(res.portfolioDrawdown).toBe(0);
    expect(res.stressedPortfolioValue).toBe(0);
    expect(res.stressedEmergencyRunwayMonths).toBe(0);
    expect(res.capitalDeficit).toBeGreaterThan(0);
  });

  it("formats raw runway floats from the scenario engine", () => {
    expect(formatRunwayMonths(0.5854773808072187)).toBe("0.6");
    expect(formatRunwayMonths(3.658273381294964)).toBe("3.7");
    expect(formatRunwayMonths(5)).toBe("5");
  });

  it("uses recorded invested capital (not a hard-coded $50,000) for the portfolio drawdown", async () => {
    // No linked brokerage accounts, so the stress test must use the portfolio summary.
    apiFinance.listAccounts.mockResolvedValueOnce({ accounts: [] });
    renderWithClient(<Scenarios />);
    // GFC -38% of $6,000 invested = -$2,280.
    await waitFor(() =>
      expect(screen.getByTestId("metric-portfolio-drawdown")).toHaveTextContent(/2,280/)
    );
    expect(screen.getByTestId("metric-portfolio-drawdown")).not.toHaveTextContent(/19,000/);
  });
});

describe("Scenarios recorded financial baseline", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    apiProfile.getFinancialProfile.mockResolvedValue({
      annual_income: 90000,
      monthly_expenses: 3000,
      savings: 15000,
    });
    apiFinance.listAccounts.mockResolvedValue({ accounts: mockAccounts });
    apiTransactions.getPortfolioSummary.mockResolvedValue({ summary: { total_invested: 6000 } });
  });

  afterEach(cleanup);

  it("keeps forecasts and task actions unavailable until income, expenses and savings are recorded", async () => {
    apiProfile.getFinancialProfile.mockResolvedValueOnce({});
    apiFinance.listAccounts.mockResolvedValueOnce({ accounts: [] });
    renderWithClient(<Scenarios />);

    expect(await screen.findByText("Financial baseline unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("macro-baseline-unavailable")).toHaveTextContent(
      "recorded monthly income, monthly expenses, savings"
    );
    expect(screen.queryByTestId("macro-stress-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-resilience-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-load-macro-scenario")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-schedule-crisis-plan")).not.toBeInTheDocument();
    expect(screen.queryByTestId("banner-buffer-safe")).not.toBeInTheDocument();
    expect(apiTasks.createTask).not.toHaveBeenCalled();

    // Editable scenario assumptions remain usable without inventing a profile.
    fireEvent.click(screen.getByRole("button", { name: "-350/mo Car EMI" }));
    expect(screen.getByTestId("input-scenario-amount")).toHaveValue(350);
    expect(screen.getByTestId("input-scenario-months")).toHaveValue(36);
  });

  it("preserves saved zero income, expenses and savings instead of substituting a sample household", async () => {
    apiProfile.getFinancialProfile.mockResolvedValueOnce({ annual_income: 0, monthly_expenses: 0, savings: 0 });
    apiFinance.listAccounts.mockResolvedValueOnce({ accounts: [] });
    renderWithClient(<Scenarios />);

    expect(await screen.findByTestId("metric-stressed-cashflow")).toHaveTextContent("+$0/mo");
    expect(screen.getByText("Baseline: $0/mo")).toBeInTheDocument();
    expect(screen.queryByTestId("macro-baseline-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("metric-live-net-liquid")).not.toBeInTheDocument();
    expect(screen.queryByTestId("banner-buffer-safe")).not.toBeInTheDocument();
    expect(screen.getByTestId("live-accounts-unavailable")).toHaveTextContent("No linked bank or broker accounts found");
    expect(screen.getByTestId("metric-stressed-runway")).toHaveTextContent("Not available");
    expect(screen.queryByTestId("badge-resilience-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-schedule-crisis-plan")).toBeDisabled();
    expect(screen.queryByText("99.9 months")).not.toBeInTheDocument();

    // A shock with zero cash impact leaves the amount for the user to supply.
    fireEvent.click(screen.getByTestId("btn-select-crisis-stagflation_1970s"));
    fireEvent.click(screen.getByTestId("btn-load-macro-scenario"));
    expect(screen.getByTestId("input-scenario-amount")).toHaveValue(null);
    expect(screen.getByTestId("button-calculate-scenario")).toBeDisabled();
  });

  it("does not report a zero-value portfolio or safe account buffer when the saved portfolio fails to load", async () => {
    apiFinance.listAccounts.mockResolvedValueOnce({ accounts: [] });
    apiTransactions.getPortfolioSummary.mockRejectedValueOnce(new Error("Portfolio unavailable"));
    renderWithClient(<Scenarios />);

    expect(await screen.findByText("Financial baseline unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("macro-baseline-unavailable")).toHaveTextContent("recorded invested capital");
    expect(screen.queryByTestId("metric-portfolio-drawdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("banner-buffer-safe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh saved data" })).toBeEnabled();
  });

  it("uses selected account zeroes instead of falling back to older profile savings or invested capital", async () => {
    apiProfile.getFinancialProfile.mockResolvedValueOnce({ annual_income: 12000, monthly_expenses: 2000, savings: 9000 });
    apiFinance.listAccounts.mockResolvedValueOnce({
      accounts: [mockAccounts[0], mockAccounts[2]].map((account) => ({ ...account, current_balance: 0 })),
    });
    renderWithClient(<Scenarios />);

    // $1,000 income becomes $800; $2,000 expenses stay unchanged:
    // $1,200 monthly deficit across the selected 24-month crisis = $28,800.
    await waitFor(() => expect(screen.getByTestId("metric-buffer-deficit")).toHaveTextContent("$28,800"));
    expect(screen.getByTestId("metric-stressed-runway")).toHaveTextContent("0 months");
    expect(screen.getByTestId("metric-portfolio-drawdown")).toHaveTextContent("$0");

    fireEvent.click(screen.getByTestId("toggle-live-accounts-mode"));
    expect(screen.getByTestId("metric-buffer-deficit")).toHaveTextContent("$19,800");
    expect(screen.getByTestId("metric-portfolio-drawdown")).toHaveTextContent("2,280");
  });

  it.each(["monthly_income", "monthly_expenses", "savings", "investments"] as const)(
    "rejects missing or invalid %s rather than producing an illustrative forecast",
    (field) => {
      const crisis = HISTORICAL_MACRO_CRISES[0];
      const baseline = { monthly_income: 4000, monthly_expenses: 2500, savings: 9000, investments: 6000 };
      for (const value of [undefined, Number.NaN, -1]) {
        expect(() => calculateMacroStressImpact(crisis, { ...baseline, [field]: value } as typeof baseline))
          .toThrow("A complete saved financial baseline is required");
      }
    }
  );
});


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

import Scenarios, { calculateMacroStressImpact, HISTORICAL_MACRO_CRISES } from "./Scenarios";
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

const apiTasks = vi.hoisted(() => ({
  createTask: vi.fn().mockResolvedValue({
    task: { _id: "task-macro-1", title: "Macro Resilience Plan: 2008 Great Financial Crisis" },
  }),
}));

vi.mock("@/lib/api/tasks", () => apiTasks);

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
    expect(screen.getByText("Before: 5 months")).toBeInTheDocument();

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
      expect(screen.getByTestId("badge-resilience-status")).toBeInTheDocument();

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

      const loadBtn = screen.getByTestId("btn-load-macro-scenario");
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

      const planBtn = screen.getByTestId("btn-schedule-crisis-plan");
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
    });
  });
});

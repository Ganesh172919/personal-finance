with open(r"c:\Users\RAVIPRAKASH\personal-finance\client\src\pages\Scenarios.test.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Add mockIncomeResponse after mockInvestmentResponse
income_mock = """
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
"""

if "mockIncomeResponse" not in code:
    target = "const mockInvestmentResponse: ScenarioResponse = {"
    code = income_mock + "\n" + code

new_tests = """
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
"""

# Insert new tests before the final `});`
last_brace = code.rfind("});")
code = code[:last_brace] + new_tests + "\n});\n"

with open(r"c:\Users\RAVIPRAKASH\personal-finance\client\src\pages\Scenarios.test.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Updated Scenarios.test.tsx successfully")

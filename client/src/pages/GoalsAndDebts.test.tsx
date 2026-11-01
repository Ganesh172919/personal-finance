import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import GoalsAndDebts from "./GoalsAndDebts";

const api = vi.hoisted(() => ({ createGoal: vi.fn(), updateGoal: vi.fn(), createDebt: vi.fn(), createTask: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({
  ...api, updateDebt: vi.fn(), deleteGoal: vi.fn(), deleteDebt: vi.fn(), ApiError: class extends Error {},
}));
vi.mock("@/hooks/useOrgFormatters", () => ({ useOrgFormatters: () => ({ formatMoney: (v: number) => `USD ${v.toFixed(2)}` }) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const clients: QueryClient[] = [];
const profile = { goals: [], debts: [] };
function showPage(data: object | null = profile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity,
    queryFn: () => data ? Promise.resolve(data) : Promise.reject(new Error("Offline")) } } });
  if (data) client.setQueryData(["/api/financial-profiles/me"], data);
  clients.push(client);
  render(<QueryClientProvider client={client}><GoalsAndDebts /></QueryClientProvider>);
}
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.clearAllMocks(); });
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }

it("accepts cents in goal amounts and submits the exact values", async () => {
  api.createGoal.mockResolvedValue({});
  showPage();
  fireEvent.change(screen.getByLabelText("Name", { selector: "#goal-name" }), { target: { value: "QA laptop" } });
  fill("Target", "1250.50"); fill("Current", "25.25"); fill("Deadline", "2027-05-01");
  expect(screen.getByLabelText("Target")).toBeValid();
  expect(screen.getByLabelText("Current")).toBeValid();
  fireEvent.click(screen.getByRole("button", { name: "Add Goal" }));
  await waitFor(() => expect(api.createGoal).toHaveBeenCalledWith({ name: "QA laptop", target: 1250.5, current: 25.25, deadline: "2027-05-01", priority: 1 }));
});

it("keeps an ISO deadline editable and preserves it when saving", async () => {
  api.updateGoal.mockResolvedValue({});
  showPage({ goals: [{ id: "goal-1", name: "QA dated goal", target: 500, current: 10.25, deadline: "2027-05-01T00:00:00.000Z", priority: 1 }], debts: [] });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Deadline")).toHaveValue("2027-05-01");
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));
  await waitFor(() => expect(api.updateGoal).toHaveBeenCalledWith("goal-1", expect.objectContaining({ deadline: "2027-05-01", current: 10.25 })));
});

it("accepts fractional debt interest and minimum payments", async () => {
  api.createDebt.mockResolvedValue({});
  showPage();
  fireEvent.change(screen.getByLabelText("Name", { selector: "#debt-name" }), { target: { value: "QA loan" } });
  fill("Balance", "100.50"); fill("Interest Rate (%)", "18.25"); fill("Minimum Payment", "12.75");
  expect(screen.getByLabelText("Interest Rate (%)")).toBeValid();
  fireEvent.click(screen.getByRole("button", { name: "Add Debt" }));
  await waitFor(() => expect(api.createDebt).toHaveBeenCalledWith({ name: "QA loan", balance: 100.5, interest_rate: 18.25, minimum_payment: 12.75, type: "Loan" }));
});

it("does not offer an empty editor when profile loading fails", async () => {
  showPage(null);
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add Goal" })).not.toBeInTheDocument();
});

it("displays goal funding summary and monthly contribution pace", async () => {
  showPage({
    goals: [
      { id: "goal-1", name: "Emergency Fund", target: 6000, current: 3000, deadline: "2027-10-01", priority: 8 },
    ],
    debts: [],
  });
  expect(screen.getByText("Funded:")).toBeInTheDocument();
  expect(screen.getByText("50% Overall")).toBeInTheDocument();
  expect(screen.getByText("Priority 8 (High)")).toBeInTheDocument();
  expect(screen.getByText(/Need USD [\d.]+\/mo/)).toBeInTheDocument();
});

it("displays debt liability summary and avalanche strategy recommendation", async () => {
  showPage({
    goals: [],
    debts: [
      { id: "debt-1", name: "High Interest Card", balance: 2000, interest_rate: 24.5, minimum_payment: 100, type: "Credit Card" },
      { id: "debt-2", name: "Student Loan", balance: 10000, interest_rate: 5.5, minimum_payment: 150, type: "Student Loan" },
    ],
  });
  expect(screen.getByText("Total Liabilities:")).toBeInTheDocument();
  expect(screen.getByText(/Avalanche Strategy:/)).toBeInTheDocument();
  expect(screen.getByText(/Snowball Strategy:/)).toBeInTheDocument();
  expect(screen.getByText(/Accelerated Payoff Calculator/)).toBeInTheDocument();
  expect(screen.getAllByText("High Interest Card").length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText(/months to payoff/).length).toBeGreaterThan(0);
});

it("schedules an accelerated debt payoff plan task with one click", async () => {
  api.createTask.mockResolvedValue({ task: { id: "task-debt-1" } });
  showPage({
    goals: [],
    debts: [
      { id: "debt-1", name: "High Interest Card", balance: 2000, interest_rate: 24.5, minimum_payment: 100, type: "Credit Card" },
      { id: "debt-2", name: "Student Loan", balance: 10000, interest_rate: 5.5, minimum_payment: 150, type: "Student Loan" },
    ],
  });
  const scheduleButton = screen.getByRole("button", { name: "+ Schedule Avalanche Plan" });
  fireEvent.click(scheduleButton);
  await waitFor(() =>
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Avalanche Plan"),
        kind: "debt",
        priority: "high",
      })
    )
  );
});

it("creates an action task from a goal with one click", async () => {
  api.createTask.mockResolvedValue({ task: { id: "task-1" } });
  showPage({
    goals: [
      { id: "goal-1", name: "Emergency Fund", target: 6000, current: 3000, deadline: "2027-10-01", priority: 8 },
    ],
    debts: [],
  });
  const button = screen.getByRole("button", { name: "+ Create Task" });
  fireEvent.click(button);
  await waitFor(() =>
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Save for Emergency Fund",
        kind: "goal",
        priority: "high",
      })
    )
  );
});

it("detects goal milestone drift and auto-schedules catch-up task", async () => {
  api.createTask.mockResolvedValue({ task: { id: "drift-task-1" } });
  showPage({
    monthlyIncome: 2500,
    monthlyExpenses: 2300, // surplus = $200
    goals: [
      { id: "goal-1", name: "Down Payment", target: 20000, current: 2000, deadline: "2027-04-01", priority: 9 },
    ],
    debts: [],
  });

  expect(screen.getByTestId("goal-drift-alert")).toBeInTheDocument();
  expect(screen.getByText("Milestone Pacing Drift Detected")).toBeInTheDocument();
  expect(screen.getByText(/-USD [\d.]+\/mo gap/)).toBeInTheDocument();

  const autoScheduleBtn = screen.getByRole("button", { name: "⚡ Auto-Schedule Task" });
  fireEvent.click(autoScheduleBtn);

  await waitFor(() =>
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("goal funding gap"),
        kind: "goal",
        priority: "high",
        bucket: 30,
      })
    )
  );
});

it("flags overdue goal drift and schedules realignment task", async () => {
  api.createTask.mockResolvedValue({ task: { id: "overdue-task-1" } });
  showPage({
    monthlyIncome: 4000,
    monthlyExpenses: 2000,
    goals: [
      { id: "goal-overdue", name: "Missed Deadline Goal", target: 5000, current: 1500, deadline: "2021-01-01", priority: 8 },
    ],
    debts: [],
  });

  expect(screen.getByTestId("goal-drift-alert")).toBeInTheDocument();
  expect(screen.getByText(/1 goal is overdue/i)).toBeInTheDocument();

  const autoScheduleBtn = screen.getByRole("button", { name: "⚡ Auto-Schedule Task" });
  fireEvent.click(autoScheduleBtn);

  await waitFor(() =>
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Adjust milestone timeline"),
        kind: "goal",
        priority: "high",
      })
    )
  );
});

it("renders multi-goal portfolio rebalancing and switches strategies", async () => {
  showPage({
    goals: [
      { id: "g1", name: "Emergency Fund", target: 10000, current: 2000, deadline: "2027-12-01", priority: 10 },
      { id: "g2", name: "Vacation Fund", target: 3000, current: 500, deadline: "2026-12-01", priority: 3 },
    ],
    debts: [],
  });

  expect(screen.getByTestId("multi-goal-rebalancing-section")).toBeInTheDocument();
  expect(screen.getByText("Multi-Goal Portfolio Rebalancing")).toBeInTheDocument();
  expect(screen.getByText("2 active goals")).toBeInTheDocument();

  // Verify switching strategies
  const urgencyBtn = screen.getByTestId("strategy-urgency-btn");
  fireEvent.click(urgencyBtn);

  const balancedBtn = screen.getByTestId("strategy-balanced-btn");
  fireEvent.click(balancedBtn);

  // Adjust surplus allocation input
  const surplusInput = screen.getByTestId("rebalance-surplus-input");
  fireEvent.change(surplusInput, { target: { value: "800" } });
  expect(surplusInput).toHaveValue(800);
});

it("schedules a multi-goal savings plan task with one click", async () => {
  api.createTask.mockResolvedValue({ task: { id: "multi-task-1" } });
  showPage({
    goals: [
      { id: "g1", name: "Emergency Fund", target: 10000, current: 2000, deadline: "2027-12-01", priority: 8 },
      { id: "g2", name: "Vacation Fund", target: 3000, current: 500, deadline: "2026-12-01", priority: 4 },
    ],
    debts: [],
  });

  const scheduleBtn = screen.getByTestId("schedule-multi-goal-plan-btn");
  fireEvent.click(scheduleBtn);

  await waitFor(() =>
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Multi-Goal Plan"),
        kind: "goal",
        priority: "high",
        steps: expect.arrayContaining([
          expect.stringContaining("Emergency Fund"),
          expect.stringContaining("Vacation Fund"),
        ]),
      })
    )
  );
});

it("distributes lump-sum windfall across multiple goals and updates balances", async () => {
  api.updateGoal.mockResolvedValue({ goal: {} });
  showPage({
    goals: [
      { id: "g1", name: "Emergency Fund", target: 10000, current: 2000, deadline: "2027-12-01", priority: 8 },
      { id: "g2", name: "Vacation Fund", target: 3000, current: 500, deadline: "2026-12-01", priority: 2 },
    ],
    debts: [],
  });

  // Open windfall dialog
  const windfallTrigger = screen.getByTestId("windfall-redistribute-trigger-btn");
  fireEvent.click(windfallTrigger);

  expect(screen.getByTestId("dialog-windfall-redistribute")).toBeInTheDocument();
  expect(screen.getByText("Distribute Lump-Sum Windfall")).toBeInTheDocument();

  // Change windfall amount
  const windfallInput = screen.getByTestId("windfall-amount-input");
  fireEvent.change(windfallInput, { target: { value: "1000" } });

  // Apply windfall
  const applyBtn = screen.getByTestId("apply-windfall-btn");
  fireEvent.click(applyBtn);

  await waitFor(() => {
    expect(api.updateGoal).toHaveBeenCalledTimes(2);
    expect(api.updateGoal).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({
        name: "Emergency Fund",
        current: expect.any(Number),
      })
    );
    expect(api.updateGoal).toHaveBeenCalledWith(
      "g2",
      expect.objectContaining({
        name: "Vacation Fund",
        current: expect.any(Number),
      })
    );
  });
});


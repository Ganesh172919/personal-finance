import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { GoalProgress } from "./GoalProgress";
import * as taskApi from "@/lib/api/tasks";

vi.mock("@/lib/api/tasks", () => ({
  createTask: vi.fn().mockResolvedValue({ task: { id: "test-task-123" } }),
}));

vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    formatMoney: (v: number) => `USD ${Math.round(v)}`,
  }),
}));

const clients: QueryClient[] = [];
function renderComponent(profileData: any) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        queryFn: () => Promise.resolve(profileData || { goals: [], debts: [] }),
      },
    },
  });
  if (profileData) {
    client.setQueryData(["/api/financial-profiles/me"], profileData);
  }
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <GoalProgress />
    </QueryClientProvider>
  );
  return client;
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.clearAllMocks();
});

it("renders empty state with link to /goals-debts when no goals exist", () => {
  renderComponent({ goals: [], debts: [] });

  expect(screen.getByText("No goals set yet. Start by defining your financial targets!")).toBeInTheDocument();
  const setGoalLink = screen.getByRole("link", { name: /Set your first goal/i });
  expect(setGoalLink).toHaveAttribute("href", "/goals-debts");
});

it("renders goals with pacing and status badges", () => {
  renderComponent({
    goals: [
      {
        name: "Emergency Fund",
        target: 10000,
        current: 5000,
        deadline: "2027-10-01",
        priority: 8,
      },
      {
        name: "Vacation",
        target: 2000,
        current: 2000,
        deadline: "2026-12-01",
        priority: 3,
      },
    ],
    debts: [],
  });

  expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
  expect(screen.getByText("50% complete")).toBeInTheDocument();
  expect(screen.getByText("On Track")).toBeInTheDocument();
  expect(screen.getByText(/Need USD \d+\/mo/)).toBeInTheDocument();

  expect(screen.getByText("Vacation")).toBeInTheDocument();
  expect(screen.getByText("100% complete")).toBeInTheDocument();
  expect(screen.getByText("Achieved")).toBeInTheDocument();
  expect(screen.getByText("Target reached! 🎉")).toBeInTheDocument();

  const manageLink = screen.getByRole("link", { name: /Manage →/i });
  expect(manageLink).toHaveAttribute("href", "/goals-debts");
});

it("detects goal milestone drift and schedules catch-up task when clicked", async () => {
  renderComponent({
    monthlyIncome: 2000,
    monthlyExpenses: 1900, // surplus = $100/mo
    goals: [
      {
        name: "Home Downpayment",
        target: 20000,
        current: 5000,
        deadline: "2027-04-01", // ~6 months -> needs ~$2500/mo, exceeding $100 surplus
        priority: 9,
      },
    ],
    debts: [],
  });

  expect(screen.getByTestId("goal-drift-banner")).toBeInTheDocument();
  expect(screen.getByText("Milestone Drift Detected")).toBeInTheDocument();
  expect(screen.getByText(/-USD \d+\/mo gap/)).toBeInTheDocument();

  const catchupBtn = screen.getByRole("button", { name: /\+ Catch-up Plan/i });
  expect(catchupBtn).toBeInTheDocument();

  fireEvent.click(catchupBtn);

  await waitFor(() => expect(taskApi.createTask).toHaveBeenCalledTimes(1));
  const taskCall = vi.mocked(taskApi.createTask).mock.calls[0][0];
  expect(taskCall.title).toMatch(/goal savings gap/i);
  expect(taskCall.priority).toBe("high");
  expect(taskCall.kind).toBe("goal");
  expect(taskCall.steps?.length).toBeGreaterThan(0);
});

it("detects overdue goal drift and schedules timeline adjustment task", async () => {
  renderComponent({
    monthlyIncome: 5000,
    monthlyExpenses: 3000,
    goals: [
      {
        name: "Old Vacation Goal",
        target: 3000,
        current: 1000,
        deadline: "2020-01-01", // Past deadline -> overdue!
        priority: 5,
      },
    ],
    debts: [],
  });

  expect(screen.getByTestId("goal-drift-banner")).toBeInTheDocument();
  expect(screen.getByText(/1 goal is overdue/i)).toBeInTheDocument();

  const catchupBtn = screen.getByRole("button", { name: /\+ Catch-up Plan/i });
  fireEvent.click(catchupBtn);

  await waitFor(() => expect(taskApi.createTask).toHaveBeenCalledTimes(1));
  const taskCall = vi.mocked(taskApi.createTask).mock.calls[0][0];
  expect(taskCall.title).toMatch(/Adjust milestone timeline/i);
  expect(taskCall.kind).toBe("goal");
});

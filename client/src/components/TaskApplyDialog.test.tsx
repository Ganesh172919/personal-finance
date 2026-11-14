import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { TaskApplyDialog } from "./TaskApplyDialog";

const api = vi.hoisted(() => ({ applyTaskEffects: vi.fn(), updateTaskStatus: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({ ...api, ApiError: class extends Error {} }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: api.toast }) }));
vi.mock("@/hooks/useOrgFormatters", () => ({ useOrgFormatters: () => ({ currency: "USD" }) }));
const clients: QueryClient[] = [];
const profileKey = ["/api/financial-profiles/me"];
function ProfileObserver() {
  const { data } = useQuery<{ goals: Array<{ name: string }> }>({ queryKey: profileKey });
  return <output>{data?.goals[0]?.name}</output>;
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => ({ goals: [], debts: [] }) } } });
  client.setQueryData(profileKey, { goals: [{ id: "goal-a", name: "Reserve" }], debts: [{ id: "debt-a", name: "Loan" }] });
  clients.push(client);
  render(<QueryClientProvider client={client}><ProfileObserver /><TaskApplyDialog open onOpenChange={vi.fn()} task={{
    _id: "qa-task", title: "Review statement", why: "Reconcile records", steps: [], bucket: 30,
    kind: "expense_reduction", priority: "medium", expected_impact: "Accurate records", status: "open",
  }} /></QueryClientProvider>);
  return client;
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.resetAllMocks(); });

it("exposes named effect fields and accepts cent precision", async () => {
  show();
  expect(screen.getByRole("spinbutton", { name: "Amount (USD)" })).toHaveAttribute("step", "0.01");
  expect(screen.getByRole("combobox", { name: "Transaction type" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Effect type" }), { target: { value: "goal_progress" } });
  expect(screen.getByRole("combobox", { name: "Goal" })).toHaveValue("goal-a");
  expect(screen.getByRole("spinbutton", { name: "Goal progress amount" })).toHaveAttribute("step", "0.01");
  fireEvent.change(screen.getByRole("combobox", { name: "Effect type" }), { target: { value: "debt_payment" } });
  expect(screen.getByRole("combobox", { name: "Debt" })).toHaveValue("debt-a");
  expect(screen.getByRole("spinbutton", { name: "Debt payment amount" })).toHaveAttribute("step", "0.01");
});

it("preserves draft effects and the retry key when profile data refreshes", async () => {
  api.applyTaskEffects.mockRejectedValue(new Error("Connection lost after send"));
  const client = show();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12.34" } });
  fireEvent.click(screen.getByRole("button", { name: "Add effect" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply outcomes" }));
  await waitFor(() => expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Apply failed" })));
  const firstKey = api.applyTaskEffects.mock.calls[0][1].idempotency_key;
  act(() => client.setQueryData(profileKey, { goals: [{ id: "goal-a", name: "Updated reserve" }], debts: [] }));
  await screen.findByText("Updated reserve");
  expect(screen.getByText(/expense.*Other.*12.34/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apply outcomes" }));
  await waitFor(() => expect(api.applyTaskEffects).toHaveBeenCalledTimes(2));
  expect(api.applyTaskEffects.mock.calls[1][1]).toMatchObject({ idempotency_key: firstKey,
    effects: [{ type: "transaction", transaction: { amount: 12.34 } }],
  });
});

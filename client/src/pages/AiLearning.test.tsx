import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/apiError";
import AiLearning from "./AiLearning";

const api = vi.hoisted(() => ({
  getLearningStatus: vi.fn(),
  listLearningArtifacts: vi.fn(),
  listLearningReports: vi.fn(),
  promoteArtifact: vi.fn(),
  rollbackArtifact: vi.fn(),
  runLearningOptimizer: vi.fn(),
  getFeedbackReviewQueue: vi.fn(),
  reviewFeedbackItem: vi.fn(),
}));
vi.mock("@/lib/api/aiLearning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/aiLearning")>()),
  ...api,
}));
const config = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({ isLoading: false, data: { org: { role: config.role } } }),
}));

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AiLearning />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  config.role = "admin";
  api.getLearningStatus.mockResolvedValue({
    promotionMode: "human",
    canary: { active: { artifactId: "art-2", progress: 0.4 }, lastDecisions: [] },
    reports: [],
    optimizer: { lastRunAt: null },
  });
  api.listLearningArtifacts.mockResolvedValue({
    items: [
      { id: "art-1", kind: "prompt", status: "active", version: 3 },
      { id: "art-2", kind: "prompt", status: "canary", version: 4 },
    ],
  });
  api.listLearningReports.mockResolvedValue({ items: [] });
  api.getFeedbackReviewQueue.mockResolvedValue({
    items: [
      {
        id: "fb1",
        reason_code: "wrong_number",
        correction: "Rent was 5000",
        route: "budget",
        prompt_version: "p1",
        model_name: "m",
        feedback_at: null,
        input_preview: "How much?",
        response_preview: "A lot",
      },
    ],
    next_cursor: null,
    pending_count: 1,
  });
  api.promoteArtifact.mockResolvedValue({ id: "art-2", status: "active" });
  api.reviewFeedbackItem.mockResolvedValue({ item: {} });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders artifacts, canary progress and the review queue for admins", async () => {
  renderPage();
  expect(await screen.findByTestId("artifact-art-1")).toBeInTheDocument();
  expect(screen.getByTestId("canary-progress")).toHaveTextContent("art-2");
  expect(screen.getByTestId("canary-progress")).toHaveTextContent("40%");
  expect(await screen.findByText(/Suggested correction: Rent was 5000/)).toBeInTheDocument();
});

it("promotes an artifact and decides a review item", async () => {
  renderPage();
  const row = await screen.findByTestId("artifact-art-2");
  fireEvent.click(row.querySelector("button")!);
  await waitFor(() => expect(api.promoteArtifact).toHaveBeenCalledWith("art-2"));
  fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
  await waitFor(() => expect(api.reviewFeedbackItem).toHaveBeenCalledWith("fb1", "accepted"));
});

it("disables promote in suggest-only mode", async () => {
  api.getLearningStatus.mockResolvedValue({ promotionMode: "suggest", canary: {}, reports: [] });
  renderPage();
  const row = await screen.findByTestId("artifact-art-2");
  await waitFor(() => expect(screen.getByTestId("promotion-mode")).toHaveTextContent("suggest"));
  expect(row.querySelector("button")).toBeDisabled();
});

it("shows a clean message when the server refuses with GATE_NOT_PASSED", async () => {
  api.promoteArtifact.mockRejectedValue(new ApiError("Conflict", { status: 409, code: "GATE_NOT_PASSED" }));
  renderPage();
  const row = await screen.findByTestId("artifact-art-2");
  fireEvent.click(row.querySelector("button")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(/evaluation gate/);
});

it("is not available to members", () => {
  config.role = "member";
  renderPage();
  expect(screen.getByTestId("ai-learning-denied")).toBeInTheDocument();
  expect(api.getLearningStatus).not.toHaveBeenCalled();
});

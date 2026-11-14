import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import ReceiptsPage from "./Receipts";

const api = vi.hoisted(() => ({
  listReceipts: vi.fn(),
  getReceiptById: vi.fn(),
  confirmReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
  parseReceipt: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...api,
  ApiError: class extends Error {
    requestId = "req-123";
  },
}));

let mockFeatures = { receipts_ocr_enabled: true };

vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    currency: "USD",
    formatMoney: (v: number) => `USD ${v.toFixed(2)}`,
    formatDateTime: (d: string) => d,
    configQuery: {
      data: {
        features: mockFeatures,
      },
      isLoading: false,
      error: null,
    },
  }),
}));

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({
    data: {
      features: mockFeatures,
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const sampleReceipt = {
  id: "receipt-1",
  status: "parsed",
  createdAt: "2026-10-25T10:00:00.000Z",
  extracted: {
    vendor: "Whole Foods Market",
    date: "2026-10-25",
    total: 42.5,
    currency: "USD",
    category_suggestion: "Groceries",
  },
};

const confirmedReceipt = {
  id: "receipt-2",
  status: "confirmed",
  createdAt: "2026-10-24T10:00:00.000Z",
  extracted: {
    vendor: "Tech Depot",
    date: "2026-10-24",
    total: 129.99,
    currency: "USD",
    category_suggestion: "Electronics",
  },
};

const clients: QueryClient[] = [];
function renderReceipts() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ReceiptsPage />
    </QueryClientProvider>
  );
  return client;
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.clearAllMocks();
  mockFeatures = { receipts_ocr_enabled: true };
});

it("renders receipt items and filters by status tab", async () => {
  api.listReceipts.mockResolvedValue({
    receipts: [sampleReceipt, confirmedReceipt],
    pagination: { page: 1, limit: 20, total: 2 },
  });

  renderReceipts();

  expect(await screen.findByText("Whole Foods Market")).toBeInTheDocument();
  expect(screen.getByText("Tech Depot")).toBeInTheDocument();

  // Filter to 'parsed'
  const parsedTab = screen.getByRole("tab", { name: "Parsed" });
  fireEvent.pointerDown(parsedTab, { button: 0, ctrlKey: false });
  fireEvent.keyDown(parsedTab, { key: "Enter" });
  fireEvent.click(parsedTab);

  await waitFor(() => {
    expect(screen.getByText("Whole Foods Market")).toBeInTheDocument();
    expect(screen.queryByText("Tech Depot")).not.toBeInTheDocument();
  });

  // Filter to 'confirmed'
  const confirmedTab = screen.getByRole("tab", { name: "Confirmed" });
  fireEvent.pointerDown(confirmedTab, { button: 0, ctrlKey: false });
  fireEvent.keyDown(confirmedTab, { key: "Enter" });
  fireEvent.click(confirmedTab);

  await waitFor(() => {
    expect(screen.queryByText("Whole Foods Market")).not.toBeInTheDocument();
    expect(screen.getByText("Tech Depot")).toBeInTheDocument();
  });
});

it("opens detail sheet and confirms transaction from receipt", async () => {
  api.listReceipts.mockResolvedValue({
    receipts: [sampleReceipt],
    pagination: { page: 1, limit: 20, total: 1 },
  });
  api.getReceiptById.mockResolvedValue({
    receipt: sampleReceipt,
  });
  api.confirmReceipt.mockResolvedValue({
    success: true,
  });

  renderReceipts();

  const item = await screen.findByText("Whole Foods Market");
  fireEvent.click(item);

  expect(await screen.findByText("Confirm fields")).toBeInTheDocument();

  const confirmBtn = screen.getByRole("button", { name: "Confirm & Create" });
  fireEvent.click(confirmBtn);

  await waitFor(() =>
    expect(api.confirmReceipt).toHaveBeenCalledWith(
      "receipt-1",
      expect.objectContaining({
        vendor: "Whole Foods Market",
        total: 42.5,
        currency: "USD",
      })
    )
  );
});

it("renders Scan Receipt trigger in page header when feature is enabled", async () => {
  api.listReceipts.mockResolvedValue({ receipts: [], pagination: { total: 0 } });
  renderReceipts();

  expect(await screen.findByRole("button", { name: /Scan Receipt/i })).toBeInTheDocument();
});

it("renders disabled message when receipts_ocr_enabled is false", async () => {
  mockFeatures = { receipts_ocr_enabled: false };
  renderReceipts();

  expect(await screen.findByText(/Receipt OCR is disabled on this server/i)).toBeInTheDocument();
});

it("deletes a parsed receipt from detail sheet", async () => {
  api.listReceipts.mockResolvedValue({
    receipts: [sampleReceipt],
    pagination: { page: 1, limit: 20, total: 1 },
  });
  api.getReceiptById.mockResolvedValue({
    receipt: sampleReceipt,
  });
  api.deleteReceipt.mockResolvedValue({
    success: true,
  });

  renderReceipts();

  const item = await screen.findByText("Whole Foods Market");
  fireEvent.click(item);

  expect(await screen.findByTestId("sheet-status-badge")).toHaveTextContent("parsed");

  const deleteBtn = screen.getByTestId("btn-delete-receipt");
  expect(deleteBtn).toBeInTheDocument();
  fireEvent.click(deleteBtn);

  await waitFor(() => {
    expect(api.deleteReceipt).toHaveBeenCalledWith("receipt-1");
  });
});

it("shows confirmed notice and disables delete button for confirmed receipts", async () => {
  api.listReceipts.mockResolvedValue({
    receipts: [confirmedReceipt],
    pagination: { page: 1, limit: 20, total: 1 },
  });
  api.getReceiptById.mockResolvedValue({
    receipt: confirmedReceipt,
  });

  renderReceipts();

  const item = await screen.findByText("Tech Depot");
  fireEvent.click(item);

  expect(await screen.findByTestId("sheet-status-badge")).toHaveTextContent("confirmed");
  expect(screen.getByTestId("notice-already-confirmed")).toBeInTheDocument();
  expect(screen.queryByTestId("btn-delete-receipt")).not.toBeInTheDocument();
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiptOcrDialog } from "./ReceiptOcrDialog";

const api = vi.hoisted(() => ({
  parseReceipt: vi.fn(),
  confirmReceipt: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...api,
  ApiError: class extends Error {
    requestId = "req-123";
  },
}));

let mockFeatures = { receipts_ocr_enabled: true };

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({
    data: {
      features: mockFeatures,
      org: { currency: "USD" },
    },
    isLoading: false,
  }),
}));

const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockParseResponse = {
  success: true,
  receipt_id: "rec-test-100",
  file_id: "file-test-100",
  extracted: {
    vendor: "Trader Joe's",
    date: "2026-10-28",
    total: 38.75,
    tax: 2.5,
    currency: "USD",
    category_suggestion: "Groceries",
    items: [
      { description: "Organic Bananas", total: 1.99, confidence: 0.95 },
      { description: "Almond Butter", total: 6.99, confidence: 0.85 },
    ],
  },
  confidence: {
    vendor: 0.92,
    date: 0.88,
    total: 0.95,
    tax: 0.35,
    currency: 1.0,
  },
  warnings: ["Image rotated by 90 degrees automatically"],
  request_id: "req-ocr-100",
};

describe("ReceiptOcrDialog Component", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatures = { receipts_ocr_enabled: true };
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    api.parseReceipt.mockResolvedValue(mockParseResponse);
    api.confirmReceipt.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  const renderDialog = (props: { onConfirmed?: () => void; currencyHint?: string } = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ReceiptOcrDialog {...props} />
      </QueryClientProvider>,
    );
  };

  it("renders Scan Receipt button and disables it when feature flag is off", () => {
    mockFeatures = { receipts_ocr_enabled: false };
    renderDialog();

    const btn = screen.getByTestId("btn-scan-receipt");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("opens dialog on click and displays file upload input", async () => {
    renderDialog();

    const trigger = screen.getByTestId("btn-scan-receipt");
    expect(trigger).not.toBeDisabled();
    fireEvent.click(trigger);

    expect(await screen.findByTestId("dialog-receipt-ocr")).toBeInTheDocument();
    expect(screen.getByText("Receipt OCR")).toBeInTheDocument();
    expect(screen.getByTestId("input-receipt-file")).toBeInTheDocument();
  });

  it("handles receipt file upload, calls parseReceipt, and displays extracted fields with confidence badges", async () => {
    renderDialog({ currencyHint: "USD" });

    fireEvent.click(screen.getByTestId("btn-scan-receipt"));
    expect(await screen.findByTestId("input-receipt-file")).toBeInTheDocument();

    const file = new File(["dummy content"], "receipt.jpg", { type: "image/jpeg" });
    const input = screen.getByTestId("input-receipt-file");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(api.parseReceipt).toHaveBeenCalledWith(file, { currencyHint: "USD" });
    });

    // Check review form rendered
    expect(await screen.findByTestId("ocr-review-form")).toBeInTheDocument();

    // Verify extracted field inputs
    const vendorInput = screen.getByTestId("input-ocr-vendor") as HTMLInputElement;
    expect(vendorInput.value).toBe("Trader Joe's");

    const dateInput = screen.getByTestId("input-ocr-date") as HTMLInputElement;
    expect(dateInput.value).toBe("2026-10-28");

    const totalInput = screen.getByTestId("input-ocr-total") as HTMLInputElement;
    expect(totalInput.value).toBe("38.75");

    const taxInput = screen.getByTestId("input-ocr-tax") as HTMLInputElement;
    expect(taxInput.value).toBe("2.5");

    const categoryInput = screen.getByTestId("input-ocr-category") as HTMLInputElement;
    expect(categoryInput.value).toBe("Groceries");

    const currencyInput = screen.getByTestId("input-ocr-currency") as HTMLInputElement;
    expect(currencyInput.value).toBe("USD");

    // Verify confidence badges
    expect(screen.getByTestId("badge-confidence-vendor")).toHaveTextContent("92%");
    expect(screen.getByTestId("badge-confidence-date")).toHaveTextContent("88%");
    expect(screen.getByTestId("badge-confidence-total")).toHaveTextContent("95%");
    expect(screen.getByTestId("badge-confidence-tax")).toHaveTextContent("35%");
    expect(screen.getByTestId("badge-confidence-currency")).toHaveTextContent("100%");

    // Verify warnings card
    expect(screen.getByTestId("ocr-warnings-card")).toBeInTheDocument();
    expect(screen.getByText("Image rotated by 90 degrees automatically")).toBeInTheDocument();
  });

  it("toggles line items table and displays item details with confidence badges", async () => {
    renderDialog();

    fireEvent.click(screen.getByTestId("btn-scan-receipt"));
    expect(await screen.findByTestId("input-receipt-file")).toBeInTheDocument();

    const file = new File(["dummy"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("input-receipt-file"), { target: { files: [file] } });

    expect(await screen.findByTestId("btn-toggle-ocr-items")).toHaveTextContent("Show items (2)");

    // Toggle items table open
    fireEvent.click(screen.getByTestId("btn-toggle-ocr-items"));

    expect(await screen.findByTestId("ocr-items-table")).toBeInTheDocument();
    expect(screen.getByText("Organic Bananas")).toBeInTheDocument();
    expect(screen.getByText("Almond Butter")).toBeInTheDocument();
    expect(screen.getByTestId("badge-confidence-item-0")).toHaveTextContent("95%");
    expect(screen.getByTestId("badge-confidence-item-1")).toHaveTextContent("85%");

    // Toggle items table closed
    expect(screen.getByTestId("btn-toggle-ocr-items")).toHaveTextContent("Hide items (2)");
    fireEvent.click(screen.getByTestId("btn-toggle-ocr-items"));
    expect(screen.queryByTestId("ocr-items-table")).not.toBeInTheDocument();
  });

  it("validates form fields and disables confirm button when required fields are missing", async () => {
    renderDialog();

    fireEvent.click(screen.getByTestId("btn-scan-receipt"));
    const file = new File(["dummy"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("input-receipt-file"), { target: { files: [file] } });

    expect(await screen.findByTestId("btn-confirm-ocr")).not.toBeDisabled();

    // Clear vendor -> button should become disabled
    fireEvent.change(screen.getByTestId("input-ocr-vendor"), { target: { value: "   " } });
    expect(screen.getByTestId("btn-confirm-ocr")).toBeDisabled();

    // Restore vendor
    fireEvent.change(screen.getByTestId("input-ocr-vendor"), { target: { value: "Sprouts" } });
    expect(screen.getByTestId("btn-confirm-ocr")).not.toBeDisabled();

    // Set invalid total (0) -> button should become disabled
    fireEvent.change(screen.getByTestId("input-ocr-total"), { target: { value: "0" } });
    expect(screen.getByTestId("btn-confirm-ocr")).toBeDisabled();
  });

  it("submits confirmReceipt mutation and calls onConfirmed callback", async () => {
    const onConfirmed = vi.fn();
    renderDialog({ onConfirmed });

    fireEvent.click(screen.getByTestId("btn-scan-receipt"));
    const file = new File(["dummy"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("input-receipt-file"), { target: { files: [file] } });

    expect(await screen.findByTestId("btn-confirm-ocr")).toBeInTheDocument();

    // Edit vendor and total before confirming
    fireEvent.change(screen.getByTestId("input-ocr-vendor"), { target: { value: "Trader Joe's Supermarket" } });
    fireEvent.change(screen.getByTestId("input-ocr-total"), { target: { value: "40.00" } });

    fireEvent.click(screen.getByTestId("btn-confirm-ocr"));

    await waitFor(() => {
      expect(api.confirmReceipt).toHaveBeenCalledWith(
        "rec-test-100",
        expect.objectContaining({
          vendor: "Trader Joe's Supermarket",
          date: "2026-10-28",
          total: 40,
          category: "Groceries",
          currency: "USD",
        }),
      );
      expect(onConfirmed).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Saved" }),
      );
    });

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByTestId("dialog-receipt-ocr")).not.toBeInTheDocument();
    });
  });
});

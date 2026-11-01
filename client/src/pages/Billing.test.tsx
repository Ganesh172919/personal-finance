import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Billing from "./Billing";

const apiBilling = vi.hoisted(() => ({
  createBillingCheckout: vi.fn(),
  getBillingPortal: vi.fn(),
  purchaseCreditPack: vi.fn(),
  getBillingInvoices: vi.fn(),
  downloadInvoicePdf: vi.fn(),
  getDunningStatus: vi.fn(),
  retryDunningPayment: vi.fn(),
  simulateDunningFailure: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...apiBilling,
  ApiError: class extends Error {
    requestId = "req-billing-123";
  },
}));

let mockConfig = {
  org: {
    role: "admin",
    currency: "USD",
    locale: "en-US",
  },
  entitlements: {
    plan: "free",
    status: "active",
    usage: {
      monthly_ai_calls: 15,
      scenarios: 8,
      ocr_receipts: 4,
    },
    limits: {
      monthly_ai_calls: 60,
      scenarios: 30,
      ocr_receipts: 20,
      export_access: false,
    },
  },
};

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({
    data: mockConfig,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Billing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiBilling.getBillingInvoices.mockResolvedValue({ invoices: [] });
    apiBilling.getDunningStatus.mockResolvedValue({
      dunning: {
        in_dunning: false,
        status: "none",
        grace_period_days_remaining: 0,
        current_attempt: 1,
        max_attempts: 3,
        next_retry_at: null,
        last_failure_reason: null,
        retry_history: [],
      },
    });
    mockConfig = {
      org: {
        role: "admin",
        currency: "USD",
        locale: "en-US",
      },
      entitlements: {
        plan: "free",
        status: "active",
        usage: {
          monthly_ai_calls: 15,
          scenarios: 8,
          ocr_receipts: 4,
        },
        limits: {
          monthly_ai_calls: 60,
          scenarios: 30,
          ocr_receipts: 20,
          export_access: false,
        },
      },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders page header, current plan badge, quota meters, and plan options", () => {
    renderWithClient(<Billing />);

    expect(screen.getByTestId("billing-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Subscription & Billing" })).toBeInTheDocument();
    expect(screen.getByTestId("badge-current-plan")).toHaveTextContent("free Plan");

    // Quota meters
    expect(screen.getByTestId("card-quota-meters")).toBeInTheDocument();
    expect(screen.getByTestId("meter-ai-calls")).toHaveTextContent("15 / 60");
    expect(screen.getByTestId("meter-scenarios")).toHaveTextContent("8 / 30");
    expect(screen.getByTestId("meter-ocr")).toHaveTextContent("4 / 20");

    // Tier cards
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();

    // Free button should be disabled for free user
    expect(screen.getByTestId("button-plan-free")).toBeDisabled();
    // Pro button should be enabled
    expect(screen.getByTestId("button-upgrade-pro")).not.toBeDisabled();
  });

  it("triggers upgrade to Pro and handles instant activation", async () => {
    apiBilling.createBillingCheckout.mockResolvedValueOnce({
      activated: true,
      plan: "pro",
    });

    renderWithClient(<Billing />);

    const proBtn = screen.getByTestId("button-upgrade-pro");
    fireEvent.click(proBtn);

    await waitFor(() => {
      expect(apiBilling.createBillingCheckout.mock.calls[0][0]).toEqual({
        plan_tier: "pro",
        billing_cycle: "monthly",
      });
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Plan Upgraded Successfully",
        })
      );
    });
  });

  it("handles Stripe checkout URL redirect response", async () => {
    const originalAssign = window.location.assign;
    const assignMock = vi.fn();
    delete (window as any).location;
    (window as any).location = { assign: assignMock, origin: "http://localhost:5180" };

    try {
      apiBilling.createBillingCheckout.mockResolvedValueOnce({
        checkout_url: "https://checkout.stripe.com/pay/cs_test_123",
      });

      renderWithClient(<Billing />);

      const teamBtn = screen.getByTestId("button-upgrade-team");
      fireEvent.click(teamBtn);

      await waitFor(() => {
        expect(apiBilling.createBillingCheckout.mock.calls[0][0]).toEqual({
          plan_tier: "team",
          billing_cycle: "monthly",
        });
        expect(assignMock).toHaveBeenCalledWith("https://checkout.stripe.com/pay/cs_test_123");
      });
    } finally {
      (window as any).location.assign = originalAssign;
    }
  });

  it("opens Stripe billing portal via customer portal action", async () => {
    const originalAssign = window.location.assign;
    const assignMock = vi.fn();
    delete (window as any).location;
    (window as any).location = { assign: assignMock, origin: "http://localhost:5180" };

    try {
      apiBilling.getBillingPortal.mockResolvedValueOnce({
        portal_url: "https://billing.stripe.com/p/session_test_456",
      });

      renderWithClient(<Billing />);

      const portalBtn = screen.getByTestId("button-open-portal");
      fireEvent.click(portalBtn);

      await waitFor(() => {
        expect(apiBilling.getBillingPortal.mock.calls[0][0]).toContain("/billing");
        expect(assignMock).toHaveBeenCalledWith("https://billing.stripe.com/p/session_test_456");
      });
    } finally {
      (window as any).location.assign = originalAssign;
    }
  });

  it("renders error alert when upgrade checkout rejects", async () => {
    apiBilling.createBillingCheckout.mockRejectedValueOnce(
      new Error("Payment gateway connection rejected")
    );

    renderWithClient(<Billing />);

    const proBtn = screen.getByTestId("button-upgrade-pro");
    fireEvent.click(proBtn);

    await waitFor(() => {
      expect(screen.getByText("Billing Action Failed")).toBeInTheDocument();
      expect(screen.getByText("Payment gateway connection rejected")).toBeInTheDocument();
    });
  });

  it("renders proactive quota warning alert when a meter reaches 80% or 100%", () => {
    mockConfig.entitlements.usage.monthly_ai_calls = 55; // 55/60 = 92%
    mockConfig.entitlements.usage.ocr_receipts = 20; // 20/20 = 100%

    renderWithClient(<Billing />);

    const alert = screen.getByTestId("alert-quota-warning");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Monthly Quota Limit Reached")).toBeInTheDocument();
    expect(screen.getByText(/AI Intelligence Calls \(92%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Receipt OCR Scans \(100%\)/)).toBeInTheDocument();
  });

  it("renders on-demand credit packs catalog with all 4 booster cards", () => {
    renderWithClient(<Billing />);

    const creditPacksCard = screen.getByTestId("card-credit-packs");
    expect(creditPacksCard).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "On-Demand Credit Packs" })).toBeInTheDocument();

    expect(screen.getByTestId("pack-card-ai_pack_250")).toHaveTextContent("AI Power Pack");
    expect(screen.getByTestId("pack-card-ocr_pack_100")).toHaveTextContent("OCR Document Pack");
    expect(screen.getByTestId("pack-card-scenarios_pack_100")).toHaveTextContent("Simulation Pack");
    expect(screen.getByTestId("pack-card-flex_bundle")).toHaveTextContent("All-in-One Flex Bundle");

    expect(screen.getByTestId("button-buy-ai_pack_250")).toBeInTheDocument();
    expect(screen.getByTestId("button-buy-ocr_pack_100")).toBeInTheDocument();
    expect(screen.getByTestId("button-buy-scenarios_pack_100")).toBeInTheDocument();
    expect(screen.getByTestId("button-buy-flex_bundle")).toBeInTheDocument();
  });

  it("opens confirmation dialog and purchases credit booster with toast notification", async () => {
    apiBilling.purchaseCreditPack.mockResolvedValueOnce({
      success: true,
      pack: {
        id: "ai_pack_250",
        name: "AI Power Pack",
        price_usd: 5,
        credits: { monthly_ai_calls: 250 },
      },
      period_key: "2026-11",
      purchase_id: "pack-12345",
    });

    renderWithClient(<Billing />);

    // Click Buy Pack on AI Power Pack
    fireEvent.click(screen.getByTestId("button-buy-ai_pack_250"));

    // Confirmation dialog appears
    const dialog = await screen.findByTestId("dialog-credit-pack-confirm");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Confirm AI Power Pack Purchase")).toBeInTheDocument();
    expect(screen.getByText("$5.00 USD")).toBeInTheDocument();

    // Cancel closes dialog
    fireEvent.click(screen.getByTestId("button-cancel-credit-pack"));
    await waitFor(() => {
      expect(screen.queryByTestId("dialog-credit-pack-confirm")).not.toBeInTheDocument();
    });

    // Re-open and confirm
    fireEvent.click(screen.getByTestId("button-buy-ai_pack_250"));
    const confirmBtn = await screen.findByTestId("button-confirm-credit-purchase");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiBilling.purchaseCreditPack).toHaveBeenCalledWith({
        pack_id: "ai_pack_250",
      });
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Credit Pack Activated",
          description: expect.stringContaining("AI Power Pack"),
        })
      );
    });
  });

  it("toggles between monthly and annual billing cycles, displaying discounted annual rates and passing annual cadence to checkout", async () => {
    apiBilling.createBillingCheckout.mockResolvedValueOnce({
      activated: true,
      plan: "pro",
    });

    renderWithClient(<Billing />);

    // Default is monthly billing
    expect(screen.getByTestId("price-pro")).toHaveTextContent("$19 / month");
    expect(screen.getByTestId("price-team")).toHaveTextContent("$49 / month");

    // Toggle to annual billing
    const annualBtn = screen.getByTestId("btn-billing-annual");
    fireEvent.click(annualBtn);

    // Check 20% discount rates
    expect(screen.getByTestId("badge-annual-savings")).toHaveTextContent("Save 20%");
    expect(screen.getByTestId("price-pro")).toHaveTextContent("$15 / month");
    expect(screen.getByTestId("price-pro")).toHaveTextContent("$180 billed annually (Save $48/yr)");
    expect(screen.getByTestId("price-team")).toHaveTextContent("$39 / month");
    expect(screen.getByTestId("price-team")).toHaveTextContent("$468 billed annually (Save $120/yr)");

    // Click Upgrade to Pro with annual selected
    fireEvent.click(screen.getByTestId("button-upgrade-pro"));

    await waitFor(() => {
      expect(apiBilling.createBillingCheckout).toHaveBeenCalledWith({
        plan_tier: "pro",
        billing_cycle: "annual",
      });
    });
  });

  it("renders organization invoices history and allows downloading official PDF tax receipts", async () => {
    apiBilling.getBillingInvoices.mockResolvedValueOnce({
      invoices: [
        {
          id: "inv-abc-123",
          invoice_number: "INV-2026-0089",
          plan_tier: "pro",
          billing_cycle: "annual",
          amount_usd: 180,
          tax_usd: 0,
          total_usd: 180,
          status: "paid",
          payment_method: "card_visa",
          period_start: "2026-11-01T00:00:00.000Z",
          period_end: "2027-11-01T00:00:00.000Z",
          issued_at: "2026-11-01T08:30:00.000Z",
        },
      ],
    });
    apiBilling.downloadInvoicePdf.mockResolvedValueOnce(undefined);

    renderWithClient(<Billing />);

    // Wait for invoice row to appear
    await waitFor(() => {
      expect(screen.getByTestId("table-billing-invoices")).toBeInTheDocument();
      expect(screen.getByText("INV-2026-0089")).toBeInTheDocument();
      expect(screen.getByTestId("badge-invoice-status-inv-abc-123")).toHaveTextContent("paid");
      expect(screen.getByText("$180.00")).toBeInTheDocument();
    });

    // Click Download PDF button
    const downloadBtn = screen.getByTestId("btn-download-invoice-inv-abc-123");
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(apiBilling.downloadInvoicePdf).toHaveBeenCalledWith("inv-abc-123", "INV-2026-0089");
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Invoice Downloaded",
          description: expect.stringContaining("INV-2026-0089"),
        })
      );
    });
  });

  it("handles empty invoices state and invoice download failures gracefully", async () => {
    apiBilling.getBillingInvoices.mockResolvedValueOnce({
      invoices: [
        {
          id: "inv-err-1",
          invoice_number: "INV-2026-9999",
          plan_tier: "team",
          billing_cycle: "monthly",
          amount_usd: 49,
          tax_usd: 0,
          total_usd: 49,
          status: "paid",
          payment_method: "stripe",
          period_start: "2026-11-01T00:00:00.000Z",
          period_end: "2026-12-01T00:00:00.000Z",
          issued_at: "2026-11-01T09:00:00.000Z",
        },
      ],
    });
    apiBilling.downloadInvoicePdf.mockRejectedValueOnce(new Error("Network stream aborted"));

    renderWithClient(<Billing />);

    await waitFor(() => {
      expect(screen.getByText("INV-2026-9999")).toBeInTheDocument();
    });

    const downloadBtn = screen.getByTestId("btn-download-invoice-inv-err-1");
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Download Failed",
          description: "Network stream aborted",
          variant: "destructive",
        })
      );
    });
  });

  it("renders dunning grace period alert banner when subscription payment is past due", async () => {
    mockConfig.entitlements.status = "past_due";
    apiBilling.getDunningStatus.mockResolvedValueOnce({
      dunning: {
        in_dunning: true,
        status: "active",
        grace_period_days_remaining: 5,
        current_attempt: 2,
        max_attempts: 3,
        next_retry_at: "2026-11-04T12:00:00.000Z",
        last_failure_reason: "card_declined",
        retry_history: [],
      },
    });

    renderWithClient(<Billing />);

    await waitFor(() => {
      expect(screen.getByTestId("alert-dunning-grace-period")).toBeInTheDocument();
      expect(screen.getByTestId("badge-grace-period-days")).toHaveTextContent("5 Days Left");
    });

    expect(screen.getByText("Subscription Payment Past Due — 7-Day Grace Period Active")).toBeInTheDocument();
    expect(screen.getByTestId("badge-dunning-next-retry")).toHaveTextContent("Attempt 2 of 3");
    expect(screen.getByTestId("btn-retry-payment-now")).toBeInTheDocument();
    expect(screen.getByTestId("btn-dunning-portal")).toBeInTheDocument();
  });

  it("executes payment retry recovery from dunning banner and updates subscription", async () => {
    mockConfig.entitlements.status = "past_due";
    apiBilling.getDunningStatus.mockResolvedValueOnce({
      dunning: {
        in_dunning: true,
        status: "active",
        grace_period_days_remaining: 4,
        current_attempt: 1,
        max_attempts: 3,
        next_retry_at: "2026-11-03T00:00:00.000Z",
        last_failure_reason: "insufficient_funds",
        retry_history: [],
      },
    });

    apiBilling.retryDunningPayment.mockResolvedValueOnce({
      success: true,
      recovered: true,
      invoice_number: "INV-REC-999",
      message: "Payment processed successfully. Pro subscription restored.",
    });

    renderWithClient(<Billing />);

    await waitFor(() => {
      expect(screen.getByTestId("btn-retry-payment-now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-retry-payment-now"));

    await waitFor(() => {
      expect(apiBilling.retryDunningPayment).toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Subscription Restored",
        })
      );
    });
  });

  it("renders multi-currency selector and passes selected currency to invoice query", async () => {
    renderWithClient(<Billing />);

    expect(screen.getByTestId("select-billing-currency")).toBeInTheDocument();
    expect(screen.getByText("Currency:")).toBeInTheDocument();
  });
});

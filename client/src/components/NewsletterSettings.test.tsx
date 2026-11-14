import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NewsletterSettings from "./NewsletterSettings";

const mockNewsletterApi = vi.hoisted(() => ({
  getNewsletterPreferences: vi.fn(),
  updateNewsletterPreferences: vi.fn(),
  previewNewsletter: vi.fn(),
  sendNewsletterNow: vi.fn(),
}));

vi.mock("@/lib/api/newsletter", () => ({
  ...mockNewsletterApi,
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const mockPreferences = {
  preference: {
    id: "pref-1",
    user_id: "usr-1",
    org_id: "org-1",
    is_subscribed: true,
    delivery_time: "07:00",
    timezone: "Asia/Kolkata",
    content_preferences: {
      spending_summary: true,
      budget_alerts: true,
      upcoming_bills: true,
      financial_tips: true,
      portfolio_news: true,
      weekly_health_score: true,
      actionable_recommendations: true,
    },
    last_sent_at: "2026-10-31T07:00:00.000Z",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-31T07:00:00.000Z",
  },
};

const mockPreviewResponse = {
  html: `<!DOCTYPE html><html><body><h1>FinWise Daily Newsletter</h1><div class="velocity-chart">7-Day Spending Velocity</div><div class="category-bars">Spending Distribution by Category</div></body></html>`,
  sections: {
    spendingSummary: {
      totalSpent: 300,
      totalIncome: 1200,
      dailyTrend: [{ date: "2026-11-01", day: "Sun", amount: 45 }],
    },
    healthScore: { score: 85, label: "Good" },
  },
};

describe("NewsletterSettings Component", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    mockNewsletterApi.getNewsletterPreferences.mockResolvedValue(mockPreferences);
    mockNewsletterApi.updateNewsletterPreferences.mockResolvedValue(mockPreferences);
    mockNewsletterApi.previewNewsletter.mockResolvedValue(mockPreviewResponse);
    mockNewsletterApi.sendNewsletterNow.mockResolvedValue({ message: "Newsletter sent" });

    // Mock window.open and URL.createObjectURL
    window.open = vi.fn();
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/test-preview");
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <NewsletterSettings />
      </QueryClientProvider>,
    );
  };

  it("renders newsletter preferences with subscription state, schedule, and content sections", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Daily Newsletter")).toBeInTheDocument();
      expect(
        screen.getByText("You are subscribed to the daily financial newsletter"),
      ).toBeInTheDocument();
      expect(screen.getByText("Delivery Schedule")).toBeInTheDocument();
      expect(screen.getByText("Newsletter Sections")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Daily newsletter subscription")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Delivery Time")).toHaveValue("07:00");
    expect(screen.getByText(/Last sent:/)).toBeInTheDocument();
  });

  it("modifies delivery time and saves preferences via update mutation", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText("Delivery Time")).toBeInTheDocument();
    });

    const timeInput = screen.getByLabelText("Delivery Time");
    fireEvent.change(timeInput, { target: { value: "08:15" } });

    const saveBtn = screen.getByRole("button", { name: "Save Preferences" });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockNewsletterApi.updateNewsletterPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryTime: "08:15",
          timezone: "Asia/Kolkata",
          isSubscribed: true,
        }),
      );
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Preferences saved",
        }),
      );
    });
  });

  it("generates preview and renders interactive in-app preview card with desktop/mobile view modes", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("btn-toggle-inapp-preview")).toBeInTheDocument();
    });

    // Click Live Email Preview button
    fireEvent.click(screen.getByTestId("btn-toggle-inapp-preview"));

    await waitFor(() => {
      expect(mockNewsletterApi.previewNewsletter).toHaveBeenCalled();
      expect(screen.getByTestId("card-newsletter-interactive-preview")).toBeInTheDocument();
      expect(screen.getByTestId("iframe-newsletter-preview")).toBeInTheDocument();
      expect(screen.getByText("Interactive Email Newsletter Preview")).toBeInTheDocument();
      expect(screen.getByText("Dynamic Charts Active")).toBeInTheDocument();
    });

    // Toggle Mobile mode
    fireEvent.click(screen.getByTestId("btn-preview-mode-mobile"));
    expect(screen.getByText("Mobile View (375px)")).toBeInTheDocument();

    // Toggle Desktop mode back
    fireEvent.click(screen.getByTestId("btn-preview-mode-desktop"));
    expect(screen.getByText("Desktop View (600px)")).toBeInTheDocument();

    // Toggle to Section Data tab
    fireEvent.click(screen.getByTestId("btn-preview-tab-data"));
    await waitFor(() => {
      expect(screen.getByTestId("container-preview-data")).toBeInTheDocument();
      expect(screen.getByText(/"totalSpent": 300/)).toBeInTheDocument();
    });

    // Close in-app preview
    fireEvent.click(screen.getByTestId("btn-close-inapp-preview"));
    expect(screen.queryByTestId("card-newsletter-interactive-preview")).not.toBeInTheDocument();
  });

  it("triggers immediate newsletter send via Send Now button", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Send Now/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Send Now/ }));

    await waitFor(() => {
      expect(mockNewsletterApi.sendNewsletterNow).toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Newsletter sent",
        }),
      );
    });
  });
});

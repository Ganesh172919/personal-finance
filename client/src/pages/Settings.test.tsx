import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Settings from "./Settings";

const mockAuth = vi.hoisted(() => ({
  user: {
    id: "user-1",
    name: "Alex Dev",
    email: "alex@finwise.test",
    phoneNumber: "+15551234567",
    authProvider: "email",
    isEmailVerified: true,
  },
  checkAuthStatus: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockAuth.user,
    checkAuthStatus: mockAuth.checkAuthStatus,
  }),
}));

const mockConfig = vi.hoisted(() => ({
  useAppConfig: vi.fn(),
}));

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => mockConfig.useAppConfig(),
}));

const mockToast = vi.hoisted(() => ({
  toast: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mockToast.toast }),
}));

const mockSettingsApi = vi.hoisted(() => ({
  setup2FA: vi.fn(),
  verify2FA: vi.fn(),
  disable2FA: vi.fn(),
  get2FAStatus: vi.fn(),
  changePassword: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/lib/api/settings", () => ({
  ...mockSettingsApi,
}));

const mockApiKeysApi = vi.hoisted(() => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

vi.mock("@/lib/api/v1/apiKeys", () => ({
  ...mockApiKeysApi,
}));

const mockApiClient = vi.hoisted(() => ({
  apiClient: vi.fn(),
}));

vi.mock("@/lib/api/core", () => ({
  apiClient: mockApiClient.apiClient,
}));

vi.mock("@/components/NewsletterSettings", () => ({
  default: () => <div data-testid="newsletter-settings-stub">Newsletter Settings Mock</div>,
}));

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle-btn">Toggle Theme</button>,
}));

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Settings />
    </QueryClientProvider>
  );
}

describe("Settings Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig.useAppConfig.mockReturnValue({
      data: {
        org: {
          id: "org-42",
          name: "Acme Corp",
          currency: "USD",
          locale: "en-US",
          timezone: "UTC",
        },
        entitlements: {
          plan: "pro",
        },
      },
      refetch: vi.fn(),
    });

    mockSettingsApi.get2FAStatus.mockResolvedValue({ enabled: false });
    mockSettingsApi.updateProfile.mockResolvedValue({ success: true });
    mockSettingsApi.changePassword.mockResolvedValue({ success: true });
    mockSettingsApi.setup2FA.mockResolvedValue({ secret: "TEST2FASECRET", uri: "otpauth://totp/FinWise" });

    mockApiKeysApi.listApiKeys.mockResolvedValue({
      api_keys: [
        {
          id: "key-1",
          name: "Dev Integration",
          prefix: "fw_live_dev1",
          scopes: ["read", "write"],
          last_used_at: "2026-10-28T12:00:00Z",
          revoked_at: null,
        },
      ],
    });
    mockApiKeysApi.createApiKey.mockResolvedValue({
      id: "key-2",
      api_key: "fw_sec_live_abcdef123456",
      name: "CLI Token",
    });

    mockApiClient.apiClient.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders page header and user summary stats", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("settings-page")).toBeInTheDocument();
    });

    expect(screen.getByText("Signed in as")).toBeInTheDocument();
    expect(screen.getByText("alex@finwise.test")).toBeInTheDocument();
    expect(screen.getByText("pro")).toBeInTheDocument();
  });

  it("navigates across all tabs deterministically", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("tab-profile")).toBeInTheDocument();
    });

    // Security Tab
    fireEvent.click(screen.getByTestId("tab-security"));
    await waitFor(() => {
      expect(screen.getByTestId("current-password-input")).toBeInTheDocument();
      expect(screen.getByTestId("enable-2fa-btn")).toBeInTheDocument();
    });

    // API Keys Tab
    fireEvent.click(screen.getByTestId("tab-api-keys"));
    await waitFor(() => {
      expect(screen.getByTestId("api-key-name-input")).toBeInTheDocument();
      expect(screen.getByText("Dev Integration")).toBeInTheDocument();
    });

    // Preferences Tab
    fireEvent.click(screen.getByTestId("tab-preferences"));
    await waitFor(() => {
      expect(screen.getByTestId("currency-select")).toBeInTheDocument();
      expect(screen.getByTestId("locale-select")).toBeInTheDocument();
      expect(screen.getByTestId("timezone-select")).toBeInTheDocument();
    });

    // Newsletter Tab
    fireEvent.click(screen.getByTestId("tab-newsletter"));
    await waitFor(() => {
      expect(screen.getByTestId("newsletter-settings-stub")).toBeInTheDocument();
    });
  });

  it("edits and updates profile information", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("edit-profile-btn")).toBeInTheDocument();
    });

    // Enable editing
    fireEvent.click(screen.getByTestId("edit-profile-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("save-profile-btn")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("profile-name-input"), { target: { value: "Alex Senior Dev" } });
    fireEvent.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() => {
      expect(mockSettingsApi.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Alex Senior Dev",
        })
      );
      expect(mockToast.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Profile updated",
        })
      );
    });
  });

  it("changes account password when valid inputs are provided", async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId("tab-security"));
    await waitFor(() => {
      expect(screen.getByTestId("current-password-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("current-password-input"), { target: { value: "OldPassword123!" } });
    fireEvent.change(screen.getByTestId("new-password-input"), { target: { value: "NewSecurePassword456!" } });
    fireEvent.change(screen.getByTestId("confirm-password-input"), { target: { value: "NewSecurePassword456!" } });

    fireEvent.click(screen.getByTestId("change-password-btn"));

    await waitFor(() => {
      expect(mockSettingsApi.changePassword).toHaveBeenCalledWith({
        currentPassword: "OldPassword123!",
        newPassword: "NewSecurePassword456!",
      });
      expect(mockToast.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Password changed",
        })
      );
    });
  });

  it("creates a new API key and updates cache", async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId("tab-api-keys"));
    await waitFor(() => {
      expect(screen.getByTestId("api-key-name-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("api-key-name-input"), { target: { value: "Staging Pipeline" } });
    fireEvent.click(screen.getByTestId("create-api-key-btn"));

    await waitFor(() => {
      expect(mockApiKeysApi.createApiKey).toHaveBeenCalledWith({
        name: "Staging Pipeline",
        scopes: ["read", "write"],
      });
      expect(screen.getByText("fw_sec_live_abcdef123456")).toBeInTheDocument();
    });
  });

  it("saves preferences changes to currency, locale, and timezone", async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId("tab-preferences"));
    await waitFor(() => {
      expect(screen.getByTestId("currency-select")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("currency-select"), { target: { value: "INR" } });
    fireEvent.change(screen.getByTestId("locale-select"), { target: { value: "en-IN" } });
    fireEvent.change(screen.getByTestId("timezone-select"), { target: { value: "Asia/Kolkata" } });

    fireEvent.click(screen.getByTestId("save-preferences-btn"));

    await waitFor(() => {
      expect(mockApiClient.apiClient).toHaveBeenCalledWith(
        "/orgs/org-42/settings",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata" }),
        })
      );
      expect(mockToast.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Preferences saved",
        })
      );
    });
  });
});

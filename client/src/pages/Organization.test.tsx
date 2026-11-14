import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Organization from "./Organization";

const mockApi = vi.hoisted(() => ({
  getMyOrgs: vi.fn(),
  listApiKeys: vi.fn(),
  getUsageLedger: vi.fn(),
  listIntegrations: vi.fn(),
  listMarketplaceCatalog: vi.fn(),
  getMyReferral: vi.fn(),
  createOrg: vi.fn(),
  addOrgMember: vi.fn(),
  updateOrgSettings: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  syncIntegration: vi.fn(),
  installMarketplacePlugin: vi.fn(),
  uninstallInstalledPlugin: vi.fn(),
  updateInstalledPluginVersion: vi.fn(),
  redeemReferral: vi.fn(),
  getIntegrationHistory: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...mockApi,
}));

const mockConfig = vi.hoisted(() => ({
  useAppConfig: vi.fn(),
}));

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => mockConfig.useAppConfig(),
}));

const mockOrgContext = vi.hoisted(() => ({
  getActiveOrgId: vi.fn(() => "org-1"),
  setActiveOrgId: vi.fn(),
}));

vi.mock("@/lib/orgContext", () => ({
  getActiveOrgId: () => mockOrgContext.getActiveOrgId(),
  setActiveOrgId: (id: string) => mockOrgContext.setActiveOrgId(id),
}));

const sampleOrgs = {
  active_org: { id: "org-1", name: "FinTech Prime", slug: "fintech-prime", type: "team", role: "owner" },
  orgs: [
    {
      id: "org-1",
      name: "FinTech Prime",
      slug: "fintech-prime",
      type: "team",
      currency: "USD",
      locale: "en-US",
      timezone: "UTC",
      role: "owner",
      is_default: true,
    },
    {
      id: "org-2",
      name: "Personal Wealth",
      slug: "personal-wealth",
      type: "personal",
      currency: "EUR",
      locale: "de-DE",
      timezone: "Europe/Berlin",
      role: "member",
      is_default: false,
    },
  ],
};

const sampleApiKeys = {
  api_keys: [
    {
      id: "key-1",
      name: "Prod Worker",
      prefix: "fw_live_abc123",
      scopes: ["usage:read", "transactions:read"],
      last_used_at: "2026-10-29T10:00:00Z",
      revoked_at: null,
    },
  ],
};

const sampleUsage = {
  plan: "Enterprise",
  status: "active",
  period_key: "2026-10",
  usage: { monthly_ai_calls: 145 },
  limits: { monthly_ai_calls: 1000 },
  ledger: [
    {
      feature: "LangGraph Multi-Agent Planner",
      units: 145,
      tokens_in: 55000,
      tokens_out: 12000,
      cost_usd: 0.85,
    },
  ],
};

const sampleReferral = {
  referral_code: "FINWISE-PRIME-2026",
  share_url: "https://finwise.local/join?ref=FINWISE-PRIME-2026",
  redemptions_count: 5,
  reward: {
    units: {
      monthly_ai_calls: 100,
      workflow_runs: 25,
      api_requests: 2000,
    },
  },
};

const sampleIntegrations = {
  connectors: [
    {
      connector_key: "mock_bank",
      name: "Mock Open Banking",
      category: "banking",
      status: "connected",
      last_sync_at: "2026-10-29T12:00:00Z",
    },
  ],
};

const sampleCatalog = {
  plugins: [
    {
      plugin_key: "tax-estimator",
      name: "Tax Estimator 2026",
      description: "Automated bracket estimations",
      publisher: "FinWise Official",
      latest_version: "2.1.0",
      status: "active",
      pricing_model: "free",
      installed: false,
    },
  ],
};

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Organization />
    </QueryClientProvider>
  );
}

describe("Organization Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig.useAppConfig.mockReturnValue({
      data: {
        org: {
          id: "org-1",
          name: "FinTech Prime",
          role: "owner",
          currency: "USD",
          locale: "en-US",
          timezone: "UTC",
        },
      },
      refetch: vi.fn(),
    });

    mockApi.getMyOrgs.mockResolvedValue(sampleOrgs);
    mockApi.listApiKeys.mockResolvedValue(sampleApiKeys);
    mockApi.getUsageLedger.mockResolvedValue(sampleUsage);
    mockApi.getMyReferral.mockResolvedValue(sampleReferral);
    mockApi.listIntegrations.mockResolvedValue(sampleIntegrations);
    mockApi.listMarketplaceCatalog.mockResolvedValue(sampleCatalog);
    mockApi.updateOrgSettings.mockResolvedValue({ success: true });
    mockApi.addOrgMember.mockResolvedValue({ member: { id: "m-1", email: "new@example.com", role: "admin" } });
    mockApi.createApiKey.mockResolvedValue({ id: "key-2", api_key: "fw_sec_secret_key_999", name: "Test Key" });
    mockApi.redeemReferral.mockResolvedValue({ applied: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders tenant context and active organization header", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("organization-page")).toBeInTheDocument();
      expect(screen.getByText(/Active org: FinTech Prime/)).toBeInTheDocument();
      expect(screen.getByTestId("active-org-select")).toBeInTheDocument();
    });
  });

  it("navigates between organization tabs deterministically", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("tab-members")).toBeInTheDocument();
    });

    // Check Settings Tab
    fireEvent.click(screen.getByTestId("tab-settings"));
    await waitFor(() => {
      expect(screen.getByTestId("settings-currency-input")).toBeInTheDocument();
      expect(screen.getByTestId("settings-locale-input")).toBeInTheDocument();
      expect(screen.getByTestId("settings-timezone-input")).toBeInTheDocument();
    });

    // Check API Keys Tab
    fireEvent.click(screen.getByTestId("tab-api-keys"));
    await waitFor(() => {
      expect(screen.getByTestId("create-apikey-trigger")).toBeInTheDocument();
      expect(screen.getByText("Prod Worker")).toBeInTheDocument();
    });

    // Check Referrals Tab
    fireEvent.click(screen.getByTestId("tab-referrals"));
    await waitFor(() => {
      expect(screen.getByTestId("referral-code-input")).toBeInTheDocument();
      expect(screen.getByDisplayValue("FINWISE-PRIME-2026")).toBeInTheDocument();
    });

    // Check Usage Tab
    fireEvent.click(screen.getByTestId("tab-usage"));
    await waitFor(() => {
      expect(screen.getByTestId("usage-plan")).toHaveTextContent("Enterprise");
      expect(screen.getByTestId("usage-ai-calls")).toHaveTextContent("145 / 1000");
    });
  });

  it("updates organization settings when form is submitted", async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId("tab-settings"));
    await waitFor(() => {
      expect(screen.getByTestId("settings-currency-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("settings-currency-input"), { target: { value: "EUR" } });
    fireEvent.change(screen.getByTestId("settings-locale-input"), { target: { value: "de-DE" } });
    fireEvent.change(screen.getByTestId("settings-timezone-input"), { target: { value: "Europe/Berlin" } });

    fireEvent.click(screen.getByTestId("save-settings-btn"));

    await waitFor(() => {
      expect(mockApi.updateOrgSettings).toHaveBeenCalledWith("org-1", {
        currency: "EUR",
        locale: "de-DE",
        timezone: "Europe/Berlin",
      });
    });
  });

  it("adds a member when email is provided", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("add-member-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("add-member-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("member-email-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("member-email-input"), { target: { value: "engineer@finwise.test" } });
    fireEvent.click(screen.getByTestId("add-member-submit"));

    await waitFor(() => {
      expect(mockApi.addOrgMember).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({
          email: "engineer@finwise.test",
        })
      );
    });
  });

  it("creates an API key with specified name and scopes", async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId("tab-api-keys"));
    await waitFor(() => {
      expect(screen.getByTestId("create-apikey-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("create-apikey-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("apikey-name-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("apikey-name-input"), { target: { value: "Automated QA Bot" } });
    fireEvent.click(screen.getByTestId("apikey-create-submit"));

    await waitFor(() => {
      expect(mockApi.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Automated QA Bot",
        })
      );
      expect(screen.getByTestId("created-apikey-secret")).toHaveValue("fw_sec_secret_key_999");
    });
  });

  it("redeems a referral code successfully", async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId("tab-referrals"));
    await waitFor(() => {
      expect(screen.getByTestId("redeem-code-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("redeem-code-input"), { target: { value: "REF-BONUS-50" } });
    fireEvent.click(screen.getByTestId("redeem-code-btn"));

    await waitFor(() => {
      expect(mockApi.redeemReferral).toHaveBeenCalledWith({
        code: "REF-BONUS-50",
      });
    });
  });
});

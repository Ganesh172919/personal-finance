import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptOrgInvite: vi.fn(),
  useAuth: vi.fn(),
  toast: vi.fn(),
  setActiveOrgId: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/orgContext", () => ({ setActiveOrgId: mocks.setActiveOrgId }));
vi.mock("@/lib/apiClient", () => {
  class ApiError extends Error {
    code?: string;
    requestId?: string;
  }
  return { ApiError, acceptOrgInvite: mocks.acceptOrgInvite };
});

import AcceptInvite from "./AcceptInvite";

const renderAt = (path: string) => {
  const { hook, searchHook } = memoryLocation({ path });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <Router hook={hook} searchHook={searchHook}>
          <AcceptInvite />
        </Router>
      </QueryClientProvider>
    </StrictMode>
  );
};

describe("AcceptInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the invite token from the query string and accepts it for a signed-in user", async () => {
    mocks.useAuth.mockReturnValue({ user: { id: "u1", email: "invitee@example.com" }, loading: false });
    mocks.acceptOrgInvite.mockResolvedValue({ invite: { org_id: "org-1" } });

    renderAt("/accept-invite?token=tok_abc123");

    await waitFor(() => {
      expect(mocks.acceptOrgInvite).toHaveBeenCalledWith("tok_abc123");
    });
    expect(screen.queryByText(/Missing invite token/i)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.setActiveOrgId).toHaveBeenCalledWith("org-1"));
    expect(await screen.findByText(/Invite accepted\. Your tenant context/i)).toBeInTheDocument();
    // Single-use token must be submitted exactly once, even under StrictMode double effects.
    expect(mocks.acceptOrgInvite).toHaveBeenCalledTimes(1);
  });

  it("shows sign-in options (not 'missing token') for a signed-out user with a token", async () => {
    mocks.useAuth.mockReturnValue({ user: null, loading: false });

    renderAt("/accept-invite?token=tok_abc123");

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText(/Missing invite token/i)).not.toBeInTheDocument();
    expect(mocks.acceptOrgInvite).not.toHaveBeenCalled();
  });

  it("shows the missing-token message when no token is present", () => {
    mocks.useAuth.mockReturnValue({ user: null, loading: false });
    renderAt("/accept-invite");
    expect(screen.getByText(/Missing invite token/i)).toBeInTheDocument();
  });
});

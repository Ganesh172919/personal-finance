import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { useEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { getActiveOrgId, setActiveOrgId } from "@/lib/orgContext";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
});
afterAll(() => server.close());

// Helper wrapper that provides all required context
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

// Consumer component to expose auth state in tests
function AuthConsumer() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not authenticated</div>;
  return (
    <div>
      <span data-testid="user-name">{user.name}</span>
      <span data-testid="user-email">{user.email}</span>
      <button onClick={logout} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
}

let authActions: ReturnType<typeof useAuth>;
function AuthProbe() {
  const auth = useAuth();
  useEffect(() => { authActions = auth; }, [auth]);
  return <p>{auth.user?.name || "Signed out"}</p>;
}

describe("useAuth", () => {
  it("shows loading state initially, then displays user profile", async () => {
    render(
      <TestWrapper>
        <AuthConsumer />
      </TestWrapper>,
    );

    // Should start in loading state
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Should resolve to authenticated user from MSW handler
    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("Test User");
    });
    expect(screen.getByTestId("user-email")).toHaveTextContent("test@finwise.dev");
  });

  it("shows unauthenticated state when API returns 401", async () => {
    server.use(
      http.get("/api/auth/profile", () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    render(
      <TestWrapper>
        <AuthConsumer />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("Not authenticated")).toBeInTheDocument();
    });
  });

  it("clears user state on logout", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <AuthConsumer />
      </TestWrapper>,
    );

    // Wait for user to load
    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toBeInTheDocument();
    });

    // Click logout
    await user.click(screen.getByTestId("logout-btn"));

    // Should show unauthenticated state
    await waitFor(() => {
      expect(screen.getByText("Not authenticated")).toBeInTheDocument();
    });
  });

  it("throws when used outside AuthProvider", () => {
    // Suppress console.error from React error boundary
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<AuthConsumer />);
    }).toThrow("useAuth must be used within an AuthProvider");

    spy.mockRestore();
  });

  it("does not restore an account from a profile request that finishes after logout", async () => {
    render(<TestWrapper><AuthProbe /></TestWrapper>);
    await screen.findByText("Test User");
    setActiveOrgId("private-org-a");
    let finish!: () => void;
    const pendingProfile = new Promise<void>(resolve => { finish = resolve; });
    server.use(http.get("/api/auth/profile", async () => {
      await pendingProfile;
      return HttpResponse.json({ id: "old-a", name: "Late account A", email: "a@example.test" });
    }));
    let check!: Promise<void>;
    act(() => { check = authActions.checkAuthStatus(); });
    await act(async () => { await authActions.logout(); });
    await act(async () => { finish(); await check; });
    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(getActiveOrgId()).toBeNull();
    expect(localStorage.getItem("userId")).toBeNull();
  });

  it("keeps the newest profile and clears the previous account's organization", async () => {
    render(<TestWrapper><AuthProbe /></TestWrapper>);
    await screen.findByText("Test User");
    setActiveOrgId("private-org-a");
    let finish!: () => void;
    let oldStarted = false;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    server.use(http.get("/api/auth/profile", async () => {
      oldStarted = true; await pending;
      return HttpResponse.json({ id: "old-a", name: "Late account A", email: "a@example.test" });
    }));
    let oldCheck!: Promise<void>;
    act(() => { oldCheck = authActions.checkAuthStatus(); });
    await waitFor(() => expect(oldStarted).toBe(true));
    server.use(http.get("/api/auth/profile", () => HttpResponse.json({
      id: "new-b", name: "Account B", email: "b@example.test",
    })));
    await act(async () => { await authActions.checkAuthStatus(); });
    await act(async () => { finish(); await oldCheck; });
    expect(screen.getByText("Account B")).toBeInTheDocument();
    expect(getActiveOrgId()).toBeNull();
    expect(localStorage.getItem("userId")).toBe("new-b");
  });
});

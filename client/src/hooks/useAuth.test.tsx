import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
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
      http.get("/api/v1/auth/profile", () => {
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
});

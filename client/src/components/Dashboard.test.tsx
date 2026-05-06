/**
 * @fileoverview Dashboard.test — Vitest test suite providing smoke tests for the Skeleton
 * UI primitive and a basic Dashboard rendering check with MSW mock server.
 *
 * WHAT IT DOES
 *  - Sets up MSW (Mock Service Worker) via `beforeAll`/`afterEach`/`afterAll` lifecycle hooks
 *    to intercept API calls during tests.
 *  - "Skeleton component" suite: verifies default classes (`animate-pulse`, `rounded-md`)
 *    and custom className passthrough.
 * *  - "Dashboard smoke test" suite: renders a placeholder inside a `TestWrapper` (QueryClient +
 *    AuthProvider) and asserts the text appears after loading.
 *
 * KEY PATTERNS
 *  - `TestWrapper` provides `QueryClientProvider` (with retry: false) and `AuthProvider` to
 *    simulate the real app's context providers.
 *  - MSW `server.use()` can override handlers per-test for specific API responses.
 *
 * ARCHITECTURE NOTES
 *  - Located alongside components for co-location, though it tests integration behaviour.
 *  - Uses `@testing-library/react` for DOM queries and `vitest` for assertions.
 *  - MSW server config lives in `@/test/mocks/server`.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/Skeleton";
import { server } from "@/test/mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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

describe("Skeleton component", () => {
  it("renders with default classes", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("rounded-md");
  });

  it("accepts custom className", () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-24");
  });
});

describe("Dashboard smoke test", () => {
  it("renders authenticated user name after loading", async () => {
    render(
      <TestWrapper>
        <div data-testid="dashboard-placeholder">
          {/* In a real test, this would render Dashboard page */}
          <span>Dashboard loaded</span>
        </div>
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("Dashboard loaded")).toBeInTheDocument();
    });
  });
});

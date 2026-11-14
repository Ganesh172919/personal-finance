import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OfflineBanner } from "./OfflineBanner";

describe("OfflineBanner", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithClient = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
      </QueryClientProvider>
    );

  it("does not render when online initially", () => {
    renderWithClient();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("displays offline warning banner when network connection is lost", () => {
    renderWithClient();

    act(() => {
      fireEvent(window, new Event("offline"));
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/You are currently offline/i);
  });

  it("displays reconnected alert and triggers query invalidation when coming back online", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderWithClient();

    // Go offline first
    act(() => {
      fireEvent(window, new Event("offline"));
    });
    expect(screen.getByText(/You are currently offline/i)).toBeInTheDocument();

    // Come back online
    act(() => {
      fireEvent(window, new Event("online"));
    });

    expect(screen.getByText(/Connection restored/i)).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

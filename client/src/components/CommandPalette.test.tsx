import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";
import { useCommandBarStore } from "@/stores/commandBarStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

// cmdk relies on browser APIs jsdom does not implement.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const navigateMock = vi.fn();
vi.mock("wouter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => ["/dashboard", navigateMock],
}));

const configMock = vi.hoisted(() => ({ features: { tasks_enabled: true, journal_enabled: false, receipts_ocr_enabled: true } }));
vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({ data: { features: configMock.features } }),
}));

function Harness() {
  useKeyboardShortcuts();
  return <CommandPalette />;
}

describe("CommandPalette", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useCommandBarStore.setState({ isOpen: false, history: [] });
  });
  afterEach(cleanup);

  it("opens on Ctrl+K and navigates to the selected page", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    // Feature-flagged pages that are disabled are not offered.
    expect(screen.queryByText("Note Taking")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Workflows"));
    expect(navigateMock).toHaveBeenCalledWith("/workflows");
    expect(useCommandBarStore.getState().isOpen).toBe(false);
  });

  it("filters pages by the typed query and offers asking the AI", () => {
    useCommandBarStore.setState({ isOpen: true });
    render(<CommandPalette />);

    fireEvent.change(screen.getByLabelText("Command palette search"), { target: { value: "export" } });
    expect(screen.getByText("Exports")).toBeInTheDocument();
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Ask FinWise AI/));
    expect(navigateMock).toHaveBeenCalledWith("/chat");
    expect(useCommandBarStore.getState().history).toEqual(["export"]);
  });
});

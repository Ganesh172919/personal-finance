import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

const initialWidth = window.innerWidth;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: initialWidth });
});

describe("responsive navigation breakpoint", () => {
  it("keeps tablet navigation available until the desktop sidebar is visible", () => {
    let change = () => {};
    const remove = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      addEventListener: (_event: string, callback: () => void) => { change = callback; },
      removeEventListener: remove,
    })));
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
    const { result, unmount } = renderHook(() => useIsMobile(1024));
    expect(result.current).toBe(true);
    for (const [width, expected] of [[1023, true], [1024, false], [390, true]] as const) {
      act(() => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
        change();
      });
      expect(result.current).toBe(expected);
    }
    unmount();
    expect(remove).toHaveBeenCalledWith("change", change);
  });

  it("keeps the default phone breakpoint for existing consumers", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});

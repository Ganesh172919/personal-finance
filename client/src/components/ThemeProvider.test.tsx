import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTheme } from "@/context/themeContext";
import { ThemeProvider } from "./ThemeProvider";

function ThemeControl() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.style.colorScheme = "";
});

it("applies and switches the theme if the browser blocks storage", () => {
  const storageError = new DOMException("Storage is disabled", "SecurityError");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw storageError; });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw storageError; });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));

  render(<ThemeProvider><ThemeControl /></ThemeProvider>);
  expect(document.documentElement).toHaveClass("dark");
  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  expect(document.documentElement).toHaveClass("light");
  expect(document.documentElement.style.colorScheme).toBe("light");
});

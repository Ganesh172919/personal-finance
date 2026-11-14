/**
 * @fileoverview ThemeProvider — React context provider for dark/light theme management
 * with localStorage persistence and system-preference detection.
 *
 * WHAT IT DOES
 *  - On mount, reads the stored theme from `localStorage("finwise-theme")`, falling back
 *    to `prefers-color-scheme: dark` media query, defaulting to "light".
 *  - Applies the theme by adding/removing the `dark`/`light` class on `document.documentElement`
 *    and setting `style.colorScheme` for native form element styling.
 *  - Persists the chosen theme to localStorage on every change.
 *  - Exports `useTheme()` hook which returns `{ theme, setTheme, toggleTheme }`.
 *
 * KEY PROPS & DATA FLOW
 *  - `children` (ReactNode) — the component tree to wrap.
 *  - Context value: `{ theme, setTheme, toggleTheme }`.
 *
 * ARCHITECTURE NOTES
 *  - Mounted once at the app root (typically in App.tsx or main.tsx).
 *  - Consumed by `ThemeToggle` and any component that needs to adapt to theme changes.
 *  - Storage key "finwise-theme" is namespaced to avoid collisions with other apps.
 */
import { createContext, useContext, useEffect, useState } from "react";

// Defines the supported color theme options for the application.
// Restricted to dark and light modes for consistent styling across components.
// Used by theme state, local storage persistence, and root element classes.
type Theme = "dark" | "light";

// Context shape exposing current theme state and modifier functions.
// Provides active theme mode alongside programmatic setter and toggle helper.
// Consumed by downstream components and custom hooks requiring theme access.
type ThemeProviderContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

// React context instance holding theme state and toggle handlers.
// Initialized to undefined to enforce provider wrapping across consumers.
// Powers the custom useTheme hook for application-wide theme consumption.
const ThemeProviderContext = createContext<
  ThemeProviderContextType | undefined
>(undefined);

// LocalStorage key used to persist user theme preferences across sessions.
// Namespaced specifically for FinWise to avoid collisions with other apps.
// Checked on initial load before falling back to system color scheme preferences.
const THEME_STORAGE_KEY = "finwise-theme";

// Reads and validates the persisted theme selection from window localStorage.
// Falls back to checking system prefers-color-scheme media query if unset.
// Defaults safely to light mode in server-side or non-window environments.
const readStoredTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

// Context provider managing active application theme and DOM class synchronization.
// Updates documentElement classes and native colorScheme styling on state changes.
// Persists selections to localStorage and exposes controls via ThemeProviderContext.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeProviderContext.Provider
      value={{ theme, setTheme, toggleTheme }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
}

// Custom hook to access theme context state and control functions.
// Throws a descriptive error if called outside of a ThemeProvider tree.
// Returns current theme, direct setter function, and toggle action.
export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

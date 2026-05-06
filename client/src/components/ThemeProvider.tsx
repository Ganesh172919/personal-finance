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

type Theme = "dark" | "light";

type ThemeProviderContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeProviderContext = createContext<
  ThemeProviderContextType | undefined
>(undefined);

const THEME_STORAGE_KEY = "finwise-theme";

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

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

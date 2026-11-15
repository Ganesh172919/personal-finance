import { createContext, useContext, type Context } from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const hotData = import.meta.hot?.data;
export const ThemeContext: Context<ThemeContextValue | undefined> =
  hotData?.themeContext ?? createContext<ThemeContextValue | undefined>(undefined);

if (hotData) hotData.themeContext = ThemeContext;

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

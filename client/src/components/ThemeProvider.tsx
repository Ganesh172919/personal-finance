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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add("dark");
    setTheme("dark");
    localStorage.setItem("finwise-theme", "dark");
  }, []);

  const handleSetTheme = (newTheme: Theme) => {
    const root = window.document.documentElement;
    const resolvedTheme: Theme = newTheme === "light" ? "dark" : newTheme;

    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);

    setTheme(resolvedTheme);
    localStorage.setItem("finwise-theme", resolvedTheme);
  };

  const toggleTheme = () => {
    handleSetTheme("dark");
  };

  return (
    <ThemeProviderContext.Provider
      value={{ theme, setTheme: handleSetTheme, toggleTheme }}
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

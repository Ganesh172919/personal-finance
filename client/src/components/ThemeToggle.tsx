/**
 * @fileoverview ThemeToggle — pill-shaped toggle button that switches between light and
 * dark themes using the ThemeProvider context.
 *
 * WHAT IT DOES
 *  - Renders two side-by-side buttons (Sun icon for light, Moon icon for dark) inside a
 *    rounded container with `bg-background/80 backdrop-blur` for a frosted-glass effect.
 *  - The active theme button gets `bg-primary text-primary-foreground`; inactive gets
 *    `text-muted-foreground` with hover state.
 *  - In `compact` mode, the label text is hidden and the container height shrinks to 40px.
 *
 * KEY PROPS & DATA FLOW
 *  - `className` (string, optional) — additional classes for positioning.
 *  - `compact` (boolean) — hides labels and reduces height for sidebar/header use.
 *  - Reads and sets theme via `useTheme()` from ThemeProvider.
 *
 * ARCHITECTURE NOTES
 *  - Placed in the Sidebar's BrandBlock header and potentially in the mobile drawer.
 *  - Uses `aria-pressed` for accessibility to indicate the currently active theme.
 *  - Pure presentational; all theme logic lives in ThemeProvider.
 */
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/80 p-1 shadow-sm backdrop-blur",
        compact ? "h-10" : "h-11",
        className
      )}
      aria-label="Theme selector"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors",
          theme === "light" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        aria-pressed={theme === "light"}
      >
        <Sun className="h-3.5 w-3.5" />
        {!compact ? <span>Light</span> : null}
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors",
          theme === "dark" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        aria-pressed={theme === "dark"}
      >
        <Moon className="h-3.5 w-3.5" />
        {!compact ? <span>Black</span> : null}
      </button>
    </div>
  );
}

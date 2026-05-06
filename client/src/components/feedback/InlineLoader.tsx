/**
 * @fileoverview InlineLoader — compact loading indicator for use inside cards, sections,
 * or list areas where a full-screen loader would be too heavy.
 *
 * WHAT IT DOES
 *  - Renders a small spinning circle (border-2 with primary accent) alongside a label.
 *  - Centred horizontally with `py-10` vertical padding to visually separate from
 *    surrounding content.
 *
 * KEY PROPS & DATA FLOW
 *  - `label` (string, default "Loading...") — text shown next to the spinner.
 *  - `className` (string, optional) — additional classes for the container.
 *
 * ARCHITECTURE NOTES
 *  - Used as a loading placeholder in data-fetching cards (e.g. while tasks or insights load).
 *  - Pure presentational — no hooks, no state, no API calls.
 *  - Lighter-weight alternative to FullScreenLoader; intended for section-level loading states.
 */
type InlineLoaderProps = {
  label?: string;
  className?: string;
};

export function InlineLoader({
  label = "Loading...",
  className = "",
}: InlineLoaderProps) {
  return (
    <div className={`flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground ${className}`}>
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      <span>{label}</span>
    </div>
  );
}

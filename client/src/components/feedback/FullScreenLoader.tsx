/**
 * @fileoverview FullScreenLoader — full-viewport loading screen shown during initial app
 * bootstrap, authentication checks, or route-level code-splitting suspense.
 *
 * WHAT IT DOES
 *  - Renders a centred spinner (animated ring with a pulsing dot) alongside a configurable
 *    label and description text.
 *  - Uses `min-h-screen` to fill the viewport and `bg-background` to match the current theme.
 *
 * KEY PROPS & DATA FLOW
 *  - `label` (string, default "Loading Personal Finance...") — primary loading message.
 *  - `description` (string, default "Preparing your workspace.") — secondary helper text.
 *
 * ARCHITECTURE NOTES
 *  - Used as a Suspense fallback in route definitions and as a bootstrap loading state.
 *  - Self-contained — no hooks, no context, no API calls. Pure presentational.
 *  - The spinner uses CSS `animate-spin` on a transparent-top border circle for a smooth
 *    rotation effect without external animation libraries.
 */
type FullScreenLoaderProps = {
  label?: string;
  description?: string;
};

export function FullScreenLoader({
  label = "Loading Personal Finance...",
  description = "Preparing your workspace.",
}: FullScreenLoaderProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
          <div className="h-4 w-4 rounded-full bg-primary/80" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

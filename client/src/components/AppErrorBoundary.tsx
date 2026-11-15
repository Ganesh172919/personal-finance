import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { createErrorDiagnostic, errorReporting, type ErrorDiagnostic } from "@/services/errorReporting";

interface RecoveryState {
  crashed: boolean;
  diagnostic: ErrorDiagnostic | null;
  reference: string | null;
  copyStatus: string;
}

const descriptions: Record<ErrorDiagnostic["category"], string> = {
  "auth-context": "Sign-in could not initialize. Reload to reconnect your session.",
  "theme-context": "The theme could not initialize. Reload to restore your workspace.",
  "asset-load": "Part of FinWise could not load. Reload to fetch the current version.",
  unexpected: "Reload this page to try again, or return to your dashboard.",
};

export class AppErrorBoundary extends Component<{ children: ReactNode }, RecoveryState> {
  state: RecoveryState = { crashed: false, diagnostic: null, reference: null, copyStatus: "" };

  static getDerivedStateFromError(): Partial<RecoveryState> {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const diagnostic = createErrorDiagnostic(error, "render", info.componentStack ?? undefined);
    this.setState({ diagnostic });
    void errorReporting.report(error, diagnostic).then((reference) => {
      if (reference) this.setState({ reference });
    });
  }

  private copyDetails = async (details: string) => {
    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copyStatus: "Details copied" });
    } catch {
      this.setState({ copyStatus: "Could not copy. Select the details to copy them manually." });
    }
  };

  render() {
    const { crashed, diagnostic, reference, copyStatus } = this.state;
    if (!crashed) return this.props.children;

    const details = diagnostic
      ? [
          `Category: ${diagnostic.category}`,
          `Area: ${diagnostic.route}`,
          `Source: ${diagnostic.source}`,
          ...(reference ? [`Report ID: ${reference}`] : []),
          ...diagnostic.frames,
        ].join("\n")
      : "";

    return (
      <main
        aria-labelledby="recovery-heading"
        className="grid min-h-dvh place-items-center bg-black px-4 py-8 text-white [color-scheme:dark]"
      >
        <div className="w-full max-w-lg space-y-4">
          <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
            <AlertTriangle aria-hidden="true" className="size-7 text-neutral-300" />
            <h1 id="recovery-heading" className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm leading-relaxed text-neutral-300">
              {descriptions[diagnostic?.category ?? "unexpected"]}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <RefreshCw aria-hidden="true" className="size-4 self-center" />
                Reload App
              </button>
              <a href="/dashboard" className="rounded-lg border border-neutral-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                Go to Dashboard
              </a>
            </div>
            {reference && <p role="status" className="break-all text-xs text-neutral-300">Error report received. ID {reference}</p>}
          </section>
          {diagnostic && (
            <details className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-200">
              <summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Technical details</summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-neutral-300">{details}</pre>
              <button
                type="button"
                onClick={() => void this.copyDetails(details)}
                className="mt-3 rounded border border-neutral-600 px-2 py-1 text-xs hover:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Copy details
              </button>
              <span role="status" className="ml-2 text-xs text-neutral-300">{copyStatus}</span>
            </details>
          )}
        </div>
      </main>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, RefreshCw } from "lucide-react";

import { errorReporting } from "@/services/errorReporting";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
  reportSent: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false,
    reportSent: false,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    errorReporting.report(error, errorInfo.componentStack || undefined);
    this.setState({ reportSent: true });

    try {
      const report = (globalThis as any)?.reportError;
      if (typeof report === "function") {
        report(error);
      }
    } catch {
      // noop
    }
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard";
    }
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.message}`,
      `\nStack:\n${error?.stack || "N/A"}`,
      errorInfo?.componentStack ? `\nComponent Stack:\n${errorInfo.componentStack}` : "",
      `\nURL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      `User Agent: ${navigator.userAgent}`,
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, showDetails, copied, reportSent } = this.state;

    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-sm">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
              <AlertTriangle className="h-7 w-7 text-red-400" />
            </div>

            <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              The app hit an unexpected error. Your data is safe. Try reloading the page or going
              back to the dashboard.
            </p>

            {error?.message ? (
              <div className="mt-4 rounded-lg border border-red-500/10 bg-red-500/5 px-4 py-3">
                <p className="break-all font-mono text-xs leading-relaxed text-red-300">
                  {error.message.length > 200 ? `${error.message.slice(0, 200)}...` : error.message}
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex gap-3">
              <button
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                onClick={this.handleReload}
                type="button"
              >
                <RefreshCw className="h-4 w-4" />
                Reload App
              </button>
              <button
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
                onClick={this.handleGoHome}
                type="button"
              >
                Go to Dashboard
              </button>
            </div>

            {reportSent ? (
              <p className="mt-4 flex items-center gap-1.5 text-[11px] text-emerald-400/70">
                <CheckCircle2 className="h-3 w-3" />
                Error report sent automatically
              </p>
            ) : null}
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800/50 bg-slate-900/40">
            <button
              onClick={() => this.setState({ showDetails: !showDetails })}
              className="flex w-full items-center justify-between px-5 py-3 text-xs text-slate-500 transition-colors hover:text-slate-400"
              type="button"
            >
              <span>Technical details</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    this.handleCopyError();
                  }}
                  className="text-slate-600 transition-colors hover:text-slate-400"
                  type="button"
                  title="Copy error details"
                >
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {showDetails ? (
              <div className="space-y-3 px-5 pb-4">
                {error?.stack ? (
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">
                      Stack Trace
                    </p>
                    <pre className="max-h-40 overflow-x-auto rounded-lg bg-slate-950/50 p-3 font-mono text-[11px] leading-relaxed text-slate-500">
                      {error.stack}
                    </pre>
                  </div>
                ) : null}
                {errorInfo?.componentStack ? (
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">
                      Component Stack
                    </p>
                    <pre className="max-h-32 overflow-x-auto rounded-lg bg-slate-950/50 p-3 font-mono text-[11px] leading-relaxed text-slate-500">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}

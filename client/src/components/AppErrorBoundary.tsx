import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, Copy, CheckCircle2 } from "lucide-react";
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

    // Report to our error service
    errorReporting.report(error, errorInfo.componentStack || undefined);
    this.setState({ reportSent: true });

    // Also report to global handler if available
    try {
      const report = (globalThis as any)?.reportError;
      if (typeof report === "function") {
        report(error);
      }
    } catch {
      // no-op
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
      errorInfo?.componentStack
        ? `\nComponent Stack:\n${errorInfo.componentStack}`
        : "",
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
          {/* Main Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-sm p-8 shadow-2xl">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>

            <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              The app hit an unexpected error. Your data is safe — try reloading
              the page or going to the dashboard.
            </p>

            {/* Error message preview */}
            {error?.message && (
              <div className="mt-4 rounded-lg bg-red-500/5 border border-red-500/10 px-4 py-3">
                <p className="text-xs font-mono text-red-300 break-all leading-relaxed">
                  {error.message.length > 200
                    ? `${error.message.slice(0, 200)}…`
                    : error.message}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                onClick={this.handleReload}
                type="button"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                onClick={this.handleGoHome}
                type="button"
              >
                Go to Dashboard
              </button>
            </div>

            {/* Report Status */}
            {reportSent && (
              <p className="mt-4 text-[11px] text-emerald-400/70 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                Error report sent automatically
              </p>
            )}
          </div>

          {/* Expandable Technical Details */}
          <div className="mt-3 rounded-2xl border border-slate-800/50 bg-slate-900/40 overflow-hidden">
            <button
              onClick={() => this.setState({ showDetails: !showDetails })}
              className="w-full flex items-center justify-between px-5 py-3 text-xs text-slate-500 hover:text-slate-400 transition-colors"
              type="button"
            >
              <span>Technical Details</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    this.handleCopyError();
                  }}
                  className="text-slate-600 hover:text-slate-400 transition-colors"
                  type="button"
                  title="Copy error details"
                >
                  {copied ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    showDetails ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>

            {showDetails && (
              <div className="px-5 pb-4 space-y-3">
                {error?.stack && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">
                      Stack Trace
                    </p>
                    <pre className="text-[11px] font-mono text-slate-500 bg-slate-950/50 rounded-lg p-3 overflow-x-auto max-h-40 leading-relaxed">
                      {error.stack}
                    </pre>
                  </div>
                )}
                {errorInfo?.componentStack && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">
                      Component Stack
                    </p>
                    <pre className="text-[11px] font-mono text-slate-500 bg-slate-950/50 rounded-lg p-3 overflow-x-auto max-h-32 leading-relaxed">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

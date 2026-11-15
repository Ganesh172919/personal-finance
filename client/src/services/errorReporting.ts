import { buildApiUrl } from "@/lib/apiBase";

type ErrorSource = "render" | "window-error" | "unhandled-rejection";

function routeArea(path: string) {
  const [, area, mode] = path.split("/", 3);
  if (area === "chat" && (mode === "local" || mode === "cloud")) return `chat-${mode}` as const;
  if (area === "login" || area === "register" || area === "verify-email") return "auth";
  if (area === "chat" || area === "voice" || area === "files" || area === "dashboard" || area === "submission") return area;
  return "other";
}

function errorCategory(error: Error) {
  if (error.message === "useAuth must be used within an AuthProvider") return "auth-context";
  if (error.message === "useTheme must be used within ThemeProvider") return "theme-context";
  if (/Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(error.message)) {
    return "asset-load";
  }
  return "unexpected";
}

function appFrames(stack: string) {
  const frames = new Set<string>();
  const origin = window.location.origin;
  for (const line of stack.split("\n").slice(0, 32)) {
    if (!/^\s*at\s|^[\w$.<>]*@/.test(line)) continue;
    const start = line.indexOf(`${origin}/`);
    if (start < 0 || !/[\s(@]/.test(line[start - 1] ?? "")) continue;
    const location = line.slice(start + origin.length + 1);
    const match = location.match(/^(src\/[\w/-]+\.[cm]?[jt]sx?|assets\/[\w-]+\.js)(?:\?[^\s)]*?)?:(\d{1,7}):(\d{1,7})\)?\s*$/);
    if (!match) continue;
    const frame = `${match[1]}:${match[2]}:${match[3]}`;
    if (frame.length <= 160) frames.add(frame);
    if (frames.size >= 8) break;
  }
  return [...frames];
}

export function createErrorDiagnostic(error: unknown, source: ErrorSource, componentStack?: string) {
  const route = routeArea(window.location.pathname);
  const category = error instanceof Error ? errorCategory(error) : "unexpected";
  const stack = error instanceof Error && typeof error.stack === "string" ? error.stack : "";
  const frames = appFrames(`${stack}\n${componentStack ?? ""}`);
  return { source, category, route, frames };
}

export type ErrorDiagnostic = ReturnType<typeof createErrorDiagnostic>;

const reports = new WeakMap<Error, Promise<string | null>>();

async function send(diagnostic: ErrorDiagnostic): Promise<string | null> {
  try {
    const response = await fetch(buildApiUrl("/client-errors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(diagnostic),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
    });
    if (response.status !== 202) return null;
    const { request_id: reference } = await response.json();
    return typeof reference === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(reference) ? reference : null;
  } catch {
    return null;
  }
}

function report(error: unknown, diagnostic: ErrorDiagnostic): Promise<string | null> {
  if (!(error instanceof Error)) return send(diagnostic);
  const pending = reports.get(error);
  if (pending) return pending;
  const request = send(diagnostic);
  reports.set(error, request);
  return request;
}

let installed = false;

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener("unhandledrejection", ({ reason }) => {
    const error = reason instanceof Error ? reason : new Error();
    void report(error, createErrorDiagnostic(error, "unhandled-rejection"));
  });
  window.addEventListener("error", ({ error }) => {
    if (error instanceof Error) {
      queueMicrotask(() => void report(error, createErrorDiagnostic(error, "window-error")));
    }
  });
}

export const errorReporting = { install, report };

type LogLevel = "warn" | "error";

const isDev = import.meta.env.DEV;

const emitConsole = (level: LogLevel, message: string, payload?: unknown) => {
  if (!isDev) {
    return;
  }

  if (level === "warn") {
    if (payload === undefined) {
      console.warn(message);
      return;
    }
    console.warn(message, payload);
    return;
  }

  if (payload === undefined) {
    console.error(message);
    return;
  }
  console.error(message, payload);
};

export const reportClientError = (message: string, error?: unknown) => {
  emitConsole("error", message, error);
  try {
    const report = (globalThis as { reportError?: (error: Error) => void }).reportError;
    if (typeof report === "function" && error instanceof Error) {
      report(error);
    }
  } catch {
    // no-op
  }
};

export const reportClientWarning = (message: string, details?: unknown) => {
  emitConsole("warn", message, details);
};

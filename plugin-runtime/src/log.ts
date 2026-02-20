type Level = "debug" | "info" | "warn" | "error";

const levelRank: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const createLogger = (level: Level) => {
  const min = levelRank[level] ?? levelRank.info;

  const emit = (lvl: Level, msg: string, meta?: Record<string, unknown>) => {
    if ((levelRank[lvl] ?? 100) < min) return;
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      ...(meta ? { meta } : {}),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  };

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
  };
};


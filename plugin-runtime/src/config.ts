export type PluginRuntimeConfig = {
  port: number;
  authToken: string | null;
  pluginDir: string;
  execTimeoutMs: number;
  finwiseServerUrl: string | null;
  finwiseToolsToken: string | null;
  requestTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
};

const parsePort = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(65535, Math.floor(parsed)));
};

const parseMs = (value: string | undefined, fallback: number, { min = 50, max = 300_000 } = {}) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const parseLogLevel = (value: string | undefined): PluginRuntimeConfig["logLevel"] => {
  const normalized = String(value || "info").trim().toLowerCase();
  if (normalized === "debug") return "debug";
  if (normalized === "warn") return "warn";
  if (normalized === "error") return "error";
  return "info";
};

export const getConfig = (): PluginRuntimeConfig => {
  const port = parsePort(Deno.env.get("PORT"), 8788);
  const authTokenRaw = Deno.env.get("PLUGIN_RUNTIME_TOKEN");
  const authToken = authTokenRaw && authTokenRaw.trim().length > 0 ? authTokenRaw.trim() : null;
  const pluginDir = (Deno.env.get("PLUGIN_DIR") || "./plugins").trim() || "./plugins";
  const execTimeoutMs = parseMs(Deno.env.get("PLUGIN_EXEC_TIMEOUT_MS"), 15_000, { min: 250, max: 120_000 });
  const requestTimeoutMs = parseMs(Deno.env.get("PLUGIN_HOST_REQUEST_TIMEOUT_MS"), 5_000, { min: 250, max: 60_000 });

  const finwiseServerUrlRaw = Deno.env.get("FINWISE_SERVER_URL");
  const finwiseServerUrl =
    finwiseServerUrlRaw && finwiseServerUrlRaw.trim().length > 0 ? finwiseServerUrlRaw.trim().replace(/\/$/, "") : null;

  const finwiseToolsTokenRaw = Deno.env.get("FINWISE_TOOLS_TOKEN");
  const finwiseToolsToken =
    finwiseToolsTokenRaw && finwiseToolsTokenRaw.trim().length > 0 ? finwiseToolsTokenRaw.trim() : null;

  const logLevel = parseLogLevel(Deno.env.get("LOG_LEVEL"));

  return {
    port,
    authToken,
    pluginDir,
    execTimeoutMs,
    finwiseServerUrl,
    finwiseToolsToken,
    requestTimeoutMs,
    logLevel,
  };
};


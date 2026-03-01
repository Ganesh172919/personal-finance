import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { getEnv } from "./env";
import { logger } from "./logger";

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry distributed tracing.
 *
 * Only activates when `OTEL_ENDPOINT` is set — entirely no-op otherwise.
 * Auto-instruments Mongoose queries and HTTP requests so traces
 * correlate across Node.js ↔ Python ↔ MongoDB.
 *
 * Call this at the very top of server.ts, before `start()`.
 */
export const initTelemetry = (): void => {
  const env = getEnv();
  if (!env.OTEL_ENDPOINT) {
    logger.info({ event: "otel_skipped" }, "OpenTelemetry disabled (OTEL_ENDPOINT not set)");
    return;
  }

  try {
    sdk = new NodeSDK({
      serviceName: "finwise-server",
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-mongoose": { enabled: true },
          "@opentelemetry/instrumentation-http": { enabled: true },
        }),
      ],
    });

    sdk.start();
    logger.info(
      { event: "otel_started", endpoint: env.OTEL_ENDPOINT },
      "OpenTelemetry tracing initialized",
    );
  } catch (error) {
    logger.warn(
      { error, event: "otel_init_failed" },
      "OpenTelemetry initialization failed (non-fatal)",
    );
  }
};

/**
 * Gracefully shut down the OpenTelemetry SDK.
 */
export const shutdownTelemetry = async (): Promise<void> => {
  if (sdk) {
    try {
      await sdk.shutdown();
    } catch {
      // ignore
    }
    sdk = null;
  }
};

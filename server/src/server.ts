import { closeDB, connectDB } from "./config/database";
import { configurePassport } from "./config/passport";
import { createApp } from "./app";
import { getEnv } from "./config/env";

let server: ReturnType<ReturnType<typeof createApp>["listen"]> | null = null;
let shuttingDown = false;

const shutdown = async (reason: string, exitCode = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log(`Received ${reason}. Starting graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timeout reached. Forcing process exit.");
    process.exit(exitCode || 1);
  }, 15_000);
  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise<void>(resolve => {
        server!.close(() => resolve());
      });
    }
    await closeDB();
    console.log("Graceful shutdown completed.");
    process.exit(exitCode);
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
};

async function start() {
  const env = getEnv();
  configurePassport();
  await connectDB();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    console.log(`Server is running on http://localhost:${env.PORT}`);
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;

  process.once("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });

  process.once("uncaughtException", error => {
    console.error("Uncaught exception:", error);
    void shutdown("uncaughtException", 1);
  });

  process.once("unhandledRejection", reason => {
    console.error("Unhandled rejection:", reason);
    void shutdown("unhandledRejection", 1);
  });
}

start().catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

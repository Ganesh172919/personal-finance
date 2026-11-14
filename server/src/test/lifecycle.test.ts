import http from "node:http";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { startTestDb, stopTestDb } from "./testDb";
import {
  SERVER_TIMEOUTS,
  applyServerTimeouts,
  isShuttingDown,
  markShuttingDown,
  resetLifecycleForTests,
  resolveShutdownConfig,
} from "../lifecycle";

afterEach(() => {
  resetLifecycleForTests();
});

describe("server timeouts", () => {
  it("applies the keep-alive safe values to a real http.Server", () => {
    const server = http.createServer();
    applyServerTimeouts(server);

    expect(server.keepAliveTimeout).toBe(SERVER_TIMEOUTS.keepAliveTimeoutMs);
    expect(server.headersTimeout).toBe(SERVER_TIMEOUTS.headersTimeoutMs);
    expect(server.requestTimeout).toBe(SERVER_TIMEOUTS.requestTimeoutMs);
    server.close();
  });

  it("keeps the orderings that prevent load-balancer 502s and invalid Node configs", () => {
    // Above common LB idle timeouts (ALB defaults to 60s).
    expect(SERVER_TIMEOUTS.keepAliveTimeoutMs).toBeGreaterThan(60_000);
    // Node closes idle keep-alive sockets at headersTimeout if it is not above keepAliveTimeout.
    expect(SERVER_TIMEOUTS.headersTimeoutMs).toBeGreaterThan(SERVER_TIMEOUTS.keepAliveTimeoutMs);
    // Node rejects headersTimeout > requestTimeout.
    expect(SERVER_TIMEOUTS.requestTimeoutMs).toBeGreaterThanOrEqual(SERVER_TIMEOUTS.headersTimeoutMs);
  });
});

describe("resolveShutdownConfig", () => {
  it("is fast outside production", () => {
    expect(resolveShutdownConfig({ NODE_ENV: "development" })).toEqual({ drainMs: 0, forceExitMs: 15_000 });
    expect(resolveShutdownConfig({})).toEqual({ drainMs: 0, forceExitMs: 15_000 });
  });

  it("drains and waits long enough for in-flight AI calls in production", () => {
    const config = resolveShutdownConfig({ NODE_ENV: "production" });
    expect(config.drainMs).toBe(5_000);
    expect(config.forceExitMs).toBe(60_000);
    // Must outlast the 45s AI Core upstream timeout.
    expect(config.forceExitMs).toBeGreaterThan(45_000);
  });

  it("honours overrides and ignores invalid values", () => {
    expect(
      resolveShutdownConfig({ NODE_ENV: "production", SHUTDOWN_DRAIN_MS: "1000", SHUTDOWN_TIMEOUT_MS: "90000" })
    ).toEqual({ drainMs: 1000, forceExitMs: 90_000 });

    expect(
      resolveShutdownConfig({ NODE_ENV: "production", SHUTDOWN_DRAIN_MS: "soon", SHUTDOWN_TIMEOUT_MS: "-5" })
    ).toEqual({ drainMs: 5_000, forceExitMs: 60_000 });

    expect(resolveShutdownConfig({ SHUTDOWN_DRAIN_MS: "0" }).drainMs).toBe(0);
  });
});

describe("/readyz draining", () => {
  // Same setup as the other HTTP tests: the global middleware chain needs Passport and a database.
  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("is ready before shutdown starts (control for the draining case)", async () => {
    const response = await request(createApp()).get("/readyz");
    expect(response.status).toBe(200);
    // responseContext adds request_id to JSON bodies, so match on the field we own.
    expect(response.body).toMatchObject({ status: "ready" });
  });

  it("reports draining (503) once shutdown starts, even though the database is still healthy", async () => {
    const app = createApp();
    expect(isShuttingDown()).toBe(false);

    markShuttingDown();
    expect(isShuttingDown()).toBe(true);

    const response = await request(app).get("/readyz");
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: "draining" });
  });

  it("keeps /healthz (liveness) green while draining so the orchestrator does not kill the pod early", async () => {
    const app = createApp();
    markShuttingDown();

    const response = await request(app).get("/healthz");
    expect(response.status).toBe(200);
  });
});

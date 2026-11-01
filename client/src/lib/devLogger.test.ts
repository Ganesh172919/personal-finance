/**
 * @fileoverview Dev Logger Tests
 *
 * Tests for the dev logger covering:
 * - Network logger installation
 * - Performance mark helpers
 * - Request buffer management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  installNetworkLogger,
  startPerfMark,
  endPerfMark,
  getRequestLogs,
  clearRequestLogs,
} from "./devLogger";

describe("devLogger", () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    clearRequestLogs();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("installNetworkLogger", () => {
    it("replaces window.fetch with instrumented version", () => {
      installNetworkLogger();
      expect(window.fetch).not.toBe(originalFetch);
    });

    it("preserves fetch functionality", async () => {
      const mockResponse = new Response("ok", { status: 200 });
      window.fetch = vi.fn().mockResolvedValue(mockResponse);

      installNetworkLogger();

      const response = await window.fetch("/api/test");
      expect(response.status).toBe(200);
    });

    it("logs requests to the buffer", async () => {
      const mockResponse = new Response(JSON.stringify({ data: "test" }), {
        status: 200,
        headers: { "content-length": "16" },
      });
      window.fetch = vi.fn().mockResolvedValue(mockResponse);

      installNetworkLogger();

      await window.fetch("/api/transactions");
      const logs = getRequestLogs();

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toMatchObject({
        method: "GET",
        url: "/api/transactions",
        status: 200,
      });
    });
  });

  describe("performance marks", () => {
    it("startPerfMark and endPerfMark measure duration", () => {
      const measureSpy = vi.spyOn(performance, "measure");
      const clearSpy = vi.spyOn(performance, "clearMeasures");
      startPerfMark("test-op");
      // Simulate some work
      const start = performance.now();
      while (performance.now() - start < 5) {
        // busy wait
      }
      endPerfMark("test-op");

      expect(measureSpy).toHaveBeenCalledWith("test-op", "test-op:start", "test-op:end");
      expect(clearSpy).toHaveBeenCalledWith("test-op");
      expect(performance.getEntriesByName("test-op", "measure")).toHaveLength(0);
    });
  });

  describe("request buffer", () => {
    it("getRequestLogs returns a copy of the buffer", () => {
      const logs = getRequestLogs();
      expect(Array.isArray(logs)).toBe(true);
    });

    it("clearRequestLogs empties the buffer", async () => {
      const mockResponse = new Response("ok", { status: 200 });
      window.fetch = vi.fn().mockResolvedValue(mockResponse);

      installNetworkLogger();
      await window.fetch("/api/test");

      expect(getRequestLogs().length).toBeGreaterThan(0);
      clearRequestLogs();
      expect(getRequestLogs().length).toBe(0);
    });
  });
});

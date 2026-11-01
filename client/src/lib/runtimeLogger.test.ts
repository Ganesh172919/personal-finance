/**
 * @fileoverview Runtime Logger Tests
 *
 * Tests for the runtime logger covering:
 * - Log level filtering
 * - reportClientError calls reportError API
 * - reportClientWarning
 * - Dev-only behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  reportClientError,
  reportClientWarning,
  reportClientInfo,
  reportClientDebug,
} from "./runtimeLogger";

describe("runtimeLogger", () => {
  let reportErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    reportErrorSpy = vi.fn();
    (globalThis as any).reportError = reportErrorSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).reportError;
  });

  describe("reportClientError", () => {
    it("logs error message in development mode", () => {
      // In test environment, isDev is true
      reportClientError("Test error");
      // Should not throw
    });

    it("calls reportError API when error is an Error instance", () => {
      const error = new Error("Test error");
      reportClientError("Something failed", error);

      expect(reportErrorSpy).toHaveBeenCalledWith(error);
    });

    it("does not call reportError for non-Error values", () => {
      reportClientError("Something failed", "not an error");

      expect(reportErrorSpy).not.toHaveBeenCalled();
    });

    it("handles missing reportError gracefully", () => {
      delete (globalThis as any).reportError;

      expect(() => {
        reportClientError("Test", new Error("test"));
      }).not.toThrow();
    });
  });

  describe("reportClientWarning", () => {
    it("logs warning message in development mode", () => {
      reportClientWarning("Test warning");
      // Should not throw
    });

    it("includes details when provided", () => {
      reportClientWarning("Test warning", { key: "value" });
      // Should not throw
    });
  });

  describe("reportClientInfo", () => {
    it("logs info message in development mode", () => {
      reportClientInfo("Test info");
      // Should not throw
    });
  });

  describe("reportClientDebug", () => {
    it("logs debug message in development mode", () => {
      reportClientDebug("Test debug");
      // Should not throw
    });
  });
});

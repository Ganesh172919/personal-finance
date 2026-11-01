/**
 * @fileoverview Error Handler Middleware Tests
 *
 * Tests for the global error handler middleware covering:
 * - HttpError responses with correct status and code
 * - ZodError validation errors
 * - Mongoose ValidationError and CastError
 * - Unknown errors returning 500
 * - Error response format consistency
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { errorHandler } from "../middleware/errorHandler";
import { HttpError } from "../middleware/httpError";
import { z } from "zod";
import mongoose from "mongoose";

// Mock logger
vi.mock("../config/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    headersSent: false,
  };
  return res;
}

function createMockReq(requestId = "test-req-123") {
  return {
    requestId,
    method: "GET",
    path: "/api/test",
    url: "/api/test",
    ip: "127.0.0.1",
    get: vi.fn().mockReturnValue("test-user-agent"),
    user: { _id: "user-123" },
    orgId: "org-456",
  } as any;
}

describe("errorHandler", () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = createMockReq();
    res = createMockRes();
    next = vi.fn();
  });

  describe("HttpError handling", () => {
    it("returns correct status code for HttpError", () => {
      const err = new HttpError(400, "VALIDATION_ERROR", "Invalid input");
      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Invalid input",
        })
      );
    });

    it("returns 401 for unauthorized errors", () => {
      const err = new HttpError(401, "UNAUTHORIZED", "Not authenticated");
      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("returns 403 for forbidden errors", () => {
      const err = new HttpError(403, "FORBIDDEN", "Access denied");
      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("returns 404 for not found errors", () => {
      const err = new HttpError(404, "NOT_FOUND", "Resource not found");
      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("includes details when provided", () => {
      const err = new HttpError(400, "VALIDATION_ERROR", "Invalid input", {
        field: "email",
        reason: "invalid format",
      });
      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details: { field: "email", reason: "invalid format" },
        })
      );
    });
  });

  describe("ZodError handling", () => {
    it("returns 400 with VALIDATION_ERROR code", () => {
      const schema = z.object({ email: z.string().email() });
      const result = schema.safeParse({ email: "invalid" });
      if (!result.success) {
        errorHandler(result.error, req, res, next);
      }

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: "VALIDATION_ERROR",
        })
      );
    });
  });

  describe("Mongoose errors", () => {
    it("handles CastError with 400 status", () => {
      const err = new mongoose.Error.CastError("ObjectId", "invalid-id", "userId");
      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "INVALID_ID",
        })
      );
    });
  });

  describe("Unknown errors", () => {
    it("returns 500 for unknown errors", () => {
      const err = new Error("Something went wrong");
      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: "INTERNAL_SERVER_ERROR",
        })
      );
    });

    it("does not expose internal error details", () => {
      const err = new Error("Database connection string: mongodb://secret@host");
      errorHandler(err, req, res, next);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.message).not.toContain("secret");
      expect(jsonCall.message).toBe("Internal server error");
    });
  });

  describe("response format", () => {
    it("always includes success, message, code, and request_id", () => {
      const err = new HttpError(400, "TEST_ERROR", "Test message");
      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.any(String),
          code: expect.any(String),
          request_id: "test-req-123",
        })
      );
    });

    it("includes null data field", () => {
      const err = new HttpError(400, "TEST_ERROR", "Test");
      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: null,
        })
      );
    });
  });
});

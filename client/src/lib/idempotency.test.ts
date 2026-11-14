import { describe, expect, it } from "vitest";
import { IDEMPOTENCY_HEADER, idempotencyHeaders, newIdempotencyKey } from "./idempotency";

// Mirrors the server-side validation in server/src/middleware/idempotency.ts.
const SERVER_KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

describe("idempotency helpers", () => {
  it("generates keys the server will accept", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(newIdempotencyKey()).toMatch(SERVER_KEY_PATTERN);
    }
  });

  it("generates a distinct key for each user action", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(200);
  });

  it("builds the header only when a key is provided", () => {
    expect(idempotencyHeaders("abcd-1234-efgh")).toEqual({ [IDEMPOTENCY_HEADER]: "abcd-1234-efgh" });
    expect(idempotencyHeaders(undefined)).toBeUndefined();
    expect(idempotencyHeaders("")).toBeUndefined();
  });
});

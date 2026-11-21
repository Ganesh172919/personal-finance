import { describe, expect, it } from "vitest";
import { safeHttpPath } from "../observability/httpPath";

describe("HTTP log and metric paths", () => {
  it.each([
    ["/api/auth/google/callback?code=example", "/api/auth/google/callback"],
    ["/api/tasks/webhook/example", "/api/tasks/webhook/:token"],
    ["/api/v1/workflows/webhook/example", "/api/v1/workflows/webhook/:token"],
    ["/api/newsletter/unsubscribe/example", "/api/newsletter/unsubscribe/:token"],
    ["/api/v1/public/shares/financial-story/example", "/api/v1/public/shares/financial-story/:token"],
  ])("omits credential values from the logged route", (url, expected) => {
    expect(safeHttpPath(url)).toBe(expected);
  });
});

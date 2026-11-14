import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("axios", () => {
  const instance = { post, get, defaults: { timeout: 0, headers: {} } };
  class AxiosError extends Error {}
  const create = vi.fn(() => instance);
  return { default: { create, isAxiosError: () => false }, create, AxiosError };
});

import { getAiCoreClientStatus, processAiCoreReceiptOcr } from "../services/aiCoreClient";

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail: "Invalid image payload" } } });
const parse = () => processAiCoreReceiptOcr({ image: Buffer.from("x"), contentType: "image/png" }, "req-test");

describe("AI Core circuit breaker", () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    get.mockResolvedValue({ data: { status: "healthy" } });
  });

  it("does not open the shared breaker when AI Core rejects a bad payload with 4xx", async () => {
    post.mockRejectedValue(httpError(400));
    for (let i = 0; i < 5; i += 1) {
      const result = await parse();
      expect(result.success).toBe(false);
      expect(result.warnings.join(" ")).not.toContain("circuit breaker open");
    }
    expect(getAiCoreClientStatus().circuitOpen).toBe(false);
    expect(post).toHaveBeenCalledTimes(5);
  });

  it("still opens the breaker after repeated 5xx failures", async () => {
    post.mockRejectedValue(httpError(503));
    for (let i = 0; i < 3; i += 1) await parse();
    expect(getAiCoreClientStatus().circuitOpen).toBe(true);
    const blocked = await parse();
    expect(blocked.warnings).toContain("AI core circuit breaker open");
  });
});

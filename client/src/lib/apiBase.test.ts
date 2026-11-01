import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("API path boundaries", () => {
  it.each([
    ["/api-keys", "/api/api-keys"],
    ["/api-keys/key-id/revoke", "/api/api-keys/key-id/revoke"],
    ["/api/transactions", "/api/transactions"],
    ["/transactions", "/api/transactions"],
    ["/api?limit=10", "/api?limit=10"],
  ])("normalizes %s to %s", async (input, expected) => {
    vi.stubEnv("VITE_API_BASE_URL", "/api");
    const { buildApiUrl } = await import("./apiBase");
    expect(buildApiUrl(input)).toBe(expected);
  });

  it("keeps API key routes under a separate API origin", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test/api");
    const { buildApiUrl } = await import("./apiBase");
    expect(buildApiUrl("/api-keys")).toBe("https://api.example.test/api/api-keys");
    expect(buildApiUrl("/api/transactions")).toBe("https://api.example.test/api/transactions");
  });
});

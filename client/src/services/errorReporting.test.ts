import { afterEach, describe, expect, it, vi } from "vitest";
import { createErrorDiagnostic, errorReporting } from "./errorReporting";

afterEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("browser error reports", () => {
  it("keeps only safe app frames and sends one credential-free report per error", async () => {
    history.replaceState(null, "", "/chat/local/private-thread?token=private-query");
    const error = new Error("useAuth must be used within an AuthProvider");
    const origin = window.location.origin;
    error.stack = [
      error.message,
      `    at useAuth (${origin}/src/hooks/useAuth.tsx?t=123&token=private-query:9:5)`,
      "    at anonymous (https://third.example/src/credentials.tsx:12:5)",
    ].join("\n");
    const diagnostic = createErrorDiagnostic(error, "render", `    at App (${origin}/assets/index-123.js:100:2)`);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(
      JSON.stringify({ request_id: "reference-123" }), { status: 202 },
    ));
    vi.stubGlobal("fetch", fetch);

    const first = errorReporting.report(error, diagnostic);
    expect(errorReporting.report(error, diagnostic)).toBe(first);
    expect(await first).toBe("reference-123");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = fetch.mock.calls[0];
    expect(request).toMatchObject({ method: "POST", credentials: "omit", referrerPolicy: "no-referrer" });
    expect(JSON.parse(String(request?.body))).toEqual({
      source: "render",
      route: "chat-local",
      category: "auth-context",
      frames: ["src/hooks/useAuth.tsx:9:5", "assets/index-123.js:100:2"],
    });
  });

  it("returns no receipt on network failure, non-202 responses, or invalid receipts", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetch);

    for (let index = 0; index < 3; index++) {
      const error = new Error("a private exception");
      expect(await errorReporting.report(error, createErrorDiagnostic(error, "render"))).toBeNull();
    }
  });
});

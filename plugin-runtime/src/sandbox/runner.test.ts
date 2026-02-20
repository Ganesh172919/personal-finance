import { runInSandbox } from "./runner.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

const manifest = {
  plugin_key: "finwise.test",
  version: "1.0.0",
  publisher: "tests",
  permissions: [],
  entrypoints: { module: "dist/plugin.js" },
  tools: [],
  connectors: [],
};

Deno.test("runInSandbox returns handler output", async () => {
  const moduleCode = `
    export const handlers = {
      fast: {
        simulate: async () => ({ ok: true, hello: "world" }),
        execute: async () => ({ ok: true }),
        connector_sync: async () => ({ ok: true })
      }
    };
  `;

  const out = await runInSandbox(
    {
      manifest,
      handler: "fast",
      moduleCode,
      method: "simulate",
      orgId: "org1",
      userId: "user1",
      actorRole: "member",
      toolCall: {
        id: "t1",
        title: "t",
        description: "d",
        tool: "plugin.finwise.test.fast",
        args: {},
        requires_confirmation: false,
        risk: "low",
      },
      requestId: "req1",
    },
    { timeoutMs: 200, hostCall: async () => ({ ok: false }) }
  );

  assert(out.ok === true, "expected ok");
  assert((out as any).hello === "world", "expected hello");
});

Deno.test("runInSandbox times out", async () => {
  const moduleCode = `
    export const handlers = {
      slow: {
        simulate: async () => {
          await new Promise((r) => setTimeout(r, 80));
          return { ok: true };
        },
        execute: async () => ({ ok: true }),
        connector_sync: async () => ({ ok: true })
      }
    };
  `;

  let threw = false;
  try {
    await runInSandbox(
      {
        manifest,
        handler: "slow",
        moduleCode,
        method: "simulate",
        orgId: "org1",
        userId: "user1",
        actorRole: "member",
      },
      { timeoutMs: 20, hostCall: async () => ({}) }
    );
  } catch (error) {
    threw = true;
    const msg = error instanceof Error ? error.message : String(error);
    assert(msg === "plugin_timeout", `expected plugin_timeout, got ${msg}`);
  }
  assert(threw, "expected timeout error");
});

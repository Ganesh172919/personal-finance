import { parseManifest } from "./manifest.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

Deno.test("parseManifest accepts valid manifest", () => {
  const manifest = parseManifest({
    plugin_key: "finwise.sample",
    version: "1.0.0",
    publisher: "tests",
    permissions: ["transactions:read"],
    entrypoints: { module: "dist/plugin.js" },
    tools: [
      {
        tool: "plugin.finwise.sample.echo",
        handler: "echo",
        title: "Echo",
        description: "desc",
        risk_default: "low",
        requires_confirmation_default: false,
        required_role: "member",
        args_schema: { type: "object", additionalProperties: true, properties: {} },
        args_example: {},
      },
    ],
    connectors: [],
  });

  assert(manifest.plugin_key === "finwise.sample", "plugin_key");
  assert(manifest.tools.length === 1, "tools");
});

Deno.test("parseManifest rejects invalid tool name", () => {
  let threw = false;
  try {
    parseManifest({
      plugin_key: "finwise.bad",
      version: "1.0.0",
      publisher: "tests",
      permissions: [],
      entrypoints: { module: "dist/plugin.js" },
      tools: [
        {
          tool: "transactions.create",
          handler: "bad",
          title: "Bad",
          description: "desc",
          risk_default: "low",
          requires_confirmation_default: false,
          required_role: "member",
          args_schema: {},
          args_example: {},
        },
      ],
      connectors: [],
    });
  } catch (error) {
    threw = true;
    const msg = error instanceof Error ? error.message : String(error);
    assert(msg.toLowerCase().includes("invalid tool"), `unexpected error: ${msg}`);
  }

  assert(threw, "expected parseManifest to throw");
});


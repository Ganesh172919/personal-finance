import { validateJsonSchema } from "./jsonSchema.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

Deno.test("validateJsonSchema accepts valid args", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: {
      message: { type: "string", minLength: 1, maxLength: 5 },
    },
  };

  const ok = validateJsonSchema(schema, { message: "hey" });
  assert(ok.ok, "expected ok");
});

Deno.test("validateJsonSchema rejects missing required fields", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: {
      message: { type: "string" },
    },
  };

  const res = validateJsonSchema(schema, {});
  assert(!res.ok, "expected error");
  if (!res.ok) {
    assert(res.errors.some((e) => e.includes("$.message")), "expected message error");
  }
});

Deno.test("validateJsonSchema rejects additional properties when disabled", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      message: { type: "string" },
    },
  };

  const res = validateJsonSchema(schema, { message: "ok", extra: 1 });
  assert(!res.ok, "expected error");
  if (!res.ok) {
    assert(res.errors.some((e) => e.includes("$.extra")), "expected extra error");
  }
});

Deno.test("validateJsonSchema rejects wrong types", () => {
  const schema = {
    type: "object",
    properties: {
      n: { type: "integer", minimum: 0 },
    },
  };

  const res = validateJsonSchema(schema, { n: 1.2 });
  assert(!res.ok, "expected error");
});


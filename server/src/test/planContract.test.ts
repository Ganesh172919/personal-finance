import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { planSchema } from "../schemas/aiPlanSchema";

describe("plan contract fixture", () => {
  it("parses server/docs/contracts/plan.example.json", async () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const fixturePath = path.resolve(testDir, "../../docs/contracts/plan.example.json");
    const raw = await readFile(fixturePath, "utf-8");
    const json = JSON.parse(raw) as unknown;

    expect(() => planSchema.parse(json)).not.toThrow();
  });
});


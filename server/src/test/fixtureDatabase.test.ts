import { describe, expect, it } from "vitest";
import { requireFixtureDatabase } from "../scripts/fixtureDatabase";

const fixtureUri = "mongodb://127.0.0.1:27017/finwise-fixtures";

describe("sample content database", () => {
  it("requires an explicit isolated local fixture database", () => {
    expect(requireFixtureDatabase({ MOCK_CONTENT_MONGO_URI: fixtureUri })).toBe(fixtureUri);
    expect(() => requireFixtureDatabase({ MONGO_URI: fixtureUri })).toThrow(/MOCK_CONTENT_MONGO_URI/);
    expect(() => requireFixtureDatabase({ NODE_ENV: "production", MOCK_CONTENT_MONGO_URI: fixtureUri })).toThrow();
  });

  it.each([
    "mongodb://127.0.0.1:27017/finwise",
    "mongodb://db.example.com:27017/finwise-fixtures",
    "mongodb://127.0.0.1:27017/finwise-fixtures?replicaSet=remote",
  ])("rejects a database outside the fixture scope (%s)", (uri) => {
    expect(() => requireFixtureDatabase({ MOCK_CONTENT_MONGO_URI: uri })).toThrow();
  });
});

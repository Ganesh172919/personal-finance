import { describe, expect, it } from "vitest";
import { aiCoreActorHeaders } from "../services/aiCoreTransport";
import { __resetLearningOptOutCacheForTests, setLearningOptOutCached } from "../services/aiLearningOptOut";

describe("aiCoreActorHeaders", () => {
  it("derives the tenant actor headers from a payload with org_id and user_id", () => {
    expect(aiCoreActorHeaders({ org_id: "org-1", user_id: "user-1" })).toEqual({
      "X-Internal-Org-Id": "org-1",
      "X-Internal-User-Id": "user-1",
    });
  });

  it("trims whitespace", () => {
    expect(aiCoreActorHeaders({ org_id: "  org-1 ", user_id: " user-1  " })).toEqual({
      "X-Internal-Org-Id": "org-1",
      "X-Internal-User-Id": "user-1",
    });
  });

  it("uses the request-local privacy decision even when the cache disagrees", () => {
    const orgId = "a".repeat(24);
    const actor = { org_id: orgId, user_id: "u1" };
    __resetLearningOptOutCacheForTests();
    expect(aiCoreActorHeaders(actor, { learningOptedOut: true })["X-Internal-Learning-Opt-Out"]).toBe("1");
    setLearningOptOutCached(orgId, true);
    expect(aiCoreActorHeaders(actor, { learningOptedOut: false })["X-Internal-Learning-Opt-Out"]).toBeUndefined();
    __resetLearningOptOutCacheForTests();
  });

  it("returns no headers unless both ids are present, so partial actors are never half-sent", () => {
    expect(aiCoreActorHeaders({ org_id: "org-1" })).toEqual({});
    expect(aiCoreActorHeaders({ user_id: "user-1" })).toEqual({});
    expect(aiCoreActorHeaders({ org_id: "", user_id: "user-1" })).toEqual({});
    expect(aiCoreActorHeaders({ org_id: 42, user_id: "user-1" })).toEqual({});
    expect(aiCoreActorHeaders(null)).toEqual({});
    expect(aiCoreActorHeaders(undefined)).toEqual({});
  });
});

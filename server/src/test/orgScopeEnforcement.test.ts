import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import AgentOutputModel from "../models/agentOutputModel";
import AutopilotRunModel from "../models/autopilotRunModel";
import { FollowThroughPreferenceModel } from "../models/followThroughPreferenceModel";
import ToolExecutionModel from "../models/toolExecutionModel";
import UsageEventModel from "../models/usageEventModel";
import { enforceFeatureLimit } from "../services/entitlements";
import { isOrgScopeBypassed, orgScopeEnforced, withOrgScopeBypass } from "../utils/orgScopePlugin";
import { startTestDb, stopTestDb } from "./testDb";

describe("orgScopePlugin enforcement", () => {
  const orgId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const previous = process.env.ORG_SCOPE_ENFORCE;

  beforeAll(async () => {
    await startTestDb();
  });
  afterAll(async () => {
    await stopTestDb();
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.ORG_SCOPE_ENFORCE;
    else process.env.ORG_SCOPE_ENFORCE = previous;
  });

  it("is warn-only by default in tests and switchable via ORG_SCOPE_ENFORCE", async () => {
    delete process.env.ORG_SCOPE_ENFORCE;
    expect(orgScopeEnforced()).toBe(false);
    await expect(AgentOutputModel.find({}).exec()).resolves.toEqual([]);

    process.env.ORG_SCOPE_ENFORCE = "true";
    expect(orgScopeEnforced()).toBe(true);
    process.env.ORG_SCOPE_ENFORCE = "false";
    expect(orgScopeEnforced()).toBe(false);
  });

  describe("with enforcement on", () => {
    const enforce = () => {
      process.env.ORG_SCOPE_ENFORCE = "true";
    };

    it("blocks unscoped reads on every newly guarded model, allows scoped ones", async () => {
      enforce();
      const models = [AgentOutputModel, ToolExecutionModel, UsageEventModel, FollowThroughPreferenceModel, AutopilotRunModel] as any[];
      for (const model of models) {
        await expect(model.find({ userId }).exec(), model.modelName).rejects.toThrow(/orgId is required/);
        await expect(model.findOne({ userId }).exec(), model.modelName).rejects.toThrow(/orgId is required/);
        await expect(model.countDocuments({ userId }).exec(), model.modelName).rejects.toThrow(/orgId is required/);
        await expect(model.find({ orgId, userId }).exec(), model.modelName).resolves.toEqual([]);
        await expect(model.find({ $and: [{ orgId }, { userId }] }).exec(), model.modelName).resolves.toEqual([]);
      }
    });

    it("blocks unscoped aggregates and writes", async () => {
      enforce();
      await expect(UsageEventModel.aggregate([{ $match: { userId } }]).exec()).rejects.toThrow(/aggregate\(\) blocked/);
      await expect(UsageEventModel.aggregate([{ $match: { orgId } }]).exec()).resolves.toEqual([]);
      await expect(AgentOutputModel.deleteMany({ userId }).exec()).rejects.toThrow(/orgId is required/);
      await expect(AgentOutputModel.updateMany({ userId }, { $set: { priority: "low" } }).exec()).rejects.toThrow(/orgId is required/);
      await expect(AgentOutputModel.findOneAndUpdate({ _id: new mongoose.Types.ObjectId() }, { $set: { priority: "low" } }).exec()).rejects.toThrow(
        /orgId is required/
      );
      await expect(AgentOutputModel.deleteMany({ orgId, userId }).exec()).resolves.toBeTruthy();
    });

    it("bypass is explicit, requires a reason, and is scoped to the callback's async context", async () => {
      enforce();
      expect(() => withOrgScopeBypass("", async () => undefined)).toThrow(/reason/);

      const rows = await withOrgScopeBypass("test: system rollup", async () => {
        expect(isOrgScopeBypassed()).toBe(true);
        const found = await AgentOutputModel.find({}).exec();
        const agg = await UsageEventModel.aggregate([{ $match: { userId } }]).exec();
        return [found, agg];
      });
      expect(rows).toEqual([[], []]);

      expect(isOrgScopeBypassed()).toBe(false);
      await expect(AgentOutputModel.find({}).exec()).rejects.toThrow(/orgId is required/);
    });

    it("legacy no-org usage path (entitlements) keeps working under enforcement", async () => {
      enforce();
      // userId-only rollup is wrapped in a documented bypass inside entitlements.
      // A limit error is acceptable here; an org-scope error is not.
      const outcome = await enforceFeatureLimit({ userId, feature: "monthly_ai_calls", units: 1 }).catch((error: any) => error);
      expect(String((outcome as any)?.message ?? "")).not.toMatch(/orgScopePlugin/);
    });
  });
});

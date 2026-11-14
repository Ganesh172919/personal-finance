import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn() }));
vi.mock("../models/financialProfileModel", () => ({ default: model }));
vi.mock("../services/transactionMigration", () => ({ ensureProfileTransactionsMigrated: vi.fn() }));

import { ensureProfile } from "../services/profileService";

const params = { orgId: "org-1" as any, userId: "user-1" as any };

describe("ensureProfile concurrent first access", () => {
  beforeEach(() => {
    model.findOne.mockReset();
    model.create.mockReset();
  });

  it("returns the profile created by a concurrent request when create hits E11000", async () => {
    const winner = { _id: "profile-1", ...params };
    model.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    model.create.mockRejectedValueOnce(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));

    await expect(ensureProfile(params)).resolves.toBe(winner);
    expect(model.findOne).toHaveBeenCalledTimes(2);
    expect(model.findOne).toHaveBeenLastCalledWith({ orgId: "org-1", userId: "user-1" });
  });

  it("still surfaces non-duplicate errors", async () => {
    model.findOne.mockResolvedValueOnce(null);
    model.create.mockRejectedValueOnce(new Error("connection lost"));
    await expect(ensureProfile(params)).rejects.toThrow("connection lost");
  });

  it("creates a default profile scoped to org and user when none exists", async () => {
    model.findOne.mockResolvedValueOnce(null);
    model.create.mockImplementationOnce(async (doc: any) => doc);
    const created: any = await ensureProfile(params);
    expect(created.orgId).toBe("org-1");
    expect(created.userId).toBe("user-1");
    expect(created.annual_income).toBe(0);
  });
});

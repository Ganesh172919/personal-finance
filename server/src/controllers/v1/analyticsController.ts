import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import ExportJobModel from "../../models/exportJobModel";
import FeatureFlagModel from "../../models/featureFlagModel";
import IntegrationConnectionModel from "../../models/integrationConnectionModel";
import PluginInstallModel from "../../models/pluginInstallModel";
import UsageLedgerModel from "../../models/usageLedgerModel";
import WorkflowModel from "../../models/workflowModel";
import WorkflowRunModel from "../../models/workflowRunModel";
import { HttpError } from "../../middleware/httpError";
import { getCurrentPeriodKey, getResolvedEntitlements } from "../../services/entitlements";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const requireOrgAdmin = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  if (roleRank[req.org.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

export const getAnalyticsOverview = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const periodKeyRaw = typeof (req.query as any)?.period_key === "string" ? String((req.query as any).period_key) : "";
  const periodKey = periodKeyRaw.trim() || getCurrentPeriodKey();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [activeWorkflows, workflowRuns30d, exports30d, connectedIntegrations, installedPlugins, featureFlags, ledgerRows, resolved] =
    await Promise.all([
      WorkflowModel.countDocuments({ orgId, enabled: true }),
      WorkflowRunModel.countDocuments({ orgId, createdAt: { $gte: since30d } }),
      ExportJobModel.countDocuments({ orgId, createdAt: { $gte: since30d } }),
      IntegrationConnectionModel.countDocuments({ orgId, status: "connected" }),
      PluginInstallModel.countDocuments({ orgId, status: "installed" }),
      FeatureFlagModel.countDocuments({ orgId }),
      UsageLedgerModel.find({ orgId, periodKey }).select({ feature: 1, units: 1, costUsd: 1, tokensIn: 1, tokensOut: 1 }).lean(),
      getResolvedEntitlements({ orgId, userId: user._id }),
    ]);

  const usageByFeature = ledgerRows.reduce<Record<string, { units: number; tokens_in: number; tokens_out: number; cost_usd: number }>>(
    (acc, row: any) => {
      const feature = String(row.feature);
      acc[feature] = {
        units: Number(row.units || 0),
        tokens_in: Number(row.tokensIn || 0),
        tokens_out: Number(row.tokensOut || 0),
        cost_usd: Number(row.costUsd || 0),
      };
      return acc;
    },
    {}
  );

  return res.json({
    org_id: orgId.toString(),
    period_key: periodKey,
    plan: resolved.entitlement.plan,
    status: resolved.entitlement.status,
    metrics: {
      active_workflows: activeWorkflows,
      workflow_runs_30d: workflowRuns30d,
      exports_30d: exports30d,
      connected_integrations: connectedIntegrations,
      installed_plugins: installedPlugins,
      feature_flags: featureFlags,
    },
    usage: usageByFeature,
    limits: resolved.limits,
    remaining: resolved.remaining,
    request_id: req.requestId,
  });
};

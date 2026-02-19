import mongoose from "mongoose";
import dotenv from "dotenv";

import OrgMemberModel from "../models/orgMemberModel";
import FinancialProfileModel from "../models/financialProfileModel";
import TransactionModel from "../models/transactionModel";
import TaskModel from "../models/taskModel";
import ChatSessionModel from "../models/chatSessionModel";
import ChatMessageModel from "../models/chatMessageModel";
import AgentOutputModel from "../models/agentOutputModel";
import ReceiptModel from "../models/receiptModel";
import JournalEntryModel from "../models/journalEntryModel";
import AiResponseCacheModel from "../models/aiResponseCacheModel";
import DomainEventModel from "../models/domainEventModel";
import UsageEventModel from "../models/usageEventModel";
import UsageLedgerModel from "../models/usageLedgerModel";
import ExportJobModel from "../models/exportJobModel";
import WorkflowModel from "../models/workflowModel";
import WorkflowRunModel from "../models/workflowRunModel";
import AuditEventModel from "../models/auditEventModel";
import ApiKeyModel from "../models/apiKeyModel";
import EntitlementModel from "../models/entitlementModel";
import BillingAccountModel from "../models/billingAccountModel";
import SubscriptionModel from "../models/subscriptionModel";

dotenv.config();

type CliArgs = {
  dryRun: boolean;
  batchSize: number;
  concurrency: number;
  since?: Date;
  reportJson: boolean;
};

const parseArgs = (): CliArgs => {
  const argv = process.argv.slice(2);
  const out: CliArgs = {
    dryRun: false,
    batchSize: 500,
    concurrency: 4,
    since: undefined,
    reportJson: false,
  };

  const readValue = (index: number, flag: string) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--report-json") {
      out.reportJson = true;
      continue;
    }
    if (arg === "--batch-size") {
      const raw = readValue(index, arg);
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 10_000) {
        throw new Error(`--batch-size must be a number in [1, 10000], got: ${raw}`);
      }
      out.batchSize = Math.floor(n);
      index += 1;
      continue;
    }
    if (arg === "--concurrency") {
      const raw = readValue(index, arg);
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 50) {
        throw new Error(`--concurrency must be a number in [1, 50], got: ${raw}`);
      }
      out.concurrency = Math.floor(n);
      index += 1;
      continue;
    }
    if (arg === "--since") {
      const raw = readValue(index, arg);
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`--since must be an ISO date/time, got: ${raw}`);
      }
      out.since = date;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      const help = [
        "migrateOrgIds.ts",
        "",
        "Backfills missing orgId fields for legacy single-tenant documents.",
        "",
        "Usage:",
        "  tsx src/scripts/migrateOrgIds.ts [options]",
        "",
        "Options:",
        "  --dry-run          Count only; no writes",
        "  --batch-size N     User-id chunk size per update (default: 500)",
        "  --concurrency N    Parallel update operations (default: 4)",
        "  --since ISO        Only touch documents with updatedAt >= since",
        "  --report-json      Print a JSON report to stdout",
        "",
        "Environment:",
        "  MONGO_URI is required",
      ].join("\n");
      // eslint-disable-next-line no-console
      console.log(help);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
};

const chunk = <T>(values: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
};

const runPool = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
};

const missingOrgFilter = {
  $or: [{ orgId: { $exists: false } }, { orgId: null }],
};

type BackfillTarget = {
  name: string;
  model: any;
  userField?: string;
};

type TargetReport = {
  name: string;
  collection: string;
  user_field?: string;
  missing_before: number;
  updated: number;
  matched: number;
  errors: string[];
  skipped_unscoped_missing?: number;
};

const isDuplicateKey = (error: any) => {
  const code = error?.code;
  return code === 11000 || String(error?.message || "").includes("E11000");
};

async function main() {
  const args = parseArgs();

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });

  const startedAt = Date.now();

  const memberships = await OrgMemberModel.aggregate([
    { $match: { status: "active" } },
    { $sort: { isDefault: -1, createdAt: 1 } },
    { $group: { _id: "$userId", orgId: { $first: "$orgId" } } },
  ]);

  const orgToUsers = new Map<string, mongoose.Types.ObjectId[]>();
  for (const row of memberships as any[]) {
    const userId = row?._id as mongoose.Types.ObjectId | undefined;
    const orgId = row?.orgId as mongoose.Types.ObjectId | undefined;
    if (!userId || !orgId) continue;
    const key = orgId.toString();
    const list = orgToUsers.get(key) || [];
    list.push(userId);
    orgToUsers.set(key, list);
  }

  const orgGroups = Array.from(orgToUsers.entries()).map(([orgId, userIds]) => ({
    orgId,
    userIds,
  }));

  const since = args.since;
  const sinceFilter = since ? { updatedAt: { $gte: since } } : undefined;

  const targets: BackfillTarget[] = [
    { name: "financial_profiles", model: FinancialProfileModel, userField: "userId" },
    { name: "transactions", model: TransactionModel, userField: "userId" },
    { name: "tasks", model: TaskModel, userField: "userId" },
    { name: "chat_sessions", model: ChatSessionModel, userField: "userId" },
    { name: "chat_messages", model: ChatMessageModel, userField: "userId" },
    { name: "agent_outputs", model: AgentOutputModel, userField: "userId" },
    { name: "receipts", model: ReceiptModel, userField: "userId" },
    { name: "journal_entries", model: JournalEntryModel, userField: "userId" },
    { name: "ai_response_cache", model: AiResponseCacheModel, userField: "userId" },
    { name: "domain_events", model: DomainEventModel, userField: "userId" },
    { name: "usage_events", model: UsageEventModel, userField: "userId" },
    { name: "exports", model: ExportJobModel, userField: "createdByUserId" },
    { name: "workflows", model: WorkflowModel, userField: "createdByUserId" },
    { name: "workflow_runs", model: WorkflowRunModel, userField: "triggeredByUserId" },
    { name: "audit_events", model: AuditEventModel, userField: "actorUserId" },
    { name: "api_keys", model: ApiKeyModel, userField: "createdByUserId" },
    { name: "entitlements", model: EntitlementModel, userField: "userId" },
    // Org-scoped-only collections (no user field) are reported but not auto-backfilled.
    { name: "usage_ledger", model: UsageLedgerModel },
    { name: "billing_accounts", model: BillingAccountModel },
    { name: "subscriptions", model: SubscriptionModel },
  ];

  const reports: TargetReport[] = [];

  for (const target of targets) {
    const model = target.model;
    const collection = String(model?.collection?.name || target.name);
    const errors: string[] = [];

    const report: TargetReport = {
      name: target.name,
      collection,
      user_field: target.userField,
      missing_before: 0,
      updated: 0,
      matched: 0,
      errors,
    };

    if (!target.userField) {
      const filter = sinceFilter ? { ...missingOrgFilter, ...sinceFilter } : missingOrgFilter;
      report.skipped_unscoped_missing = await model.countDocuments(filter);
      reports.push(report);
      continue;
    }

    const userField = target.userField;

    const preFilter = sinceFilter ? { ...missingOrgFilter, ...sinceFilter } : missingOrgFilter;
    report.missing_before = await model.countDocuments(preFilter);

    const workItems: Array<{ orgId: string; userIds: mongoose.Types.ObjectId[] }> = [];
    for (const group of orgGroups) {
      for (const userChunk of chunk(group.userIds, args.batchSize)) {
        workItems.push({ orgId: group.orgId, userIds: userChunk });
      }
    }

    const results = await runPool(workItems, args.concurrency, async (item) => {
      const orgId = new mongoose.Types.ObjectId(item.orgId);
      const filter: Record<string, unknown> = {
        [userField]: { $in: item.userIds },
        ...missingOrgFilter,
      };
      if (sinceFilter) {
        Object.assign(filter, sinceFilter);
      }

      if (args.dryRun) {
        const missing = await model.countDocuments(filter);
        return { matched: missing, modified: 0 };
      }

      try {
        const res = await model.updateMany(filter, { $set: { orgId } });
        return { matched: Number(res.matchedCount || 0), modified: Number(res.modifiedCount || 0) };
      } catch (error: any) {
        if (!isDuplicateKey(error)) {
          errors.push(String(error?.message || error));
          return { matched: 0, modified: 0 };
        }

        // Rare: unique indexes may conflict when multiple legacy docs exist for the same (orgId, userId) key.
        // In that case, fall back to per-document updates and report remaining conflicts.
        try {
          const docs = await model.find(filter).select({ _id: 1 }).lean();
          let matched = 0;
          let modified = 0;
          for (const doc of docs as any[]) {
            matched += 1;
            try {
              const one = await model.updateOne({ _id: doc._id, ...missingOrgFilter }, { $set: { orgId } });
              modified += Number((one as any).modifiedCount || 0);
            } catch (inner: any) {
              errors.push(`duplicate_key_conflict _id=${String(doc?._id)} ${String(inner?.message || inner)}`);
            }
          }
          return { matched, modified };
        } catch (inner: any) {
          errors.push(`duplicate_key_fallback_failed ${String(inner?.message || inner)}`);
          return { matched: 0, modified: 0 };
        }
      }
    });

    for (const row of results) {
      report.matched += row.matched;
      report.updated += row.modified;
    }

    reports.push(report);
  }

  // Post-check: count remaining missing orgId docs across scoped collections
  const postMissingByTarget: Record<string, number> = {};
  for (const target of targets) {
    const model = target.model;
    const filter = sinceFilter ? { ...missingOrgFilter, ...sinceFilter } : missingOrgFilter;
    postMissingByTarget[target.name] = await model.countDocuments(filter);
  }

  const elapsedMs = Date.now() - startedAt;
  const summary = {
    ok: reports.every((r) => (r.errors || []).length === 0),
    dry_run: args.dryRun,
    since: since ? since.toISOString() : undefined,
    batch_size: args.batchSize,
    concurrency: args.concurrency,
    users_with_active_membership: orgGroups.reduce((sum, group) => sum + group.userIds.length, 0),
    orgs: orgGroups.length,
    elapsed_ms: elapsedMs,
    targets: reports,
    missing_after: postMissingByTarget,
  };

  if (args.reportJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(`✅ migrateOrgIds completed (dryRun=${args.dryRun}) in ${Math.round(elapsedMs / 100) / 10}s`);
    // eslint-disable-next-line no-console
    console.log(`Users scanned (active memberships): ${summary.users_with_active_membership}`);
    for (const r of reports) {
      const updatedMsg = args.dryRun ? `missing=${r.matched}` : `updated=${r.updated} matched=${r.matched}`;
      const skipped = r.skipped_unscoped_missing ? ` skipped_unscoped_missing=${r.skipped_unscoped_missing}` : "";
      const errs = r.errors.length ? ` errors=${r.errors.length}` : "";
      // eslint-disable-next-line no-console
      console.log(`- ${r.name} (${r.collection}) ${updatedMsg}${skipped}${errs}`);
    }
  }

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("❌ migrateOrgIds failed:", error);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  });


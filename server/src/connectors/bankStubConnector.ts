import type { IntegrationConnector } from "./types";
import TransactionModel from "../models/transactionModel";
import { ensureProfileWithMigration, bumpTransactionMetadata, setProfileMutationSource } from "../services/profileService";
import { publishDomainEvent } from "../services/domainEvents";

// Adjusts transaction numerical polarity based on transaction direction type.
// Returns positive numbers for income transactions and negative numbers for expenses.
// Enforces standard accounting sign conventions across generated ledger entries.
const normalizeTransactionAmount = (amount: number, type: "income" | "expense" | "investment") => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

// Constant array of everyday spending category strings used for stub data generation.
// Cycles through common expense categories including groceries, utilities, and dining.
// Provides realistic distribution of simulated transactions for local development.
const CATEGORY_POOL = [
  "Groceries",
  "Dining Out",
  "Transport",
  "Utilities",
  "Rent",
  "Entertainment",
  "Health",
  "Shopping",
  "Subscriptions",
] as const;

// Computes a deterministic pseudo-random monetary amount from an integer sequence index.
// Combines modular base figures with cent offsets to produce non-round prices.
// Generates realistic spending totals for mock transaction batches.
const deterministicAmount = (index: number) => {
  const base = 12 + (index % 7) * 9;
  const cents = (index % 3) * 0.37;
  return Math.round((base + cents) * 100) / 100;
};

// Built-in synthetic banking integration connector for testing and demonstration workflows.
// Simulates batch transaction generation, performs bulk database upserts, and logs sync telemetry.
// Emits IntegrationSynced domain events to notify subscribers of updated account activity.
export const bankStubConnector: IntegrationConnector = {
  key: "bank_stub",
  catalog: {
    connector_key: "bank_stub",
    name: "Bank Connector (Stub)",
    category: "banking",
    supports_webhook: false,
    stub_mode: true,
  },
  sync: async (ctx, options) => {
    const requested = Math.max(1, Math.min(500, Math.floor(Number(options?.records_synced || 10))));
    const profile = await ensureProfileWithMigration({ orgId: ctx.orgId, userId: ctx.userId });

    const now = new Date();
    const docs = Array.from({ length: requested }).map((_, idx) => {
      const category = CATEGORY_POOL[idx % CATEGORY_POOL.length];
      const type = "expense" as const;
      const amount = normalizeTransactionAmount(deterministicAmount(idx + 1), type);
      const date = new Date(now.getTime() - idx * 24 * 60 * 60 * 1000);

      return {
        orgId: ctx.orgId,
        userId: ctx.userId,
        externalId: `integration:bank_stub:${ctx.syncRunId}:${idx}`.slice(0, 120),
        amount,
        category,
        description: `Bank sync: ${category}`,
        date,
        type,
        source: ctx.source,
      };
    });

    const ops = docs.map((doc) => ({
      updateOne: {
        filter: { orgId: doc.orgId, externalId: doc.externalId },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    }));

    let insertedCount = 0;
    if (ops.length > 0) {
      const result: any = await TransactionModel.bulkWrite(ops, { ordered: false });
      insertedCount = Number(result?.upsertedCount || 0);
      if (!Number.isFinite(insertedCount) || insertedCount < 0) {
        insertedCount = 0;
      }
    }

    bumpTransactionMetadata(profile, { deltaCount: insertedCount, at: now });
    setProfileMutationSource(profile, ctx.source);
    await profile.save();

    await publishDomainEvent({
      orgId: ctx.orgId,
      userId: ctx.userId,
      eventType: "IntegrationSynced",
      aggregateType: "integration",
      aggregateId: `bank_stub:${ctx.syncRunId}`,
      actionLinkId: ctx.source.action_link_id,
      requestId: ctx.requestId,
      payload: {
        connector_key: "bank_stub",
        records_synced: insertedCount,
        source: ctx.source,
      },
    });

    return {
      records_synced: insertedCount,
      metadata: {
        generated: docs.length,
        inserted: insertedCount,
        stub_mode: true,
      },
    };
  },
};

import { Types, PipelineStage } from "mongoose";
import TransactionModel from "../models/transactionModel";

export type SearchableType = "transaction" | "goal" | "debt" | "receipt" | "journal_entry";

export interface SearchResult {
  type: SearchableType;
  id: string;
  title: string;
  subtitle?: string;
  date: string;
  meta?: Record<string, unknown>;
}

export interface SearchParams {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  query: string;
  types?: SearchableType[];
  limit?: number;
  cursor?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  cursor?: string;
}

/**
 * Global search across multiple entity types.
 * Uses Mongo $text index for transactions and regex fallback for others.
 * Designed to be extended as new searchable collections are added.
 */
export async function globalSearch(params: SearchParams): Promise<SearchResponse> {
  const { orgId, userId, query, types, limit = 20, cursor } = params;
  const wantedTypes = types && types.length > 0 ? new Set(types) : null;
  const allResults: SearchResult[] = [];

  // --- Transactions (text index search) ---
  if (!wantedTypes || wantedTypes.has("transaction")) {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          orgId,
          userId,
          $text: { $search: query },
        },
      },
      { $sort: { score: { $meta: "textScore" }, date: -1 as const } },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          description: 1,
          category: 1,
          amount: 1,
          date: 1,
          type: 1,
          score: { $meta: "textScore" },
        },
      },
    ];

    if (cursor) {
      pipeline.splice(1, 0, {
        $match: { _id: { $lt: new Types.ObjectId(cursor) } },
      });
    }

    const txns = await TransactionModel.aggregate(pipeline);

    for (const t of txns) {
      allResults.push({
        type: "transaction",
        id: String(t._id),
        title: t.description || "Unnamed transaction",
        subtitle: `${t.type === "income" ? "+" : "-"}${Math.abs(t.amount).toFixed(2)} · ${t.category}`,
        date: new Date(t.date).toISOString(),
        meta: { amount: t.amount, category: t.category, transactionType: t.type, score: t.score },
      });
    }
  }

  // Future: add additional entity searches here (goals, debts, receipts, journal entries)
  // using the same pattern. Each block checks `wantedTypes`, queries, and pushes to allResults.

  // Sort by date descending across all types
  allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const limited = allResults.slice(0, limit);
  const nextCursor = limited.length === limit ? limited[limited.length - 1].id : undefined;

  return {
    results: limited,
    total: limited.length,
    cursor: nextCursor,
  };
}

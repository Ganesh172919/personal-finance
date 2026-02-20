import crypto from "crypto";
import mongoose from "mongoose";
import Papa from "papaparse";

import MerchantModel from "../models/merchantModel";
import TransactionModel from "../models/transactionModel";
import { HttpError } from "../middleware/httpError";
import type { MutationSource } from "../types/provenance";

const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const clampExternalId = (value: string) => value.trim().slice(0, 120);

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const normalizeMerchantName = (value: string) => {
  const trimmed = normalizeWhitespace(value).toLowerCase();
  const stripped = trimmed.replace(/[^a-z0-9 &.-]+/g, "");
  return stripped.trim().slice(0, 160);
};

const parseMoney = (rawValue: string) => {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  const parenNeg = /^\(.*\)$/.test(raw);
  const suffix = raw.replace(/^\(/, "").replace(/\)$/, "").trim().toLowerCase();
  const suffixIsDebit = suffix.endsWith("dr");
  const suffixIsCredit = suffix.endsWith("cr");
  const cleaned = raw
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/[$€£¥₹]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/(cr|dr)$/i, "");

  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num)) return null;

  const neg = parenNeg || cleaned.startsWith("-") || (suffixIsDebit && !suffixIsCredit);
  return neg ? -Math.abs(num) : num;
};

const parseDateToUtcMidday = (rawValue: string): Date | null => {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    const a = Number(us[1]);
    const b = Number(us[2]);
    const yRaw = Number(us[3]);
    const year = yRaw < 100 ? 2000 + yRaw : yRaw;
    const month = a > 12 && b <= 12 ? b : a;
    const day = a > 12 && b <= 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate(), 12, 0, 0));
};

const normalizeTransactionAmount = (amount: number, type: "income" | "expense" | "investment") => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

const normalizeTxType = (raw: string, amount: number): "income" | "expense" | "investment" => {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "income" || t === "expense" || t === "investment") return t;
  return amount >= 0 ? "income" : "expense";
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type CsvImportMapping = {
  amount: string;
  date: string;
  description?: string;
  category?: string;
  type?: string;
  merchant?: string;
};

export type CsvImportResult = {
  ok: true;
  import_id: string;
  file_name: string;
  parsed_rows: number;
  valid_rows: number;
  inserted: number;
  duplicates: number;
  merchants_touched: number;
  dry_run: boolean;
};

export const importTransactionsCsv = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  fileName: string;
  buffer: Buffer;
  mapping: CsvImportMapping;
  accountId?: mongoose.Types.ObjectId;
  requestId?: string;
  dryRun?: boolean;
  source: MutationSource;
  enforceLimit?: (validRows: number) => Promise<void>;
}): Promise<CsvImportResult> => {
  const text = params.buffer.toString("utf8");
  if (!text.trim()) {
    throw new HttpError(400, "EMPTY_FILE", "CSV file is empty");
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header: string) => String(header || "").trim(),
  });

  if (parsed.errors && parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new HttpError(400, "CSV_PARSE_FAILED", "Failed to parse CSV", {
      row: first.row,
      message: first.message,
      type: first.type,
      code: first.code,
    });
  }

  const rows = Array.isArray(parsed.data)
    ? parsed.data.filter((row: unknown): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    : [];
  const parsedRows = rows.length;

  const getCell = (row: Record<string, unknown>, column: string | undefined) => {
    if (!column) return "";
    return normalizeWhitespace(String(row[column] ?? ""));
  };

  const mapped = rows
    .map((row: Record<string, unknown>, idx: number) => {
      const amountRaw = getCell(row, params.mapping.amount);
      const dateRaw = getCell(row, params.mapping.date);
      const amountParsed = parseMoney(amountRaw);
      const dateParsed = parseDateToUtcMidday(dateRaw);

      if (amountParsed === null || !dateParsed) {
        return null;
      }

      const typeRaw = getCell(row, params.mapping.type);
      const type = normalizeTxType(typeRaw, amountParsed);

      const categoryRaw = getCell(row, params.mapping.category);
      const category = categoryRaw || "Other";

      const descriptionRaw = getCell(row, params.mapping.description);
      const merchantRaw = getCell(row, params.mapping.merchant);

      const description = descriptionRaw || merchantRaw || category || `Imported row ${idx + 1}`;
      const merchantName = merchantRaw || descriptionRaw || "";

      const amount = normalizeTransactionAmount(amountParsed, type);

      return {
        date: dateParsed,
        amount,
        type,
        category,
        description,
        merchantName,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const validRows = mapped.length;
  if (validRows === 0) {
    return {
      ok: true,
      import_id: "",
      file_name: params.fileName,
      parsed_rows: parsedRows,
      valid_rows: 0,
      inserted: 0,
      duplicates: 0,
      merchants_touched: 0,
      dry_run: Boolean(params.dryRun),
    };
  }

  const importId = sha256Hex(`${params.orgId.toString()}|${params.userId.toString()}|${Date.now()}|${params.fileName}`).slice(0, 12);

  const merchantNamesByNormalized = new Map<string, string>();
  for (const row of mapped) {
    const normalized = row.merchantName ? normalizeMerchantName(row.merchantName) : "";
    if (!normalized) continue;
    if (!merchantNamesByNormalized.has(normalized)) {
      merchantNamesByNormalized.set(normalized, row.merchantName.slice(0, 160));
    }
  }

  if (!params.dryRun && merchantNamesByNormalized.size > 0) {
    const merchantOps = Array.from(merchantNamesByNormalized.entries()).map(([normalizedName, name]) => ({
      updateOne: {
        filter: { orgId: params.orgId, normalizedName },
        update: {
          $setOnInsert: {
            orgId: params.orgId,
            name,
            normalizedName,
          },
        },
        upsert: true,
      },
    }));

    await MerchantModel.bulkWrite(merchantOps, { ordered: false });
  }

  const merchantsTouched = merchantNamesByNormalized.size;

  const merchants = merchantNamesByNormalized.size
    ? await MerchantModel.find({ orgId: params.orgId, normalizedName: { $in: Array.from(merchantNamesByNormalized.keys()) } })
        .select({ _id: 1, normalizedName: 1 })
        .lean()
    : [];
  const merchantIdByNormalized = new Map(merchants.map((m: any) => [String(m.normalizedName), m._id as mongoose.Types.ObjectId]));

  if (params.dryRun) {
    return {
      ok: true,
      import_id: importId,
      file_name: params.fileName,
      parsed_rows: parsedRows,
      valid_rows: validRows,
      inserted: 0,
      duplicates: 0,
      merchants_touched: merchantsTouched,
      dry_run: true,
    };
  }

  const accountId = params.accountId;

  const deduped = new Map<string, any>();
  for (const row of mapped) {
    const ymd = row.date.toISOString().slice(0, 10);
    const keyParts = [
      "transactions_csv",
      params.orgId.toString(),
      accountId ? accountId.toString() : "",
      ymd,
      String(row.amount),
      row.type,
      normalizeWhitespace(row.description).toLowerCase(),
    ];
    const externalId = clampExternalId(`csv:${sha256Hex(keyParts.join("|")).slice(0, 64)}`);
    if (deduped.has(externalId)) {
      continue;
    }

    const normalizedMerchant = row.merchantName ? normalizeMerchantName(row.merchantName) : "";
    const merchantId = normalizedMerchant ? merchantIdByNormalized.get(normalizedMerchant) : undefined;

    deduped.set(externalId, {
      orgId: params.orgId,
      userId: params.userId,
      externalId,
      accountId,
      merchantId,
      amount: row.amount,
      category: row.category,
      description: row.description,
      date: row.date,
      type: row.type,
      source: params.source,
    });
  }

  const txOps = Array.from(deduped.values()).map((doc) => ({
    updateOne: {
      filter: { orgId: params.orgId, externalId: doc.externalId },
      update: { $setOnInsert: doc },
      upsert: true,
    },
  }));

  if (txOps.length === 0) {
    return {
      ok: true,
      import_id: importId,
      file_name: params.fileName,
      parsed_rows: parsedRows,
      valid_rows: validRows,
      inserted: 0,
      duplicates: validRows,
      merchants_touched: merchantsTouched,
      dry_run: false,
    };
  }

  if (params.enforceLimit) {
    await params.enforceLimit(txOps.length);
  }

  let inserted = 0;
  try {
    const result: any = await TransactionModel.bulkWrite(txOps, { ordered: false });
    inserted = Number(result?.upsertedCount || 0);
    if (!Number.isFinite(inserted) || inserted < 0) {
      inserted = 0;
    }
  } catch (error: any) {
    if (error?.code === 11000) {
      // Ignore duplicates if raced; inserted count will be approximate.
      inserted = 0;
    } else {
      throw error;
    }
  }

  const duplicates = Math.max(0, validRows - inserted);

  // Heuristic: if everything was duplicate, verify by sampling a few externalIds to avoid returning 0 inserted on duplicate-key bulkWrite errors.
  if (inserted === 0 && duplicates === validRows) {
    const sampleExternalIds = txOps.slice(0, Math.min(10, txOps.length)).map((op: any) => String(op.updateOne.filter.externalId));
    const existing = sampleExternalIds.length
      ? await TransactionModel.countDocuments({ orgId: params.orgId, externalId: { $in: sampleExternalIds } })
      : 0;
    if (existing > 0) {
      inserted = 0;
    }
  }

  return {
    ok: true,
    import_id: importId,
    file_name: params.fileName,
    parsed_rows: parsedRows,
    valid_rows: validRows,
    inserted,
    duplicates: Math.max(0, validRows - inserted),
    merchants_touched: merchantsTouched,
    dry_run: false,
  };
};

export const lookupMerchantsByQuery = async (params: {
  orgId: mongoose.Types.ObjectId;
  q: string;
  limit?: number;
}) => {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(params.limit || 20))));
  const needle = escapeRegExp(params.q.trim());
  const rows = await MerchantModel.find({
    orgId: params.orgId,
    $or: [
      { name: { $regex: needle, $options: "i" } },
      { normalizedName: { $regex: needle, $options: "i" } },
      { aliases: { $regex: needle, $options: "i" } },
    ],
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select({ _id: 1, name: 1, normalizedName: 1, categoryDefault: 1 })
    .lean();
  return rows.map((row: any) => ({
    id: String(row._id),
    name: String(row.name),
    normalized_name: String(row.normalizedName),
    category_default: row.categoryDefault ? String(row.categoryDefault) : null,
  }));
};

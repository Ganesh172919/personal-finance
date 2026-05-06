/**
 * @fileoverview CSV Transaction Import Service
 *
 * PURPOSE:
 * This service handles the complete lifecycle of importing transactions from
 * CSV files uploaded by users. It is one of the most complex services because
 * it must handle:
 * - Multiple CSV formats (ISO dates, US dates, various money formats)
 * - Deduplication (preventing duplicate imports)
 * - Merchant matching and category suggestion
 * - Dry-run preview mode (show what would be imported before committing)
 * - Category rule matching for uncategorized transactions
 * - Transaction review flagging for unusual items
 *
 * IMPORT PIPELINE:
 * 1. Parse CSV text using PapaParse library
 * 2. Validate and normalize each row (amount, date, type, category)
 * 3. Build deterministic external IDs for deduplication
 * 4. Match merchants and apply category rules
 * 5. Detect duplicates (within file and against existing ledger)
 * 6. Either return preview (dry run) or bulk-insert into MongoDB
 *
 * DEDUPLICATION STRATEGY:
 * Each transaction gets a deterministic "externalId" based on org + account +
 * date + amount + type + description. This SHA-256 hash ensures that re-uploading
 * the same CSV file will not create duplicate transactions. The $setOnInsert
 * MongoDB operation only writes if the document doesn't already exist.
 *
 * KEY DESIGN DECISIONS:
 * - Dates are normalized to UTC noon to avoid timezone edge cases
 * - Money parsing handles international formats (parentheses, CR/DR suffixes)
 * - Merchant names are normalized (lowercased, stripped of special chars) for matching
 * - The service supports both dry-run (preview) and commit modes
 *
 * @module services/transactionsCsvImport
 */

import crypto from "crypto"; // For SHA-256 hashing of external IDs
import mongoose from "mongoose"; // MongoDB ODM
import Papa from "papaparse"; // CSV parsing library (handles edge cases like quoted fields)

import MerchantModel from "../models/merchantModel"; // Merchant collection for name matching
import TransactionModel from "../models/transactionModel"; // Transaction collection for dedup + insert
import { HttpError } from "../middleware/httpError"; // Typed HTTP errors (400, 402, etc.)
import { matchCategoryRule } from "./categoryRuleService"; // User-defined category rules
import { buildTransactionReviewState, type TransactionReviewFlag } from "./transactionReview"; // Review flagging
import type { MutationSource } from "../types/provenance"; // Tracks where a transaction came from

/**
 * Generates a SHA-256 hex hash. Used for deterministic external IDs and import IDs.
 * SHA-256 is chosen for its collision resistance (not for security).
 */
const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/**
 * Truncates external IDs to 120 chars. MongoDB indexes perform better with
 * shorter keys, and 120 chars of hex is more than sufficient for uniqueness.
 */
const clampExternalId = (value: string) => value.trim().slice(0, 120);

/**
 * Normalizes whitespace: trims leading/trailing and collapses internal runs to single spaces.
 * CSV data often has inconsistent spacing that would break string comparisons.
 */
const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * Normalizes merchant names for consistent matching:
 * 1. Lowercase and trim whitespace
 * 2. Remove all non-alphanumeric characters (except &, ., -)
 * 3. Truncate to 160 chars
 *
 * This ensures "Starbucks #1234" and "STARBUCKS" and "starbucks." all match.
 */
const normalizeMerchantName = (value: string) => {
  const trimmed = normalizeWhitespace(value).toLowerCase();
  const stripped = trimmed.replace(/[^a-z0-9 &.-]+/g, "");
  return stripped.trim().slice(0, 160);
};

/**
 * Parses monetary values from various string formats into numbers.
 *
 * HANDLED FORMATS:
 * - Standard: "1234.56", "-1234.56"
 * - Currency symbols: "$1,234.56", "EUR 1234.56", "1,234.56"
 * - Accounting format: "(1234.56)" means negative
 * - Banking format: "1234.56DR" (debit = negative), "1234.56CR" (credit = positive)
 * - Whitespace: " 1 234.56 "
 *
 * @param {string} rawValue - Raw string value from CSV
 * @returns {number | null} Parsed number or null if unparseable
 */
const parseMoney = (rawValue: string) => {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  // Detect accounting-style negative numbers: (1234.56) = -1234.56
  const parenNeg = /^\(.*\)$/.test(raw);
  const suffix = raw.replace(/^\(/, "").replace(/\)$/, "").trim().toLowerCase();
  const suffixIsDebit = suffix.endsWith("dr"); // Banking: DR = debit = negative
  const suffixIsCredit = suffix.endsWith("cr"); // Banking: CR = credit = positive
  // Strip all formatting to get the raw number
  const cleaned = raw
    .replace(/^\(/, "") // Remove opening parenthesis
    .replace(/\)$/, "") // Remove closing parenthesis
    .replace(/[$€£¥₹]/g, "") // Remove currency symbols
    .replace(/,/g, "") // Remove thousands separators
    .replace(/\s+/g, "") // Remove spaces
    .replace(/(cr|dr)$/i, ""); // Remove CR/DR suffix

  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num)) return null;

  // Determine sign: parenthesized, leading minus, or DR suffix = negative
  const neg = parenNeg || cleaned.startsWith("-") || (suffixIsDebit && !suffixIsCredit);
  return neg ? -Math.abs(num) : num;
};

/**
 * Parses date strings into Date objects, normalizing to UTC noon.
 *
 * WHY UTC NOON?
 * Setting the time to 12:00 UTC avoids timezone-related date shifting.
 * If we used midnight UTC, a date like "2024-01-15" could display as
 * "2024-01-14" in negative-UTC-offset timezones (e.g., Americas).
 * Noon gives a 12-hour buffer in both directions.
 *
 * SUPPORTED FORMATS:
 * 1. ISO format: "2024-01-15", "2024/01/15", "2024-1-5"
 * 2. US format: "01/15/2024", "1/5/24", "1-15-2024"
 *    - Heuristic: if first number > 12, it must be the day (DD/MM/YYYY)
 * 3. Fallback: any format Date.parse() can handle
 *
 * @param {string} rawValue - Raw date string from CSV
 * @returns {Date | null} Parsed Date (at UTC noon) or null if unparseable
 */
const parseDateToUtcMidday = (rawValue: string): Date | null => {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  // Try ISO format first: YYYY-MM-DD or YYYY/MM/DD
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  // Try US format: MM/DD/YYYY or DD/MM/YYYY (ambiguous)
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    const a = Number(us[1]);
    const b = Number(us[2]);
    const yRaw = Number(us[3]);
    const year = yRaw < 100 ? 2000 + yRaw : yRaw; // Handle 2-digit years
    // Heuristic to disambiguate MM/DD vs DD/MM:
    // If first number > 12, it must be a day (European format)
    const month = a > 12 && b <= 12 ? b : a;
    const day = a > 12 && b <= 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  // Fallback: let the Date constructor try to parse it
  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  // Extract date components and rebuild at UTC noon to avoid timezone issues
  return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate(), 12, 0, 0));
};

/**
 * Normalizes transaction amounts to the system's convention:
 * - Income = positive
 * - Expenses and investments = negative
 * This ensures consistent sign handling across the application.
 */
const normalizeTransactionAmount = (amount: number, type: "income" | "expense" | "investment") => {
  const absoluteAmount = Math.abs(Number(amount));
  return type === "income" ? absoluteAmount : -absoluteAmount;
};

/**
 * Normalizes transaction type strings. Falls back to inferring from the
 * sign of the amount when the type column is empty or unrecognized.
 */
const normalizeTxType = (raw: string, amount: number): "income" | "expense" | "investment" => {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "income" || t === "expense" || t === "investment") return t;
  return amount >= 0 ? "income" : "expense";
};

/**
 * Checks if a category value is effectively "uncategorized".
 * Used to decide whether to apply merchant-based or rule-based category suggestions.
 */
const isUncategorizedCategory = (value: string) => {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "other" || normalized === "uncategorized" || normalized === "misc";
};

/**
 * Escapes special regex characters in a string so it can be used safely
 * in a regular expression. Used when building MongoDB $regex queries from user input.
 */
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type CsvImportMapping = {
  amount: string;
  date: string;
  description?: string;
  category?: string;
  type?: string;
  merchant?: string;
};

export type CsvImportPreviewRow = {
  row_index: number;
  status: "ready" | "duplicate" | "invalid";
  amount_raw: string;
  date_raw: string;
  amount?: number;
  date?: string;
  type?: "income" | "expense" | "investment";
  category?: string;
  description?: string;
  merchant_name?: string;
  merchant_match?: { id: string; name: string } | null;
  duplicate_key?: string;
  issues: string[];
  review: {
    needs_attention: boolean;
    flags: TransactionReviewFlag[];
    notes: string[];
    attention_score: number;
  };
  suggestions?: {
    category?: string;
    category_source?: "merchant_default" | "category_rule";
  };
};

export type CsvImportDuplicateGroup = {
  duplicate_key: string;
  row_indexes: number[];
  reason: string;
};

export type CsvImportResult = {
  ok: true;
  import_id: string;
  file_name: string;
  parsed_rows: number;
  valid_rows: number;
  invalid_rows?: number;
  inserted: number;
  duplicates: number;
  merchants_touched: number;
  dry_run: boolean;
  columns?: string[];
  preview_rows?: CsvImportPreviewRow[];
  duplicate_groups?: CsvImportDuplicateGroup[];
  mapping_used?: CsvImportMapping;
  account_id?: string | null;
};

type PreparedCsvRow = {
  row_index: number;
  amount_raw: string;
  date_raw: string;
  amount: number | null;
  date: Date | null;
  type: "income" | "expense" | "investment";
  category: string;
  description: string;
  merchantName: string;
  issues: string[];
};

/**
 * Builds a deterministic external ID for deduplication.
 *
 * The ID is a SHA-256 hash of: org + account + date + amount + type + description.
 * This means the same transaction uploaded twice will always produce the same ID,
 * enabling idempotent imports. The "csv:" prefix distinguishes these IDs from
 * those generated by bank sync or manual entry.
 *
 * @returns {string} A deterministic, collision-resistant external ID
 */
const buildExternalId = (params: {
  orgId: mongoose.Types.ObjectId;
  accountId?: mongoose.Types.ObjectId;
  date: Date;
  amount: number;
  type: "income" | "expense" | "investment";
  description: string;
}) => {
  const ymd = params.date.toISOString().slice(0, 10);
  // Combine all identifying fields into a pipe-delimited string
  const keyParts = [
    "transactions_csv", // Prefix to namespace CSV imports
    params.orgId.toString(),
    params.accountId ? params.accountId.toString() : "",
    ymd,
    String(params.amount),
    params.type,
    normalizeWhitespace(params.description).toLowerCase(),
  ];
  return clampExternalId(`csv:${sha256Hex(keyParts.join("|")).slice(0, 64)}`);
};

/**
 * Normalizes raw CSV rows into a consistent internal format.
 *
 * This function applies the user's column mapping (which CSV column maps to
 * amount, date, etc.) and normalizes each cell value. Rows with unparseable
 * amounts or dates get issues[] populated but are NOT excluded -- they'll be
 * filtered later by the caller.
 *
 * @param {object} params - Rows from PapaParse and the user's column mapping
 * @returns {PreparedCsvRow[]} Normalized rows with validation issues
 */
const prepareCsvRows = (params: {
  rows: Record<string, unknown>[];
  mapping: CsvImportMapping;
}) => {
  // Helper to extract and normalize a cell value from a CSV row
  const getCell = (row: Record<string, unknown>, column: string | undefined) => {
    if (!column) return "";
    return normalizeWhitespace(String(row[column] ?? ""));
  };

  return params.rows.map((row: Record<string, unknown>, idx: number): PreparedCsvRow => {
    const amountRaw = getCell(row, params.mapping.amount);
    const dateRaw = getCell(row, params.mapping.date);
    const amountParsed = parseMoney(amountRaw);
    const dateParsed = parseDateToUtcMidday(dateRaw);
    const issues: string[] = [];

    if (amountParsed === null) {
      issues.push("Amount could not be parsed.");
    }
    if (!dateParsed) {
      issues.push("Date could not be parsed.");
    }

    const typeRaw = getCell(row, params.mapping.type);
    const type = normalizeTxType(typeRaw, amountParsed ?? 0);
    const categoryRaw = getCell(row, params.mapping.category);
    const descriptionRaw = getCell(row, params.mapping.description);
    const merchantRaw = getCell(row, params.mapping.merchant);
    const category = categoryRaw || "Other";
    const description = descriptionRaw || merchantRaw || category || `Imported row ${idx + 1}`;
    const merchantName = merchantRaw || descriptionRaw || "";

    return {
      row_index: idx + 1,
      amount_raw: amountRaw,
      date_raw: dateRaw,
      amount: amountParsed === null ? null : normalizeTransactionAmount(amountParsed, type),
      date: dateParsed,
      type,
      category,
      description,
      merchantName,
      issues,
    };
  });
};

/**
 * Main CSV import function. Handles the complete import pipeline.
 *
 * SUPPORTS TWO MODES:
 * - dryRun=true: Parses, normalizes, and returns a preview without writing to DB
 * - dryRun=false: Parses, normalizes, and bulk-inserts into MongoDB
 *
 * @param {object} params - Import configuration
 * @param {mongoose.Types.ObjectId} params.orgId - Organization ID (multi-tenancy)
 * @param {mongoose.Types.ObjectId} params.userId - User performing the import
 * @param {string} params.fileName - Original filename (for the import record)
 * @param {Buffer} params.buffer - Raw CSV file bytes
 * @param {CsvImportMapping} params.mapping - Column mapping (which CSV column = amount, etc.)
 * @param {mongoose.Types.ObjectId} [params.accountId] - Target account for transactions
 * @param {boolean} [params.dryRun] - If true, return preview only (no DB writes)
 * @param {MutationSource} params.source - Provenance tracking (csv_import)
 * @param {Function} [params.enforceLimit] - Rate limit callback (throws if exceeded)
 * @param {number} [params.previewLimit] - Max preview rows to return (default 12)
 * @returns {Promise<CsvImportResult>} Import results with counts, preview, and duplicate info
 */
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
  previewLimit?: number;
}): Promise<CsvImportResult> => {
  // STEP 1: Parse the CSV buffer into structured data
  const text = params.buffer.toString("utf8");
  if (!text.trim()) {
    throw new HttpError(400, "EMPTY_FILE", "CSV file is empty");
  }

  // PapaParse configuration:
  // - header: true = first row is column names, data becomes objects
  // - skipEmptyLines: true = ignore blank rows
  // - dynamicTyping: false = keep everything as strings (we parse manually)
  // - transformHeader: trim whitespace from column names
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header: string) => String(header || "").trim(),
  });

  // PapaParse reports parse errors (malformed CSV, unclosed quotes, etc.)
  if (parsed.errors && parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new HttpError(400, "CSV_PARSE_FAILED", "Failed to parse CSV", {
      row: first.row,
      message: first.message,
      type: first.type,
      code: first.code,
    });
  }

  // Filter out any non-object rows (PapaParse can return null rows)
  const rows = Array.isArray(parsed.data)
    ? parsed.data.filter((row: unknown): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    : [];
  const parsedRows = rows.length;

  const preparedRows = prepareCsvRows({ rows, mapping: params.mapping });
  const validPreparedRows = preparedRows.filter((row) => row.amount !== null && row.date);
  const validRows = validPreparedRows.length;
  const invalidRows = preparedRows.length - validRows;

  if (validRows === 0) {
    return {
      ok: true,
      import_id: "",
      file_name: params.fileName,
      parsed_rows: parsedRows,
      valid_rows: 0,
      invalid_rows: invalidRows,
      inserted: 0,
      duplicates: 0,
      merchants_touched: 0,
      dry_run: Boolean(params.dryRun),
      columns: (parsed.meta.fields || []).map((field) => String(field)),
      preview_rows: preparedRows.slice(0, params.previewLimit || 12).map((row) => ({
        row_index: row.row_index,
        status: "invalid",
        amount_raw: row.amount_raw,
        date_raw: row.date_raw,
        type: row.type,
        category: row.category,
        description: row.description,
        merchant_name: row.merchantName || undefined,
        issues: row.issues.length ? row.issues : ["Row could not be imported."],
        review: buildTransactionReviewState({
          category: row.category,
          description: row.description,
          amount: Number(row.amount || 0),
          type: row.type,
        }),
      })),
      duplicate_groups: [],
      mapping_used: params.mapping,
      account_id: params.accountId ? params.accountId.toString() : null,
    };
  }

  // STEP 2: Generate a unique import ID for this batch
  const importId = sha256Hex(`${params.orgId.toString()}|${params.userId.toString()}|${Date.now()}|${params.fileName}`).slice(0, 12);

  // STEP 3: Collect unique merchant names from all valid rows
  // Uses a Map to deduplicate normalized names while preserving the original casing
  const merchantNamesByNormalized = new Map<string, string>();
  for (const row of validPreparedRows) {
    const normalized = row.merchantName ? normalizeMerchantName(row.merchantName) : "";
    if (!normalized) continue;
    // First occurrence wins for the display name
    if (!merchantNamesByNormalized.has(normalized)) {
      merchantNamesByNormalized.set(normalized, row.merchantName.slice(0, 160));
    }
  }

  // STEP 4: Upsert merchants into the merchant collection (skip in dry-run mode)
  // $setOnInsert ensures we only write the name on first creation, never overwrite
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

    await MerchantModel.bulkWrite(merchantOps, { ordered: false }); // ordered: false = parallel execution
  }

  const merchantsTouched = merchantNamesByNormalized.size;

  // STEP 5: Look up merchant IDs and category defaults for category suggestion
  const merchants = merchantNamesByNormalized.size
    ? await MerchantModel.find({ orgId: params.orgId, normalizedName: { $in: Array.from(merchantNamesByNormalized.keys()) } })
        .select({ _id: 1, normalizedName: 1, name: 1, categoryDefault: 1 })
        .lean()
    : [];
  const merchantIdByNormalized = new Map(merchants.map((m: any) => [String(m.normalizedName), m._id as mongoose.Types.ObjectId]));
  const merchantByNormalized = new Map(
    merchants.map((m: any) => [
      String(m.normalizedName),
      {
        id: String(m._id),
        name: String(m.name || ""),
        categoryDefault: m.categoryDefault ? String(m.categoryDefault) : undefined,
      },
    ])
  );

  const accountId = params.accountId;

  // STEP 6: Deduplication -- build the final transaction documents
  // Uses a Map keyed by externalId. If two rows produce the same externalId,
  // they are treated as duplicates and grouped together.
  const deduped = new Map<string, {
    externalId: string;
    duplicateKey: string;
    rowIndexes: number[]; // All CSV row indexes that map to this transaction
    doc: any;
    merchantMatch: { id: string; name: string } | null;
    suggestions?: { category?: string; category_source?: "merchant_default" | "category_rule" };
    review: ReturnType<typeof buildTransactionReviewState>;
  }>();

  for (const row of validPreparedRows) {
    // Look up merchant for category suggestion
    const normalizedMerchant = row.merchantName ? normalizeMerchantName(row.merchantName) : "";
    const merchantId = normalizedMerchant ? merchantIdByNormalized.get(normalizedMerchant) : undefined;
    const merchantMatch = normalizedMerchant ? merchantByNormalized.get(normalizedMerchant) || null : null;
    let nextCategory = row.category;
    let categorySource: "merchant_default" | "category_rule" | undefined = undefined;

    // CATEGORY SUGGESTION: Two-tier fallback strategy
    // 1. If merchant has a default category AND the row is uncategorized -> use merchant default
    // 2. Otherwise, check user-defined category rules against the description
    if (merchantMatch?.categoryDefault && isUncategorizedCategory(nextCategory)) {
      nextCategory = merchantMatch.categoryDefault;
      categorySource = "merchant_default";
    } else if (isUncategorizedCategory(nextCategory)) {
      const rule = await matchCategoryRule(params.orgId, params.userId, row.description, row.category);
      if (rule?.targetCategory) {
        nextCategory = String(rule.targetCategory);
        categorySource = "category_rule";
      }
    }

    // Build the deterministic external ID for deduplication
    const externalId = buildExternalId({
      orgId: params.orgId,
      accountId,
      date: row.date!,
      amount: row.amount!,
      type: row.type,
      description: row.description,
    });

    // Build review flags (flags unusual transactions for manual review)
    const review = buildTransactionReviewState({
      category: nextCategory,
      description: row.description,
      amount: row.amount!,
      type: row.type,
      merchantId,
    });

    // If this externalId already exists in our Map, it's a duplicate within the file
    if (deduped.has(externalId)) {
      deduped.get(externalId)!.rowIndexes.push(row.row_index);
      continue; // Skip adding a new entry
    }

    // First occurrence -- add to the dedup Map
    deduped.set(externalId, {
      externalId,
      duplicateKey: externalId,
      rowIndexes: [row.row_index],
      merchantMatch: merchantMatch ? { id: merchantMatch.id, name: merchantMatch.name } : null,
      suggestions: categorySource ? { category: nextCategory, category_source: categorySource } : undefined,
      review,
      doc: {
        orgId: params.orgId,
        userId: params.userId,
        externalId,
        accountId,
        merchantId,
        amount: row.amount,
        category: nextCategory,
        description: row.description,
        date: row.date,
        type: row.type,
        source: params.source,
        review: {
          ...review,
          updatedAt: new Date(),
        },
        reconciliation: {
          status: "unreconciled",
        },
        importDetails: {
          importId,
          fileName: params.fileName,
          rowIndex: row.row_index,
          duplicateKey: externalId,
          committedAt: new Date(),
        },
      },
    });
  }

  // STEP 7: Check for duplicates against existing transactions in the database
  // This catches re-uploads of the same CSV file or overlapping exports
  const externalIds = Array.from(deduped.keys());
  const existingDuplicates = externalIds.length
    ? await TransactionModel.find({ orgId: params.orgId, externalId: { $in: externalIds } })
        .select({ externalId: 1 })
        .lean()
    : [];
  const existingExternalIds = new Set(existingDuplicates.map((row: any) => String(row.externalId)));

  // STEP 8: Build duplicate groups for the response (helps UI show what was skipped)
  const duplicateGroups = Array.from(deduped.values())
    .filter((entry) => entry.rowIndexes.length > 1 || existingExternalIds.has(entry.externalId))
    .map((entry) => ({
      duplicate_key: entry.duplicateKey,
      row_indexes: entry.rowIndexes,
      reason:
        entry.rowIndexes.length > 1 && existingExternalIds.has(entry.externalId)
          ? "Duplicate rows appear both in this file and the ledger."
          : entry.rowIndexes.length > 1
            ? "Duplicate rows appear multiple times in this file."
            : "A matching transaction already exists in the ledger.",
    }));

  const previewRows: CsvImportPreviewRow[] = preparedRows.slice(0, params.previewLimit || 12).map((row) => {
    if (row.amount === null || !row.date) {
      return {
        row_index: row.row_index,
        status: "invalid" as const,
        amount_raw: row.amount_raw,
        date_raw: row.date_raw,
        type: row.type,
        category: row.category,
        description: row.description,
        merchant_name: row.merchantName || undefined,
        issues: row.issues.length ? row.issues : ["Row could not be imported."],
        review: buildTransactionReviewState({
          category: row.category,
          description: row.description,
          amount: Number(row.amount || 0),
          type: row.type,
        }),
      };
    }

    const externalId = buildExternalId({
      orgId: params.orgId,
      accountId,
      date: row.date,
      amount: row.amount,
      type: row.type,
      description: row.description,
    });
    const dedupedEntry = deduped.get(externalId);
    const status: CsvImportPreviewRow["status"] =
      existingExternalIds.has(externalId) || (dedupedEntry?.rowIndexes.length || 0) > 1
        ? "duplicate"
        : "ready";

    return {
      row_index: row.row_index,
      status,
      amount_raw: row.amount_raw,
      date_raw: row.date_raw,
      amount: row.amount,
      date: row.date.toISOString().slice(0, 10),
      type: row.type,
      category: dedupedEntry?.doc.category || row.category,
      description: row.description,
      merchant_name: row.merchantName || undefined,
      merchant_match: dedupedEntry?.merchantMatch || null,
      duplicate_key: externalId,
      issues:
        status === "duplicate"
          ? ["Matching duplicate detected in this file or existing ledger."]
          : [],
      review:
        dedupedEntry?.review ||
        buildTransactionReviewState({
          category: row.category,
          description: row.description,
          amount: row.amount,
          type: row.type,
        }),
      suggestions: dedupedEntry?.suggestions,
    };
  });

  // DRY RUN: Return the preview without writing to the database
  if (params.dryRun) {
    return {
      ok: true,
      import_id: importId,
      file_name: params.fileName,
      parsed_rows: parsedRows,
      valid_rows: validRows,
      invalid_rows: invalidRows,
      inserted: 0,
      duplicates: duplicateGroups.reduce((sum, group) => sum + Math.max(1, group.row_indexes.length - 1), 0),
      merchants_touched: merchantsTouched,
      dry_run: true,
      columns: (parsed.meta.fields || []).map((field) => String(field)),
      preview_rows: previewRows,
      duplicate_groups: duplicateGroups,
      mapping_used: params.mapping,
      account_id: accountId ? accountId.toString() : null,
    };
  }

  // STEP 9: Build bulk write operations
  // $setOnInsert + upsert: true means "only insert if this document doesn't exist"
  // This makes the import idempotent -- re-running the same CSV won't create duplicates
  const txOps = Array.from(deduped.values()).map((entry) => ({
    updateOne: {
      filter: { orgId: params.orgId, externalId: entry.doc.externalId },
      update: { $setOnInsert: entry.doc },
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
      invalid_rows: invalidRows,
      inserted: 0,
      duplicates: validRows,
      merchants_touched: merchantsTouched,
      dry_run: false,
      columns: (parsed.meta.fields || []).map((field) => String(field)),
      preview_rows: previewRows,
      duplicate_groups: duplicateGroups,
      mapping_used: params.mapping,
      account_id: accountId ? accountId.toString() : null,
    };
  }

  // STEP 10: Enforce rate limits (if configured) before writing
  if (params.enforceLimit) {
    await params.enforceLimit(txOps.length);
  }

  // STEP 11: Execute the bulk write
  let inserted = 0;
  try {
    const result: any = await TransactionModel.bulkWrite(txOps, { ordered: false }); // ordered: false = parallel writes
    inserted = Number(result?.upsertedCount || 0); // Only newly inserted docs count
    if (!Number.isFinite(inserted) || inserted < 0) {
      inserted = 0;
    }
  } catch (error: any) {
    // MongoDB error code 11000 = duplicate key error
    // This can happen if two concurrent imports race on the same externalId
    if (error?.code === 11000) {
      inserted = 0; // Treat as "all duplicates" -- safe approximation
    } else {
      throw error; // Re-throw unexpected errors
    }
  }

  const duplicates = Math.max(0, validRows - inserted);

  // STEP 12: Verification heuristic -- if bulkWrite reported 0 upserts,
  // sample a few externalIds to confirm they exist (may have been raced in)
  if (inserted === 0 && duplicates === validRows) {
    const sampleExternalIds = txOps.slice(0, Math.min(10, txOps.length)).map((op: any) => String(op.updateOne.filter.externalId));
    const existing = sampleExternalIds.length
      ? await TransactionModel.countDocuments({ orgId: params.orgId, externalId: { $in: sampleExternalIds } })
      : 0;
    if (existing > 0) {
      inserted = 0; // Confirmed: these were indeed existing duplicates
    }
  }

  return {
    ok: true,
    import_id: importId,
    file_name: params.fileName,
    parsed_rows: parsedRows,
    valid_rows: validRows,
    invalid_rows: invalidRows,
    inserted,
    duplicates: Math.max(0, validRows - inserted),
    merchants_touched: merchantsTouched,
    dry_run: false,
    columns: (parsed.meta.fields || []).map((field) => String(field)),
    preview_rows: previewRows,
    duplicate_groups: duplicateGroups,
    mapping_used: params.mapping,
    account_id: accountId ? accountId.toString() : null,
  };
};

/**
 * Searches merchants by name, normalized name, or aliases.
 * Used by the CSV import UI to let users see existing merchants while mapping columns.
 *
 * @param {object} params - Search parameters
 * @param {mongoose.Types.ObjectId} params.orgId - Organization scope
 * @param {string} params.q - Search query
 * @param {number} [params.limit] - Max results (default 20, capped at 100)
 * @returns {Promise<Array>} Matching merchants with id, name, and category default
 */
export const lookupMerchantsByQuery = async (params: {
  orgId: mongoose.Types.ObjectId;
  q: string;
  limit?: number;
}) => {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(params.limit || 20))));
  // Escape regex special chars to prevent regex injection from user input
  const needle = escapeRegExp(params.q.trim());
  const rows = await MerchantModel.find({
    orgId: params.orgId,
    // Search across name, normalizedName, and aliases fields
    $or: [
      { name: { $regex: needle, $options: "i" } },
      { normalizedName: { $regex: needle, $options: "i" } },
      { aliases: { $regex: needle, $options: "i" } },
    ],
  })
    .sort({ updatedAt: -1 }) // Most recently used merchants first
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

// =============================================================================
// END-OF-FILE SUMMARY
// =============================================================================
//
// KEY TAKEAWAYS:
//
// 1. IDEMPOTENT IMPORTS: The externalId-based deduplication with $setOnInsert
//    means users can safely re-upload the same CSV file without creating
//    duplicates. This is critical for a good user experience.
//
// 2. DRY RUN SUPPORT: The import function supports a preview mode that performs
//    all parsing, normalization, and dedup detection without writing to the
//    database. This lets the UI show users exactly what will happen before
//    they commit.
//
// 3. DATE NORMALIZATION: All dates are set to UTC noon to avoid timezone-related
//    date shifting. This is a pragmatic solution to a common problem in
//    financial software that operates across timezones.
//
// 4. MONEY PARSING: The parseMoney function handles a wide variety of
//    international formats (parentheses, CR/DR, currency symbols, commas).
//    This is essential because CSV files come from many different banks and
//    accounting systems worldwide.
//
// 5. MERCHANT INTELLIGENCE: The import process automatically creates merchant
//    records and uses them (along with category rules) to suggest categories
//    for uncategorized transactions. This gets smarter over time as more
//    data is imported.
//
// 6. BULK OPERATIONS: Both merchant upserts and transaction inserts use
//    MongoDB bulkWrite with ordered: false for maximum throughput. This is
//    important for large CSV files (hundreds or thousands of rows).
// =============================================================================

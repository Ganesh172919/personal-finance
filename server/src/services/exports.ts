import { once } from "events";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";

import ExportJobModel, { type ExportJobType } from "../models/exportJobModel";
import OrganizationModel from "../models/organizationModel";
import TransactionModel, { type TransactionType } from "../models/transactionModel";
import UserModel from "../models/userModel";
import { HttpError } from "../middleware/httpError";
import { deleteGridFsFile, openGridFsUploadStream } from "./gridfs";

// Represents the persisted binary file output of a completed export job.
// Captures GridFS file identifier, target filename, MIME content type, and byte size.
// Returned by artifact generation helpers to update export job records.
type ExportArtifact = {
  fileId: mongoose.Types.ObjectId;
  filename: string;
  contentType: string;
  bytes: number;
};

// Coerces an arbitrary unknown value safely into a standard string representation.
// Translates null and undefined values cleanly into empty string literals.
// Avoids runtime TypeError exceptions when handling unvalidated input fields.
const safeString = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));

// Formats an arbitrary string or value into a compliant CSV cell string.
// Encapsulates cells containing commas, quotes, or line breaks in double quotes.
// Escapes nested quotation marks by doubling them per RFC 4180 standards.
const toCsvCell = (value: unknown) => {
  const raw = safeString(value);
  if (raw === "") return "";
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

// Extracts the YYYY-MM-DD calendar date string from a Date instance.
// Formats timestamps consistently for inclusion in export artifact file names.
// Facilitates clean date sorting and standardized filename generation.
const toDayKey = (value: Date) => value.toISOString().slice(0, 10);

// Safely parses an unknown string representation into a valid JavaScript Date.
// Validates time value finiteness to ensure parsed dates are completely valid.
// Returns undefined when input is missing, empty, or non-parseable.
const parseDateOrUndefined = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
};

// Parses a YYYY-MM period key string into UTC start and end Date boundaries.
// Validates numeric month ranges and throws HTTP 400 errors on invalid formats.
// Delivers exact date range boundaries for monthly aggregation queries.
const parsePeriodKey = (value: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new HttpError(400, "INVALID_PERIOD_KEY", "Invalid period key (expected YYYY-MM)");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new HttpError(400, "INVALID_PERIOD_KEY", "Invalid period key (expected YYYY-MM)");
  }
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
};

// Writes a buffer or string chunk to a stream while honoring backpressure.
// Awaits drain events when internal stream buffers are saturated before continuing.
// Guards against memory spikes when generating large streamed export files.
const writeToStream = async (stream: NodeJS.WritableStream, chunk: string | Buffer) => {
  if (stream.write(chunk)) {
    return;
  }

  await Promise.race([
    once(stream as any, "drain"),
    once(stream as any, "error").then(([err]) => {
      throw err;
    }),
    once(stream as any, "close").then(() => {
      throw new Error("Upload stream closed");
    }),
  ]);
};

// Normalizes and validates an unknown value against allowed transaction types.
// Validates income, expense, and investment transaction classifications.
// Returns undefined when the input value does not match known transaction types.
const coerceTransactionType = (value: unknown): TransactionType | undefined => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "income" || raw === "expense" || raw === "investment") {
    return raw;
  }
  return undefined;
};

// Validates and extracts the export job type enum from user parameters.
// Ensures requested format matches supported CSV or PDF export varieties.
// Throws an HTTP 400 error when encountering unrecognized export formats.
const resolveExportType = (value: unknown): ExportJobType => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "transactions_csv" || raw === "monthly_summary_pdf") {
    return raw;
  }
  throw new HttpError(400, "INVALID_EXPORT_TYPE", "Invalid export type");
};

// Streams transaction history into a formatted CSV file stored in MongoDB GridFS.
// Applies date range, category, and transaction type query filters.
// Supports custom column projection selections while tracking total written bytes.
const buildTransactionsCsv = async (params: {
  exportJobId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  jobParams: Record<string, unknown>;
}): Promise<ExportArtifact> => {
  const filter: Record<string, unknown> = {
    orgId: params.orgId,
    userId: params.userId,
  };

  const dateFrom = parseDateOrUndefined(params.jobParams.date_from);
  const dateTo = parseDateOrUndefined(params.jobParams.date_to);
  if (dateFrom || dateTo) {
    const range: Record<string, unknown> = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lt = dateTo;
    filter.date = range;
  }

  const txType = coerceTransactionType(params.jobParams.tx_type);
  if (txType) {
    filter.type = txType;
  }

  const categoryRaw = typeof params.jobParams.category === "string" ? params.jobParams.category.trim() : "";
  if (categoryRaw) {
    filter.category = categoryRaw;
  }

  const today = new Date();
  const filename = `finwise_transactions_${toDayKey(today)}.csv`;
  const contentType = "text/csv";

  const { fileId, uploadStream } = openGridFsUploadStream({
    filename,
    contentType,
    metadata: {
      userId: params.userId.toString(),
      orgId: params.orgId.toString(),
      purpose: "export",
      exportJobId: params.exportJobId.toString(),
    },
  });

  let bytes = 0;

  const ALL_COLUMNS: Array<{ key: string; extract: (tx: any, source: any) => string }> = [
    { key: "id", extract: (tx) => toCsvCell(tx._id) },
    { key: "date", extract: (tx) => toCsvCell(tx.date ? toDayKey(new Date(tx.date)) : "") },
    { key: "type", extract: (tx) => toCsvCell(tx.type) },
    { key: "amount", extract: (tx) => toCsvCell(tx.amount) },
    { key: "category", extract: (tx) => toCsvCell(tx.category) },
    { key: "description", extract: (tx) => toCsvCell(tx.description) },
    { key: "source_origin", extract: (_tx, source) => toCsvCell(source.origin) },
    { key: "source_request_id", extract: (_tx, source) => toCsvCell(source.request_id) },
    { key: "source_task_id", extract: (_tx, source) => toCsvCell(source.task_id) },
    { key: "source_agent_output_id", extract: (_tx, source) => toCsvCell(source.agent_output_id) },
    { key: "source_receipt_id", extract: (_tx, source) => toCsvCell(source.receipt_id) },
    { key: "source_journal_entry_id", extract: (_tx, source) => toCsvCell(source.journal_entry_id) },
    { key: "source_action_link_id", extract: (_tx, source) => toCsvCell(source.action_link_id) },
    { key: "source_actor_type", extract: (_tx, source) => toCsvCell(source.actor_type) },
    { key: "source_source_ref", extract: (_tx, source) => toCsvCell(source.source_ref) },
    { key: "source_note", extract: (_tx, source) => toCsvCell(source.note) },
    { key: "created_at", extract: (tx) => toCsvCell(tx.createdAt ? new Date(tx.createdAt).toISOString() : "") },
    { key: "updated_at", extract: (tx) => toCsvCell(tx.updatedAt ? new Date(tx.updatedAt).toISOString() : "") },
  ];

  const requestedColumns = Array.isArray(params.jobParams.columns)
    ? (params.jobParams.columns as string[]).map((c) => String(c).trim().toLowerCase())
    : [];

  const columnMap = new Map(ALL_COLUMNS.map((c) => [c.key, c]));
  const activeColumns = requestedColumns.length > 0
    ? requestedColumns.map((colKey) => columnMap.get(colKey)).filter((c): c is (typeof ALL_COLUMNS)[0] => Boolean(c))
    : ALL_COLUMNS;

  const colsToRender = activeColumns.length > 0 ? activeColumns : ALL_COLUMNS;
  const header = colsToRender.map((c) => c.key).join(",");

  const writeLine = async (line: string) => {
    bytes += Buffer.byteLength(line, "utf8");
    await writeToStream(uploadStream, line);
  };

  try {
    await writeLine(`${header}\n`);

    const cursor = TransactionModel.find(filter)
      .sort({ date: 1, _id: 1 })
      .select({ _id: 1, amount: 1, category: 1, description: 1, date: 1, type: 1, source: 1, createdAt: 1, updatedAt: 1 })
      .lean()
      .cursor();

    for await (const tx of cursor) {
      const source: any = (tx as any).source || {};
      const row = colsToRender.map((c) => c.extract(tx, source)).join(",");
      await writeLine(`${row}\n`);
    }

    uploadStream.end();
    await Promise.race([
      once(uploadStream, "finish"),
      once(uploadStream, "error").then(([err]) => {
        throw err;
      }),
    ]);
  } catch (error) {
    try {
      uploadStream.destroy();
    } catch {
      // ignore
    }
    await deleteGridFsFile(fileId.toString()).catch(() => null);
    throw error;
  }

  return { fileId, filename, contentType, bytes };
};

// Generates a comprehensive monthly financial summary report formatted as a PDF.
// Aggregates net income, category expense rankings, and transaction volume.
// Pipes rendered PDF binary streams directly into GridFS storage buckets.
const buildMonthlySummaryPdf = async (params: {
  exportJobId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  jobParams: Record<string, unknown>;
}): Promise<ExportArtifact> => {
  const periodKey = safeString(params.jobParams.period_key).trim();
  const { start, end } = parsePeriodKey(periodKey);

  const org = await OrganizationModel.findById(params.orgId).select({ name: 1 }).lean();
  const user = await UserModel.findById(params.userId).select({ name: 1, email: 1 }).lean();

  const rows = await TransactionModel.aggregate([
    {
      $match: {
        orgId: params.orgId,
        userId: params.userId,
        date: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: "$type",
        net: { $sum: "$amount" },
        income: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } },
        expense: { $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] } },
        count: { $sum: 1 },
      },
    },
  ]);

  let incomeTotal = 0;
  let expenseTotal = 0;
  let netTotal = 0;
  let txCount = 0;

  for (const row of rows as any[]) {
    incomeTotal += Number(row?.income || 0);
    expenseTotal += Number(row?.expense || 0);
    netTotal += Number(row?.net || 0);
    txCount += Number(row?.count || 0);
  }

  const topExpenses = await TransactionModel.aggregate([
    {
      $match: {
        orgId: params.orgId,
        userId: params.userId,
        date: { $gte: start, $lt: end },
        amount: { $lt: 0 },
      },
    },
    {
      $group: {
        _id: "$category",
        total: { $sum: { $abs: "$amount" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 8 },
  ]);

  const filename = `finwise_monthly_summary_${periodKey}.pdf`;
  const contentType = "application/pdf";

  const { fileId, uploadStream } = openGridFsUploadStream({
    filename,
    contentType,
    metadata: {
      userId: params.userId.toString(),
      orgId: params.orgId.toString(),
      purpose: "export",
      exportJobId: params.exportJobId.toString(),
    },
  });

  let bytes = 0;
  const pdf = new PDFDocument({ size: "A4", margin: 54 });
  pdf.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
  });

  const finalize = async () => {
    pdf.end();
    await Promise.race([
      once(uploadStream, "finish"),
      once(uploadStream, "error").then(([err]) => {
        throw err;
      }),
    ]);
  };

  try {
    pdf.pipe(uploadStream);

    pdf.fontSize(20).text("Personal Finance Monthly Summary", { align: "left" });
    pdf.moveDown(0.5);

    const currencyCode = safeString((org as any)?.currency || "USD").toUpperCase();

    pdf.fontSize(11).fillColor("#333");
    pdf.text(`Period: ${periodKey} (UTC)`);
    pdf.text(`Organization: ${safeString((org as any)?.name || "Unknown")}`);
    pdf.text(`Currency: ${currencyCode}`);
    pdf.text(`User: ${safeString((user as any)?.name || (user as any)?.email || "Unknown")}`);
    pdf.moveDown(1);

    pdf.fontSize(14).fillColor("#000").text("Totals");
    pdf.moveDown(0.25);
    pdf.fontSize(11).fillColor("#333");
    pdf.text(`Transactions: ${txCount}`);
    pdf.text(`Income: ${currencyCode} ${incomeTotal.toFixed(2)}`);
    pdf.text(`Expenses: ${currencyCode} ${expenseTotal.toFixed(2)}`);
    pdf.text(`Net: ${currencyCode} ${netTotal.toFixed(2)}`);
    pdf.moveDown(1);

    pdf.fontSize(14).fillColor("#000").text("Top Expense Categories");
    pdf.moveDown(0.25);
    pdf.fontSize(11).fillColor("#333");

    if (!topExpenses.length) {
      pdf.text("No expenses recorded for this period.");
    } else {
      for (const row of topExpenses as any[]) {
        const category = safeString(row?._id || "Other");
        const total = Number(row?.total || 0);
        const count = Number(row?.count || 0);
        pdf.text(`${category}: ${currencyCode} ${total.toFixed(2)} (${count} tx)`);
      }
    }

    pdf.moveDown(1);
    pdf.fontSize(9).fillColor("#666").text("Generated locally by Personal Finance. Verify numbers against your source statements.");

    await finalize();
  } catch (error) {
    try {
      (pdf as any).destroy?.();
    } catch {
      // ignore
    }
    try {
      uploadStream.destroy();
    } catch {
      // ignore
    }
    await deleteGridFsFile(fileId.toString()).catch(() => null);
    throw error;
  }

  return { fileId, filename, contentType, bytes };
};

// Executes an asynchronous export job to generate requested CSV or PDF artifacts.
// Updates execution progress statuses, timestamps, and error messages in the database.
// Links successfully generated GridFS file artifacts to the completed export job record.
export const processExportJob = async (exportJobId: string) => {
  if (!mongoose.Types.ObjectId.isValid(exportJobId)) {
    throw new HttpError(400, "INVALID_EXPORT_JOB_ID", "Invalid export job id");
  }

  const job = await ExportJobModel.findById(exportJobId);
  if (!job) {
    throw new HttpError(404, "EXPORT_NOT_FOUND", "Export job not found");
  }

  if (job.status === "succeeded" || job.status === "failed") {
    return job.toObject();
  }

  job.status = "running";
  job.startedAt = new Date();
  job.finishedAt = undefined;
  job.error = undefined;
  await job.save();

  const jobParams =
    job.params && typeof job.params === "object" && !Array.isArray(job.params)
      ? (job.params as Record<string, unknown>)
      : {};

  try {
    const type = resolveExportType(job.type);

    const artifact =
      type === "transactions_csv"
        ? await buildTransactionsCsv({
            exportJobId: job._id,
            orgId: job.orgId,
            userId: job.createdByUserId,
            jobParams,
          })
        : await buildMonthlySummaryPdf({
            exportJobId: job._id,
            orgId: job.orgId,
            userId: job.createdByUserId,
            jobParams,
          });

    job.status = "succeeded";
    job.finishedAt = new Date();
    job.fileId = artifact.fileId;
    job.filename = artifact.filename;
    job.contentType = artifact.contentType;
    job.bytes = artifact.bytes;
    await job.save();

    return job.toObject();
  } catch (error: any) {
    job.status = "failed";
    job.finishedAt = new Date();
    job.error = safeString(error?.message || error).slice(0, 2000);
    await job.save();
    throw error;
  }
};

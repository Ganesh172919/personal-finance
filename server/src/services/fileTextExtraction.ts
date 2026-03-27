import path from "path";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

import { processAiCoreGenericOcr } from "./aiCoreClient";

export type ExtractedWorkspaceContent = {
  text: string;
  preview: string;
  warnings: string[];
  extractionMethod: string;
};

const MAX_TEXT_LENGTH = 24_000;
const MAX_PREVIEW_LENGTH = 1_800;

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const SPREADSHEET_EXTENSIONS = new Set([".csv", ".ods", ".xls", ".xlsx"]);
const DATA_EXTENSIONS = new Set([".csv", ".json", ".ndjson", ".tsv", ".xml", ".yaml", ".yml"]);
const ARCHIVE_EXTENSIONS = new Set([".7z", ".gz", ".rar", ".tar", ".tgz", ".zip"]);

const DOCUMENT_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".md",
  ".odt",
  ".pdf",
  ".rtf",
  ".txt",
]);

const normalizeWhitespace = (value: string) => value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();

const truncateText = (value: string, limit: number) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
};

const buildResult = (
  text: string,
  warnings: string[],
  extractionMethod: string
): ExtractedWorkspaceContent => {
  const normalized = normalizeWhitespace(text);
  const trimmed = truncateText(normalized, MAX_TEXT_LENGTH);

  return {
    text: trimmed,
    preview: truncateText(trimmed, MAX_PREVIEW_LENGTH),
    warnings,
    extractionMethod,
  };
};

const extensionOf = (fileName: string) => path.extname(fileName || "").toLowerCase();

export const detectWorkspaceFileKind = (mimeType: string, fileName: string) => {
  const extension = extensionOf(fileName);
  const safeMimeType = String(mimeType || "").toLowerCase();

  if (safeMimeType.startsWith("image/")) return "image" as const;
  if (safeMimeType.includes("spreadsheet") || SPREADSHEET_EXTENSIONS.has(extension)) return "spreadsheet" as const;
  if (safeMimeType.startsWith("text/") && CODE_EXTENSIONS.has(extension)) return "code" as const;
  if (CODE_EXTENSIONS.has(extension)) return "code" as const;
  if (safeMimeType.includes("json") || safeMimeType.includes("csv") || DATA_EXTENSIONS.has(extension)) return "data" as const;
  if (safeMimeType.includes("zip") || safeMimeType.includes("archive") || ARCHIVE_EXTENSIONS.has(extension)) return "archive" as const;
  if (
    safeMimeType.includes("pdf") ||
    safeMimeType.includes("word") ||
    safeMimeType.includes("document") ||
    DOCUMENT_EXTENSIONS.has(extension)
  ) {
    return "document" as const;
  }
  return "other" as const;
};

const extractSpreadsheetText = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sections: string[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false }).trim();
    if (!csv) return;
    sections.push(`Sheet: ${sheetName}\n${csv}`);
  });

  return sections.join("\n\n");
};

const extractPlainText = (buffer: Buffer) => buffer.toString("utf8");

const extractJsonText = (buffer: Buffer) => {
  const raw = buffer.toString("utf8");
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export const extractWorkspaceFileText = async (params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  requestId: string;
  userId?: string;
}): Promise<ExtractedWorkspaceContent> => {
  const { buffer, mimeType, fileName, requestId, userId } = params;
  const extension = extensionOf(fileName);
  const safeMimeType = String(mimeType || "").toLowerCase();
  const warnings: string[] = [];

  if (safeMimeType.startsWith("image/")) {
    const ocr = await processAiCoreGenericOcr(
      {
        image: buffer,
        contentType: mimeType || "application/octet-stream",
      },
      requestId,
      { userId }
    );

    warnings.push(...ocr.warnings);
    if (!ocr.recognized_text.trim()) {
      warnings.push("No text could be extracted from this image.");
    }
    return buildResult(ocr.recognized_text, warnings, "vision_ocr");
  }

  if (
    safeMimeType.startsWith("text/") ||
    safeMimeType.includes("javascript") ||
    safeMimeType.includes("typescript") ||
    safeMimeType.includes("xml")
  ) {
    return buildResult(extractPlainText(buffer), warnings, "plain_text");
  }

  if (safeMimeType.includes("json") || extension === ".json") {
    return buildResult(extractJsonText(buffer), warnings, "json");
  }

  if (safeMimeType.includes("csv") || extension === ".csv" || extension === ".tsv") {
    return buildResult(extractPlainText(buffer), warnings, "csv");
  }

  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return buildResult(extractSpreadsheetText(buffer), warnings, "spreadsheet");
  }

  if (extension === ".pdf" || safeMimeType.includes("pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      warnings.push(`Parsed ${parsed.total || parsed.pages.length || 0} page(s) from PDF.`);
      return buildResult(parsed.text || "", warnings, "pdf");
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  if (extension === ".docx" || safeMimeType.includes("word")) {
    const result = await mammoth.extractRawText({ buffer });
    warnings.push(...(result.messages || []).map((message) => String(message.message || message.type || "Document warning")));
    return buildResult(result.value || "", warnings, "docx");
  }

  if (CODE_EXTENSIONS.has(extension)) {
    return buildResult(extractPlainText(buffer), warnings, "code");
  }

  warnings.push("This file type was stored successfully, but text extraction is not available yet.");
  return buildResult("", warnings, "unsupported");
};

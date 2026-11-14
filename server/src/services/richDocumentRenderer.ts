/**
 * richDocumentRenderer.ts - Multi-Format Financial Document Authorship & Rich Layout Studio
 * =========================================================================================
 *
 * Professional PDFKit-based document rendering engine supporting 6 distinct financial formats:
 * 1. executive_brief: High-net-worth strategic advisory brief, 4 KPI cards, priority action table, sign-off.
 * 2. tax_prep_summary: Tax year review, deduction schedule, W-2 withholding reconciliation, CPA disclaimer.
 * 3. cash_flow_audit: Inflow vs outflow velocity, multi-envelope spending allocation table, burn action items.
 * 4. debt_payoff_schedule: Accelerated debt amortization, liability inventory, interest saved, P+I invariant.
 * 5. net_worth_statement: Consolidated balance sheet, assets & liabilities schedules, Assets - Liabilities = Net Worth.
 * 6. standard: Free-form custom authoring with markdown headings, tables, KPI blocks, and callout boxes.
 *
 * Features:
 * ---------
 * - Side-by-side KPI metric cards with accent backgrounds, borders, and delta indicators.
 * - Multi-column tabular schedules with dark header rows, zebra striping, and numeric right-alignment.
 * - Visual callout quote boxes with vertical accent border bars.
 * - Buffer-aware multi-page pagination with running headers and "Page X of Y" dynamic footers.
 * - Form-feed page separation retention (\f) so Document Q&A can ground to the exact physical page.
 * - Direct MongoDB GridFS streaming with tenant isolation metadata.
 * - Automatic workspace file indexing via ensureWorkspaceFileChunks for instant RAG readiness.
 */

import { once } from "events";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";

import { logger } from "../config/logger";
import { populateProfileTemplateData } from "./profileDocumentData";
export { populateProfileTemplateData } from "./profileDocumentData";
import WorkspaceFileModel from "../models/workspaceFileModel";
import { extractWorkspaceFileText, type ExtractedWorkspaceContent } from "./fileTextExtraction";
import { deleteGridFsFile, openGridFsDownloadStream, openGridFsUploadStream } from "./gridfs";
import { ensureWorkspaceFileChunks } from "./retrievalService";

// Defines supported financial document layouts for PDF authorship generation.
// Encompasses formats ranging from executive briefs to net worth statements.
// Directs visual styling, KPI layouts, disclaimers, and data presentation.
export type AuthoredDocumentFormat =
  | "standard"
  | "executive_brief"
  | "tax_prep_summary"
  | "cash_flow_audit"
  | "debt_payoff_schedule"
  | "net_worth_statement";

// Represents a key performance indicator card metric in rendered documents.
// Contains the metric title, formatted display value, and optional subtext.
// Supports directional indicators and delta analysis within summary banners.
export interface DocumentKPI {
  label: string;
  value: string;
  subtext?: string;
}

// Represents a formatted tabular dataset rendered in financial PDF reports.
// Contains an optional title, column header labels, and row value matrices.
// Supports right-alignment for numeric metrics and automated zebra striping.
export interface DocumentTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

// Represents an emphasized callout highlight box within an authored PDF document.
// Categorizes notices into advisory note, warning, or success callout styles.
// Draws visual accent borders to emphasize important disclosures and guidance.
export interface DocumentCallout {
  type?: "note" | "warning" | "success";
  text: string;
}

// Defines input parameters for generating a structured financial PDF document.
// Specifies organizational ownership, document styling format, and raw content.
// Encapsulates KPI definitions, tables, callouts, and profile injection flags.
export interface AuthoredDocumentInput {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  requestId: string;
  title: string;
  format?: AuthoredDocumentFormat;
  content?: string;
  kpis?: DocumentKPI[];
  tables?: DocumentTable[];
  callouts?: DocumentCallout[];
  filenameStem?: string;
  disclaimer?: string;
  includeProfileData?: boolean;
}

// Represents metadata of a generated and persisted authored PDF document.
// Encapsulates file storage identifiers, generated filenames, and layout format.
// Reports physical page counts, byte lengths, and MIME type properties.
export interface RenderedAuthoredDocument {
  workspaceFileId: string;
  fileId: string;
  title: string;
  filename: string;
  format: AuthoredDocumentFormat;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
}

// Converts an input string into a sanitized alphanumeric slug.
// Replaces invalid file path characters and symbols with underscores.
// Truncates the resulting slug to ensure file names remain within bounds.
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

// Normalizes and sanitizes filename stems for generated financial exports.
// Converts arbitrary document titles into valid, secure filesystem names.
// Defaults to a fallback name if the sanitized result is empty.
const sanitizeFilenameStem = (value: string) => slugify(value) || "financial_document";

// Maps document format identifiers to formatted presentation header titles.
// Provides distinct header banner titles for executive and audit templates.
// Ensures consistent visual branding across various PDF report formats.
const FORMAT_LABELS: Record<AuthoredDocumentFormat, string> = {
  standard: "FINANCIAL INTELLIGENCE REPORT",
  executive_brief: "EXECUTIVE FINANCIAL BRIEF • CONFIDENTIAL",
  tax_prep_summary: "TAX PREPARATION & DEDUCTION SUMMARY",
  cash_flow_audit: "CASH FLOW & LIQUIDITY BURN AUDIT",
  debt_payoff_schedule: "DEBT AMORTIZATION & ACCELERATED PAYOFF",
  net_worth_statement: "CONSOLIDATED BALANCE SHEET & NET WORTH",
};

// Maps document format types to their default legal and financial disclaimers.
// Enforces appropriate regulatory disclosures and CPA advisory statements.
// Displayed at the conclusion of generated documents for compliance purposes.
const DEFAULT_DISCLAIMERS: Record<AuthoredDocumentFormat, string> = {
  standard: "Disclaimer: This document is prepared for financial planning purposes only. Review source records before sharing.",
  executive_brief: "Disclaimer: This executive brief is prepared for strategic planning purposes only and does not constitute formal legal or certified accounting counsel.",
  tax_prep_summary: "Disclaimer: Review all figures with a Certified Public Accountant (CPA) or licensed tax professional before filing.",
  cash_flow_audit: "Disclaimer: Cash flow audit is based on recorded ledger transactions and user-configured budget envelopes.",
  debt_payoff_schedule: "Disclaimer: Projections assume on-time monthly payments and constant APR terms.",
  net_worth_statement: "Disclaimer: Valuations reflect active user-linked and manual accounts as of the statement date.",
};

/**
 * Parse markdown-style tables, headings, and KPI blocks from raw content.
 */
// Parses markdown tables, KPI tags, and callout blocks from document text.
// Separates structured elements from narrative markdown body sections.
// Returns normalized section structures and extracted visual components.
export function parseAuthoredContentBlocks(content: string): {
  sections: Array<{ heading?: string; body: string }>;
  extractedKpis: DocumentKPI[];
  extractedTables: DocumentTable[];
  callouts: DocumentCallout[];
} {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const extractedKpis: DocumentKPI[] = [];
  const extractedTables: DocumentTable[] = [];
  const callouts: DocumentCallout[] = [];

  // Parse :::kpi Label | Value | Subtext :::
  const kpiRegex = /:::kpi\s+([^|]+)\|([^|]+)(?:\|([^:]+))?:::/g;
  let match;
  while ((match = kpiRegex.exec(normalized)) !== null) {
    extractedKpis.push({
      label: match[1].trim(),
      value: match[2].trim(),
      subtext: match[3] ? match[3].trim() : undefined,
    });
  }

  // Parse :::callout ... :::
  const calloutRegex = /:::callout\s+([\s\S]+?):::/g;
  while ((match = calloutRegex.exec(normalized)) !== null) {
    callouts.push({ text: match[1].trim() });
  }

  // Parse Markdown Tables
  const tableBlockRegex = /((?:\|[^\n]+\|\n?){2,})/g;
  while ((match = tableBlockRegex.exec(normalized)) !== null) {
    const lines = match[1].trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const headers = lines[0].split("|").map(c => c.trim()).filter(Boolean);
      const rows: string[][] = [];
      for (const rowLine of lines.slice(1)) {
        if (/^\|[\s\-:|]+\|$/.test(rowLine)) continue;
        const cols = rowLine.split("|").map(c => c.trim()).filter(Boolean);
        if (cols.length) rows.push(cols);
      }
      if (headers.length && rows.length) {
        extractedTables.push({ headers, rows });
      }
    }
  }

  // Clean raw content by removing kpi, callout, and table blocks for text body sectioning
  const textOnly = normalized
    .replace(/:::kpi\s+[^:]+:::/g, "")
    .replace(/:::callout\s+[\s\S]+?:::/g, "")
    .replace(/((?:\|[^\n]+\|\n?){2,})/g, "")
    .trim();

  // Split into sections by Markdown headings (# or ##) or double newlines
  const rawSections = textOnly.split(/\n\s*\n+/).filter(Boolean);
  const sections = rawSections.map(sec => {
    const lines = sec.split("\n").map(l => l.trim()).filter(Boolean);
    const heading = lines[0] && (lines[0].startsWith("#") || /^[A-Z0-9][A-Z0-9\s:/-]{3,}$/.test(lines[0]))
      ? lines[0].replace(/^#+\s*/, "").trim()
      : undefined;
    return {
      heading,
      body: heading ? lines.slice(1).join("\n") : lines.join("\n"),
    };
  });

  return { sections, extractedKpis, extractedTables, callouts };
}

/**
 * Main PDFKit Renderer for Authored Documents.
 */
// Renders an authored multi-page PDF document using PDFKit layout primitives.
// Streams rendered bytes directly to GridFS and creates workspace file records.
// Automatically triggers vector chunk indexing for instant RAG readiness.
export async function renderRichAuthoredPdf(params: AuthoredDocumentInput): Promise<RenderedAuthoredDocument> {
  const format: AuthoredDocumentFormat = params.format || "standard";
  const safeTitle = params.title.trim() || "Financial Document";
  const filename = `${sanitizeFilenameStem(params.filenameStem || safeTitle)}.pdf`;

  // Merge profile template data if requested or if content is sparse
  let kpis: DocumentKPI[] = params.kpis ? [...params.kpis] : [];
  let tables: DocumentTable[] = params.tables ? [...params.tables] : [];
  let bodyContent = params.content || "";

  if (params.includeProfileData || (params.includeProfileData !== false && !bodyContent && kpis.length === 0)) {
    const profileData = await populateProfileTemplateData({
      orgId: params.orgId,
      userId: params.userId,
      format,
    });
    if (!bodyContent) bodyContent = profileData.summaryText;
    if (kpis.length === 0) kpis = profileData.kpis;
    if (tables.length === 0) tables = profileData.tables;
  }

  // Parse any rich blocks present in raw content
  const parsed = parseAuthoredContentBlocks(bodyContent);
  if (parsed.extractedKpis.length > 0 && kpis.length === 0) kpis = parsed.extractedKpis;
  if (parsed.extractedTables.length > 0 && tables.length === 0) tables = parsed.extractedTables;

  const disclaimer = params.disclaimer || DEFAULT_DISCLAIMERS[format];

  // Open GridFS upload stream
  const { fileId, uploadStream } = openGridFsUploadStream({
    filename,
    contentType: "application/pdf",
    metadata: {
      userId: params.userId.toString(),
      orgId: params.orgId.toString(),
      purpose: "export",
      format,
      requestId: params.requestId,
    },
  });

  const pdf = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
  });

  let bytes = 0;
  pdf.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
  });

  try {
    pdf.pipe(uploadStream);

    const contentWidth = 595.28 - 96; // 499.28 pt

    // ── Header Banner ────────────────────────────────────────────────────────
    pdf.rect(48, 48, contentWidth, 54).fill("#0f172a");
    pdf.rect(48, 102, contentWidth, 3).fill("#3b82f6");

    pdf.fontSize(16).fillColor("#ffffff").text("FINWISE FINANCIAL INTELLIGENCE", 62, 58, {
      width: contentWidth - 28,
      characterSpacing: 0.5,
    });
    pdf.fontSize(8.5).fillColor("#93c5fd").text(FORMAT_LABELS[format], 62, 82, {
      width: contentWidth - 28,
      characterSpacing: 1.0,
    });

    pdf.y = 118;

    // ── Metadata Strip ───────────────────────────────────────────────────────
    const metadataParts = [
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      `Document ID: ${params.requestId.slice(0, 12)}`,
      `Org: ${params.orgId.toString().slice(-6)}`,
      `User: ${params.userId.toString().slice(-6)}`,
    ];
    pdf.fontSize(8).fillColor("#64748b").text(metadataParts.join("   •   "), 48, pdf.y, {
      width: contentWidth,
      align: "left",
    });
    pdf.moveDown(0.8);

    // ── Document Title ───────────────────────────────────────────────────────
    pdf.fontSize(18).fillColor("#0f172a").text(safeTitle, 48, pdf.y, {
      width: contentWidth,
    });
    pdf.moveDown(0.6);

    // ── KPI Cards Grid (if present) ──────────────────────────────────────────
    if (kpis.length > 0) {
      const cardCount = Math.min(4, kpis.length);
      const gap = 8;
      const cardWidth = (contentWidth - gap * (cardCount - 1)) / cardCount;
      const cardHeight = 52;
      const startY = pdf.y;

      kpis.slice(0, 4).forEach((kpi, idx) => {
        const cardX = 48 + idx * (cardWidth + gap);
        // Card background
        pdf.roundedRect(cardX, startY, cardWidth, cardHeight, 4).fillAndStroke("#f8fafc", "#e2e8f0");

        // KPI Label
        pdf.fontSize(7).fillColor("#64748b").text(kpi.label.toUpperCase(), cardX + 6, startY + 6, {
          width: cardWidth - 12,
          ellipsis: true,
        });

        // KPI Value
        pdf.fontSize(12.5).fillColor("#0f172a").text(kpi.value, cardX + 6, startY + 18, {
          width: cardWidth - 12,
          ellipsis: true,
        });

        // KPI Subtext
        if (kpi.subtext) {
          const isPositive = /\+|\boptimal\b|\babove\b|\bliquid\b/i.test(kpi.subtext);
          pdf.fontSize(6.5).fillColor(isPositive ? "#16a34a" : "#64748b").text(kpi.subtext, cardX + 6, startY + 36, {
            width: cardWidth - 12,
            ellipsis: true,
          });
        }
      });

      pdf.y = startY + cardHeight + 14;
    }

    // ── Executive Body Sections ──────────────────────────────────────────────
    if (parsed.sections.length > 0) {
      for (const section of parsed.sections) {
        if (pdf.y > 700) pdf.addPage();

        if (section.heading) {
          pdf.fontSize(12).fillColor("#0f172a").text(section.heading, 48, pdf.y);
          pdf.moveDown(0.2);
          pdf.rect(48, pdf.y, contentWidth, 1).fill("#e2e8f0");
          pdf.moveDown(0.4);
        }

        const bodyLines = section.body.split("\n").map(l => l.trim()).filter(Boolean);
        for (const line of bodyLines) {
          if (pdf.y > 720) pdf.addPage();

          if (/^[-*]\s+/.test(line)) {
            pdf.fontSize(9).fillColor("#334155").text(`•  ${line.replace(/^[-*]\s+/, "")}`, 56, pdf.y, {
              width: contentWidth - 16,
              lineGap: 2,
            });
          } else {
            pdf.fontSize(9).fillColor("#334155").text(line, 48, pdf.y, {
              width: contentWidth,
              lineGap: 2.5,
            });
          }
          pdf.moveDown(0.3);
        }
        pdf.moveDown(0.5);
      }
    } else if (bodyContent.trim()) {
      pdf.fontSize(9.5).fillColor("#334155").text(bodyContent.trim(), 48, pdf.y, {
        width: contentWidth,
        lineGap: 2.5,
      });
      pdf.moveDown(0.8);
    }

    // ── Tabular Schedules ────────────────────────────────────────────────────
    if (tables.length > 0) {
      for (const table of tables) {
        if (pdf.y > 640) pdf.addPage();

        if (table.title) {
          pdf.fontSize(11).fillColor("#0f172a").text(table.title, 48, pdf.y);
          pdf.moveDown(0.3);
        }

        const colCount = table.headers.length;
        const colWidth = contentWidth / colCount;
        const rowHeight = 20;

        // Table Header Row
        const headerY = pdf.y;
        pdf.rect(48, headerY, contentWidth, rowHeight).fill("#1e293b");

        table.headers.forEach((header, colIdx) => {
          const colX = 48 + colIdx * colWidth;
          const isNumeric = colIdx > 0 && /amount|balance|spend|rate|apr|variance|horizon|impact|valuation|payment/i.test(header);
          pdf.fontSize(7.5).fillColor("#ffffff").text(header, colX + 6, headerY + 6, {
            width: colWidth - 12,
            align: isNumeric ? "right" : "left",
            ellipsis: true,
          });
        });

        pdf.y = headerY + rowHeight;

        // Table Data Rows
        table.rows.forEach((row, rowIdx) => {
          if (pdf.y > 740) pdf.addPage();

          const rowY = pdf.y;
          const bgFill = rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
          pdf.rect(48, rowY, contentWidth, rowHeight).fillAndStroke(bgFill, "#e2e8f0");

          row.forEach((cell, colIdx) => {
            const colX = 48 + colIdx * colWidth;
            const isNumeric = /^[$\d.,%-]+$/.test(cell.trim()) || colIdx > 0;
            pdf.fontSize(7.5).fillColor("#334155").text(cell, colX + 6, rowY + 6, {
              width: colWidth - 12,
              align: isNumeric ? "right" : "left",
              ellipsis: true,
            });
          });

          pdf.y = rowY + rowHeight;
        });

        pdf.moveDown(0.8);
      }
    }

    // ── Callout Quote Box (if present) ───────────────────────────────────────
    if (parsed.callouts.length > 0 || params.callouts?.length) {
      const allCallouts = [...parsed.callouts, ...(params.callouts || [])];
      for (const callout of allCallouts) {
        if (pdf.y > 720) pdf.addPage();

        const calloutY = pdf.y;
        const calloutHeight = 32;
        pdf.rect(48, calloutY, contentWidth, calloutHeight).fill("#eff6ff");
        pdf.rect(48, calloutY, 3, calloutHeight).fill("#3b82f6");

        pdf.fontSize(8).fillColor("#1e40af").text(callout.text, 58, calloutY + 8, {
          width: contentWidth - 20,
          lineGap: 2,
        });

        pdf.y = calloutY + calloutHeight + 10;
      }
    }

    // ── Disclaimer Box ───────────────────────────────────────────────────────
    if (pdf.y > 720) pdf.addPage();
    pdf.moveDown(0.5);
    pdf.fontSize(7.5).fillColor("#94a3b8").text(disclaimer, 48, pdf.y, {
      width: contentWidth,
      lineGap: 2,
    });

    // ── Dynamic Multi-Page Headers and Footers ────────────────────────────────
    const range = pdf.bufferedPageRange();
    const totalPages = range.count;

    for (let i = range.start; i < range.start + totalPages; i++) {
      pdf.switchToPage(i);

      // Running top header for pages > 1
      if (i > range.start) {
        pdf.fontSize(7.5).fillColor("#94a3b8").text(`FinWise Financial Intelligence • ${safeTitle}`, 48, 24, {
          width: contentWidth,
          align: "left",
        });
        pdf.rect(48, 36, contentWidth, 0.5).fill("#e2e8f0");
      }

      // Running bottom footer for all pages
      const pageNum = i - range.start + 1;
      // Keep the footer inside PDFKit's writable area. Writing below the
      // document bottom margin silently created an extra blank page.
      pdf.rect(48, 790, contentWidth, 0.5).fill("#e2e8f0");
      pdf.fontSize(7.5).fillColor("#94a3b8").text(
        `Page ${pageNum} of ${totalPages}   •   Generated on ${new Date().toISOString().slice(0, 10)}   •   Confidential Financial Record`,
        48,
        777,
        {
          width: contentWidth,
          align: "center",
        }
      );
    }

    pdf.end();

    await Promise.race([
      once(uploadStream, "finish"),
      once(uploadStream, "error").then(([err]) => {
        throw err;
      }),
    ]);
  } catch (error) {
    try {
      (pdf as any).destroy?.();
    } catch {
      // ignore cleanup error
    }
    try {
      uploadStream.destroy();
    } catch {
      // ignore cleanup error
    }
    await deleteGridFsFile(fileId.toString()).catch(() => null);
    throw error;
  }

  // Extract text and persist physical form feeds (\f) for RAG & Document Q&A
  let extracted: ExtractedWorkspaceContent = {
    text: bodyContent.replace(/\f/g, "\n"),
    preview: bodyContent.slice(0, 800),
    extractionMethod: "pdf_authoring",
    warnings: [],
  };

  try {
    const stream = openGridFsDownloadStream(fileId.toString());
    const buffers: Buffer[] = [];
    let readBytes = 0;
    for await (const chunk of stream) {
      readBytes += chunk.length;
      if (readBytes > 4 * 1024 * 1024) throw new Error("Generated PDF exceeds extraction bounds");
      buffers.push(Buffer.from(chunk));
    }
    const parsedExtracted = await extractWorkspaceFileText({
      buffer: Buffer.concat(buffers),
      mimeType: "application/pdf",
      fileName: filename,
      requestId: params.requestId,
      userId: params.userId.toString(),
    });
    if (parsedExtracted.text.trim()) {
      extracted = parsedExtracted;
    }
  } catch (err) {
    logger.warn({ requestId: params.requestId, err }, "Authored PDF saved; physical page verification fallback used");
    extracted.warnings.push("PDF text was retained, but its physical page count could not be verified.");
  }

  // Create WorkspaceFile document in MongoDB
  let file;
  try {
    file = await WorkspaceFileModel.create({
      orgId: params.orgId,
      userId: params.userId,
      fileId,
      originalName: filename,
      mimeType: "application/pdf",
      sizeBytes: bytes,
      extension: "pdf",
      kind: "document",
      status: "processed",
      extractedText: extracted.text,
      extractedPreview: extracted.preview,
      extractedPageCount: extracted.pageCount,
      extractionWarnings: extracted.warnings,
    });
  } catch (err) {
    await deleteGridFsFile(fileId.toString()).catch(() => undefined);
    throw err;
  }

  // On-demand chunk indexing for Vector RAG & Document Q&A retrieval
  await ensureWorkspaceFileChunks({
    orgId: params.orgId,
    userId: params.userId,
    workspaceFileId: file._id,
    fileId,
    originalName: filename,
    sourceKind: "document",
    extractedText: extracted.text,
    pageCount: extracted.pageCount,
  }).catch(err => {
    logger.warn({ requestId: params.requestId, err }, "Authored document saved; indexing will retry on demand");
  });

  return {
    workspaceFileId: file._id.toString(),
    fileId: fileId.toString(),
    title: safeTitle,
    filename,
    format,
    mimeType: "application/pdf",
    sizeBytes: bytes,
    pageCount: extracted.pageCount ?? 0,
  };
}

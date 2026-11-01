/**
 * pdfRequestServer.ts - Server-side PDF Document Generation & GridFS Pipeline
 * ============================================================================
 * 
 * Generates styled PDF documents from prompt text or workspace documents,
 * streaming directly into MongoDB GridFS with tenant metadata.
 * 
 * MINDMAP FLOW
 * ------------
 * ```
 * PDF Generation Pipeline
 * ├── 1. Request Input & Metadata
 * │   ├── orgId & userId isolation
 * │   ├── Document Title & Custom Filename Stem
 * │   └── Raw Content (Direct Prompt Text or Workspace Document Text)
 * ├── 2. Structural Parsing & Sectioning (sectionize)
 * │   ├── Whitespace normalization (\r\n -> \n)
 * │   ├── Paragraph grouping by double newline
 * │   └── Heading detection (Markdown # or UPPERCASE titles)
 * ├── 3. PDFKit Canvas Composition
 * │   ├── Standard Letter/A4 Geometry & Margin bounds
 * │   ├── Header Banner: FinWise Document Branding
 * │   ├── Metadata Box: Date, Request ID, Org Scope
 * │   ├── Body Sections: Section headings, styled body typography
 * │   └── Dynamic Footer: Page number ("Page X of Y")
 * └── 4. GridFS Streaming & Persistence
 *     ├── Open GridFS Upload Stream (openGridFsUploadStream)
 *     ├── Pipe PDFKit buffer stream directly to GridFS
 *     ├── Wait on completion event (once(uploadStream, 'finish'))
 *     └── Error handling: Delete partial GridFS file on failure
 * ```
 * 
 * ASCII FLOW
 * ----------
 * ```
 *   +-------------------------------------------------------------+
 *   |               Prompt Text or Workspace Text File            |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |                        sectionize()                         |
 *   |  - Split paragraphs & extract section titles / headings     |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |            PDFKit Document Generation Pipeline              |
 *   |  - Draw Document Title & Generated Date                     |
 *   |  - Iterate Sections: render heading + formatted body        |
 *   |  - Compute multi-page flow & print page numbers             |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |             MongoDB GridFS Upload Stream                    |
 *   |  - Stream chunks directly to db without saving to disk      |
 *   |  - Tag metadata: orgId, userId, sourceLabel, requestId      |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   | Return { fileId, filename, byteLength } for Download URL    |
 *   +-------------------------------------------------------------+
 * ```
 */

import { once } from "events";

import mongoose from "mongoose";
import PDFDocument from "pdfkit";

import { deleteGridFsFile, openGridFsUploadStream } from "./gridfs";

const normalizeWhitespace = (value: string) => value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

const sanitizeFilenameStem = (value: string) => slugify(value) || "requested_document";

const sectionize = (promptText: string) => {
  const normalized = normalizeWhitespace(promptText);
  if (!normalized) return [];

  return normalized
    .split(/\n\s*\n+/)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
      const heading =
        lines[0] && (lines[0].startsWith("#") || /^[A-Z0-9][A-Z0-9\s:/-]{3,}$/.test(lines[0]))
          ? lines[0].replace(/^#+\s*/, "").trim()
          : undefined;

      return {
        heading,
        body: heading ? lines.slice(1).join("\n") : lines.join("\n"),
      };
    });
};

const writePdfArtifact = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  requestId: string;
  title: string;
  promptText: string;
  sourceLabel?: string;
  filenameStem?: string;
  includeRequestMetadata?: boolean;
}) => {
  const safeTitle = params.title.trim() || "Requested PDF";
  const safePromptText = normalizeWhitespace(params.promptText);
  const filename = `${sanitizeFilenameStem(params.filenameStem || safeTitle)}.pdf`;

  const { fileId, uploadStream } = openGridFsUploadStream({
    filename,
    contentType: "application/pdf",
    metadata: {
      userId: params.userId.toString(),
      orgId: params.orgId.toString(),
      purpose: "export",
    },
  });

  const pdf = new PDFDocument({ size: "A4", margin: 54 });
  let bytes = 0;

  pdf.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
  });

  try {
    pdf.pipe(uploadStream);

    pdf.fontSize(22).fillColor("#111827").text(safeTitle);
    pdf.moveDown(0.4);
    pdf.fontSize(10).fillColor("#4b5563").text(`Generated from a text request on ${new Date().toISOString()}`);
    if (params.sourceLabel) {
      pdf.text(`Source request file: ${params.sourceLabel}`);
    }
    if (params.includeRequestMetadata !== false) pdf.text(`Request ID: ${params.requestId}`);
    pdf.moveDown(1);

    const sections = sectionize(safePromptText);
    if (!sections.length) {
      pdf.fontSize(12).fillColor("#111827").text("The request file did not contain any renderable text.");
    } else {
      sections.forEach((section, index) => {
        if (section.heading) {
          pdf.fontSize(15).fillColor("#111827").text(section.heading);
          pdf.moveDown(0.3);
        } else if (index === 0) {
          pdf.fontSize(15).fillColor("#111827").text(params.includeRequestMetadata === false ? "Document content" : "Request Body");
          pdf.moveDown(0.3);
        }

        const bodyLines = section.body
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        if (!bodyLines.length) {
          pdf.fontSize(11).fillColor("#374151").text("No details provided.");
          pdf.moveDown(0.8);
          return;
        }

        bodyLines.forEach((line) => {
          if (/^[-*]\s+/.test(line)) {
            pdf.fontSize(11).fillColor("#374151").text(line.replace(/^[-*]\s+/, "• "), {
              indent: 12,
            });
            return;
          }
          pdf.fontSize(11).fillColor("#374151").text(line, {
            lineGap: 2,
          });
        });

        pdf.moveDown(0.9);
      });
    }

    pdf.fontSize(9).fillColor("#6b7280").text(
      "This PDF was generated from a user-authored text request. Review financial figures against source records before sharing."
    );

    pdf.end();

    await Promise.race([
      once(uploadStream, "finish"),
      once(uploadStream, "error").then(([error]) => {
        throw error;
      }),
    ]);
  } catch (error) {
    try {
      (pdf as any).destroy?.();
    } catch {
      // ignore cleanup failure
    }
    try {
      uploadStream.destroy();
    } catch {
      // ignore cleanup failure
    }
    await deleteGridFsFile(fileId.toString()).catch(() => null);
    throw error;
  }

  return {
    fileId,
    filename,
    contentType: "application/pdf",
    bytes,
  };
};

export const renderPdfFromTextRequest = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  requestId: string;
  title: string;
  promptText: string;
  sourceLabel?: string;
  filenameStem?: string;
  includeRequestMetadata?: boolean;
}) => writePdfArtifact(params);

export const previewPdfRequestSections = (promptText: string) => sectionize(promptText);

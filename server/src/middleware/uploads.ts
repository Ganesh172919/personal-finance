/**
 * @fileoverview File Upload Middleware Configuration
 *
 * This module configures Multer middleware for handling file uploads in the
 * FinWise application. It provides specialized upload handlers for different
 * file types (receipts, journals, CSV files, workspace files).
 *
 * SECURITY LAYERS:
 * 1. MIME type validation (fileFilter): Checks the Content-Type header
 * 2. File size limits: Prevents denial-of-service via large uploads
 * 3. Magic-byte validation: Verifies actual file content matches claimed type
 *
 * WHY MEMORY STORAGE?
 * Files are stored in memory (Buffer) rather than disk because:
 * - They're processed immediately (OCR, CSV parsing) and don't need persistence
 * - GridFS is used for long-term file storage
 * - Memory storage avoids filesystem cleanup complexity
 *
 * MAGIC-BYTE VALIDATION:
 * Attackers can spoof MIME types (claim a file is an image when it's actually
 * an executable). Magic-byte validation reads the first few bytes of the file
 * to determine its true type. This is done AFTER multer processes the file.
 *
 * @module middleware/uploads
 */

import multer from "multer";
import type { Request } from "express";
import { getEnv } from "../config/env";
import { HttpError } from "./httpError";

// Factory generating configured in-memory Multer instances with strict payload size caps.
// Enforces allowed MIME type filtering to reject unsupported files before processing.
const createUpload = (params: { maxBytes: number; allowedMimes?: string[] }) => {
  const env = getEnv();
  const allowed = new Set(params.allowedMimes || env.UPLOAD_ALLOWED_MIME);

  return multer({
    // Store files in memory (as Buffer objects) for immediate processing
    storage: multer.memoryStorage(),
    // Enforce file size limit to prevent DoS attacks
    limits: { fileSize: params.maxBytes },
    // Validate MIME type before accepting the upload
    fileFilter: (_req: Request, file: { mimetype?: string }, cb: (error: any, acceptFile?: boolean) => void) => {
      const mimetype = file.mimetype || "";
      if (!allowed.has(mimetype)) {
        cb(new HttpError(400, "UNSUPPORTED_MEDIA_TYPE", `Unsupported file type: ${mimetype || "unknown"}`));
        return;
      }
      cb(null, true); // Accept the file
    },
  });
};

// ── Magic-byte validation ─────────────────────────────────────────────
// Validates actual file content (not just headers) to prevent spoofed uploads.
// Attackers can set any MIME type in the request header, but magic bytes are
// embedded in the actual file content and cannot be faked.

// Supported image MIME types and their magic byte signatures
const IMAGE_MAGIC_BYTE_MIMES = new Set([
  "image/jpeg",  // FF D8 FF
  "image/png",   // 89 50 4E 47
  "image/webp",  // 52 49 46 46
  "image/gif",   // 47 49 46 38
]);

// Inspects binary buffer headers against known image magic-byte signatures using file-type.
// Prevents file extension spoofing attacks by rejecting mismatched binary content.
export const validateImageBuffer = async (buffer: Buffer): Promise<void> => {
  // Dynamic import: file-type is large, only load when needed
  const { fileTypeFromBuffer } = await import("file-type");
  const result = await fileTypeFromBuffer(buffer);

  // Reject if file type couldn't be determined or isn't an allowed image type
  if (!result || !IMAGE_MAGIC_BYTE_MIMES.has(result.mime)) {
    throw new HttpError(
      400,
      "INVALID_FILE_TYPE",
      `Uploaded file must be a genuine image (jpeg/png/webp/gif). Detected: ${result?.mime ?? "unknown"}`
    );
  }
};

// Constructs a Multer upload instance configured for receipt photo submissions.
// Applies environment-configured receipt byte limits and in-memory storage handling.
export const receiptUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.RECEIPT_UPLOAD_MAX_BYTES });
};

// Configures an in-memory Multer instance tailored for journal note image attachments.
// Enforces journal size limits and validates supported image formats.
export const journalUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.JOURNAL_UPLOAD_MAX_BYTES });
};

// Configures an in-memory Multer instance for tabular banking CSV imports.
// Restricts incoming files to valid CSV MIME types and enforces file size boundaries.
export const csvUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.CSV_UPLOAD_MAX_BYTES, allowedMimes: env.CSV_UPLOAD_ALLOWED_MIME });
};

// Instantiates an in-memory Multer instance for voice note and speech audio uploads.
// Accepts standard audio container formats up to 10MB.
export const voiceUpload = () => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });
};

// Instantiates a general-purpose in-memory Multer instance for arbitrary workspace file uploads.
// Applies maximum workspace file size limits to accommodate larger documents and reports.
export const workspaceFileUpload = () => {
  const env = getEnv();

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.FILE_UPLOAD_MAX_BYTES },
  });
};

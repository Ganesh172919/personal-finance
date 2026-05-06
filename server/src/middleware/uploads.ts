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

/**
 * Factory function that creates a configured Multer instance.
 *
 * @param params.maxBytes - Maximum file size in bytes
 * @param params.allowedMimes - Optional override for allowed MIME types
 * @returns Configured Multer instance
 */
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

/**
 * Validates that an uploaded buffer's actual magic bytes match an allowed image type.
 *
 * This is a second layer of defense after Multer's MIME type check.
 * Call this AFTER multer processes the file but BEFORE sending it to OCR or other processing.
 *
 * Uses dynamic import of 'file-type' to avoid loading it at startup (it's a large module).
 *
 * @param buffer - The uploaded file buffer to validate
 * @throws {HttpError} 400 if the file is not a genuine image
 */
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

/**
 * Multer instance configured for receipt image uploads.
 * Max size: 8MB (configurable via RECEIPT_UPLOAD_MAX_BYTES env var)
 */
export const receiptUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.RECEIPT_UPLOAD_MAX_BYTES });
};

/**
 * Multer instance configured for journal image uploads.
 * Max size: 4MB (configurable via JOURNAL_UPLOAD_MAX_BYTES env var)
 */
export const journalUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.JOURNAL_UPLOAD_MAX_BYTES });
};

/**
 * Multer instance configured for CSV file uploads.
 * Max size: 15MB (configurable via CSV_UPLOAD_MAX_BYTES env var)
 * Allowed MIME types: text/csv, application/vnd.ms-excel, application/csv
 */
export const csvUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.CSV_UPLOAD_MAX_BYTES, allowedMimes: env.CSV_UPLOAD_ALLOWED_MIME });
};

/**
 * Multer instance configured for general workspace file uploads.
 * Max size: 25MB (configurable via FILE_UPLOAD_MAX_BYTES env var)
 * No MIME type filtering (any file type allowed).
 */
export const workspaceFileUpload = () => {
  const env = getEnv();

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.FILE_UPLOAD_MAX_BYTES },
  });
};

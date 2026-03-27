import multer from "multer";
import type { Request } from "express";
import { getEnv } from "../config/env";
import { HttpError } from "./httpError";

const createUpload = (params: { maxBytes: number; allowedMimes?: string[] }) => {
  const env = getEnv();
  const allowed = new Set(params.allowedMimes || env.UPLOAD_ALLOWED_MIME);

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: params.maxBytes },
    fileFilter: (_req: Request, file: { mimetype?: string }, cb: (error: any, acceptFile?: boolean) => void) => {
      const mimetype = file.mimetype || "";
      if (!allowed.has(mimetype)) {
        cb(new HttpError(400, "UNSUPPORTED_MEDIA_TYPE", `Unsupported file type: ${mimetype || "unknown"}`));
        return;
      }
      cb(null, true);
    },
  });
};

// ── Magic-byte validation ─────────────────────────────────────────────
// Validates actual file content (not just headers) to prevent spoofed uploads.

const IMAGE_MAGIC_BYTE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Validate that an uploaded buffer's actual magic bytes match an allowed image type.
 * Call this AFTER multer but BEFORE processing (e.g., sending to OCR).
 * Throws HttpError(400) if the file is not a genuine image.
 */
export const validateImageBuffer = async (buffer: Buffer): Promise<void> => {
  const { fileTypeFromBuffer } = await import("file-type");
  const result = await fileTypeFromBuffer(buffer);
  if (!result || !IMAGE_MAGIC_BYTE_MIMES.has(result.mime)) {
    throw new HttpError(
      400,
      "INVALID_FILE_TYPE",
      `Uploaded file must be a genuine image (jpeg/png/webp/gif). Detected: ${result?.mime ?? "unknown"}`
    );
  }
};

export const receiptUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.RECEIPT_UPLOAD_MAX_BYTES });
};

export const journalUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.JOURNAL_UPLOAD_MAX_BYTES });
};

export const csvUpload = () => {
  const env = getEnv();
  return createUpload({ maxBytes: env.CSV_UPLOAD_MAX_BYTES, allowedMimes: env.CSV_UPLOAD_ALLOWED_MIME });
};

export const workspaceFileUpload = () => {
  const env = getEnv();

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.FILE_UPLOAD_MAX_BYTES },
  });
};

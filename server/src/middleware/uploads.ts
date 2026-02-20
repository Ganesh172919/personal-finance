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

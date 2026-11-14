/**
 * @fileoverview Media Controller
 *
 * Serves user-owned files from GridFS as inline responses. Acts as a
 * private CDN endpoint -- the caller must be authenticated and must own
 * the file (verified via assertGridFsOwnership).
 *
 * Routes served:
 *   GET /api/media/:fileId - getMediaByFileId
 *
 * Key patterns:
 *   - Streams file content directly from GridFS to the HTTP response
 *   - Sets Content-Type from the stored file metadata
 *   - Cleans up the read stream if the client disconnects early
 *
 * @module controllers/mediaController
 */

import type { Request, Response } from "express";
import { IUserDocument } from "../models/userModel";
import { assertGridFsOwnership, openGridFsDownloadStream } from "../services/gridfs";
import { HttpError } from "../middleware/httpError";
import ReceiptModel from "../models/receiptModel";
import JournalEntryModel from "../models/journalEntryModel";

// Streams authenticated GridFS binary assets directly to client response channels.
// Enforces caller file ownership and configures inline media content headers.
// Handles socket connection teardown to gracefully terminate file streaming.
export const getMediaByFileId = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const fileId = String((req as any).params?.fileId || "");
  if (!req.org?.orgId) {
    throw new HttpError(403, "ORG_CONTEXT_REQUIRED", "Organization context is required");
  }

  // New files carry tenant metadata. Older receipt/journal uploads did not;
  // resolve their owning record under the active tenant before streaming.
  const file = await assertGridFsOwnership({ fileId, userId: user._id.toString() });
  if (file.metadata?.orgId !== String(req.org.orgId)) {
    if (file.metadata?.orgId) throw new HttpError(404, "NOT_FOUND", "File not found");
    const owner = { fileId, orgId: req.org.orgId, userId: user._id };
    const legacyOwned = file.metadata?.purpose === "receipt"
      ? await ReceiptModel.exists(owner)
      : file.metadata?.purpose === "journal" ? await JournalEntryModel.exists(owner) : null;
    if (!legacyOwned) throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  const contentType = (file as any).contentType ? String((file as any).contentType) : "application/octet-stream";
  const filename = file.filename ? String(file.filename) : "file";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `inline; filename=\"${filename.replace(/\"/g, "")}\"`);

  const stream = openGridFsDownloadStream(fileId);

  stream.once("error", err => {
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : "Failed to fetch file";
      res.status(500).json({ message, code: "MEDIA_ERROR", request_id: req.requestId });
    } else {
      res.end();
    }
  });

  // If the client disconnects early, stop reading.
  res.once("close", () => {
    stream.destroy();
  });

  stream.pipe(res);
};

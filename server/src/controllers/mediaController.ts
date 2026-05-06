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

export const getMediaByFileId = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const fileId = String((req as any).params?.fileId || "");

  const file = await assertGridFsOwnership({ fileId, userId: user._id.toString() });

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

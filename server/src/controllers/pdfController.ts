/**
 * pdfController.ts - PDF Rendering & Retrieval Controller
 * ========================================================
 * 
 * Express request handlers for text-to-PDF rendering and GridFS streaming downloads.
 * 
 * MINDMAP FLOW
 * ------------
 * ```
 * PDF Controller
 * ├── 1. Auth & Context Guard
 * │   ├── requireOrgId (Validate Org ObjectId in req.org)
 * │   └── requireUser (Validate User ObjectId in req.user)
 * ├── 2. POST /render-prompt (renderPdfFromPromptText)
 * │   ├── Validate prompt_text presence
 * │   ├── Call renderPdfFromTextRequest()
 * │   └── Return download URL & metadata payload
 * ├── 3. POST /:workspaceFileId/render-pdf (renderPdfFromWorkspaceTextFile)
 * │   ├── Look up WorkspaceFileModel by orgId + userId + fileId
 * │   ├── Read text content from GridFS stream
 * │   ├── Render structured PDF via PDFKit
 * │   └── Return download URL
 * └── 4. GET /rendered/:fileId/download (downloadRenderedPdf)
 *     ├── Ownership verification (assertGridFsOwnership)
 *     ├── Content-Type & Content-Disposition header setup
 *     └── Pipe GridFS stream directly to HTTP Response
 * ```
 * 
 * ASCII FLOW
 * ----------
 * ```
 *   +-------------------------------------------------------------+
 *   |               Client PDF Generation Request                 |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |              Org & User Context Verification                |
 *   +------------------------------+------------------------------+
 *                                  |
 *               [Is Source Text from File or Prompt?]
 *                       /                  \
 *               WORKSPACE FILE            PROMPT TEXT
 *                     /                      \
 *                    v                        v
 *         +--------------------+   +---------------------+
 *         | Fetch GridFS Text  |   | Use req.body.prompt |
 *         +---------+----------+   +----------+----------+
 *                   \                        /
 *                    \                      /
 *                     v                    v
 *   +-------------------------------------------------------------+
 *   |          renderPdfFromTextRequest(pdfRequestServer)         |
 *   |  - Render via PDFKit & stream directly to GridFS            |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   | Return JSON with download_path:                             |
 *   |   /api/workspace-files/rendered/:fileId/download            |
 *   +-------------------------------------------------------------+
 * ```
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import { HttpError } from "../middleware/httpError";
import type { IUserDocument } from "../models/userModel";
import WorkspaceFileModel from "../models/workspaceFileModel";
import { assertGridFsOwnership, findGridFsFileById, openGridFsDownloadStream } from "../services/gridfs";
import { renderPdfFromTextRequest } from "../services/pdfRequestServer";

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

const requireUser = (req: Request) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }
  return user;
};

const buildRenderedPdfResponse = (params: {
  fileId: mongoose.Types.ObjectId;
  filename: string;
  contentType: string;
  bytes: number;
  requestId: string;
}) => ({
  pdf: {
    file_id: params.fileId.toString(),
    filename: params.filename,
    content_type: params.contentType,
    bytes: params.bytes,
    download_path: `/api/files/rendered/${params.fileId.toString()}/download`,
  },
  request_id: params.requestId,
});

export const renderPdfFromPromptText = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const orgId = requireOrgId(req);
  const body = (req.body || {}) as {
    prompt_text?: string;
    title?: string;
    file_name?: string;
  };

  const promptText = typeof body.prompt_text === "string" ? body.prompt_text.trim() : "";
  if (!promptText) {
    throw new HttpError(400, "PROMPT_TEXT_REQUIRED", "prompt_text is required");
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Requested PDF";
  const fileName = typeof body.file_name === "string" && body.file_name.trim() ? body.file_name.trim() : undefined;

  const artifact = await renderPdfFromTextRequest({
    orgId,
    userId: user._id,
    requestId: req.requestId,
    title,
    promptText,
    sourceLabel: fileName,
    filenameStem: fileName || title,
  });

  return res.status(201).json(
    buildRenderedPdfResponse({
      fileId: artifact.fileId,
      filename: artifact.filename,
      contentType: artifact.contentType,
      bytes: artifact.bytes,
      requestId: req.requestId,
    })
  );
};

export const renderPdfFromWorkspaceTextFile = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const orgId = requireOrgId(req);
  const workspaceFileIdRaw = String((req.params as any)?.id || "");

  if (!mongoose.Types.ObjectId.isValid(workspaceFileIdRaw)) {
    throw new HttpError(400, "INVALID_ID", "Invalid identifier format");
  }

  const file = await WorkspaceFileModel.findOne({
    _id: new mongoose.Types.ObjectId(workspaceFileIdRaw),
    orgId,
    userId: user._id,
  }).lean();

  if (!file) {
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  const promptText = String((file as any).extractedText || "").trim();
  if (!promptText) {
    throw new HttpError(409, "FILE_TEXT_UNAVAILABLE", "The selected file does not contain extracted text to render");
  }

  const body = (req.body || {}) as { title?: string };
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : `${String((file as any).originalName)} PDF`;

  const artifact = await renderPdfFromTextRequest({
    orgId,
    userId: user._id,
    requestId: req.requestId,
    title,
    promptText,
    sourceLabel: String((file as any).originalName || ""),
    filenameStem: String((file as any).originalName || title),
  });

  return res.status(201).json(
    buildRenderedPdfResponse({
      fileId: artifact.fileId,
      filename: artifact.filename,
      contentType: artifact.contentType,
      bytes: artifact.bytes,
      requestId: req.requestId,
    })
  );
};

export const downloadRenderedPdf = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const orgId = requireOrgId(req);
  const fileId = String((req.params as any)?.fileId || "");

  await assertGridFsOwnership({
    fileId,
    userId: user._id.toString(),
    orgId: orgId.toString(),
    purpose: "export",
  });

  const file = await findGridFsFileById(fileId);
  if (!file) {
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  res.setHeader("Content-Type", String(file.contentType || "application/pdf"));
  res.setHeader("Content-Disposition", `attachment; filename="${String(file.filename || "requested_document.pdf").replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "private, max-age=0, no-store");

  const stream = openGridFsDownloadStream(fileId);
  stream.on("error", () => {
    res.status(404).end();
  });
  stream.pipe(res);
};

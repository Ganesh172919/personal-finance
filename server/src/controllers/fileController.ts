/**
 * @fileoverview Workspace File Controller
 *
 * Manages uploaded workspace files (documents, spreadsheets, images) that users
 * attach to AI conversations. Files are stored in GridFS, text is extracted on
 * upload, and AI analysis can be requested on-demand.
 *
 * Routes served:
 *   POST   /api/workspace-files              - uploadWorkspaceFiles
 *   GET    /api/workspace-files              - listWorkspaceFiles
 *   GET    /api/workspace-files/:id          - getWorkspaceFile
 *   POST   /api/workspace-files/:id/analyze  - analyzeWorkspaceFile
 *   DELETE /api/workspace-files/:id          - deleteWorkspaceFile
 *
 * Key patterns:
 *   - Files stored in GridFS via uploadBufferToGridFs
 *   - Text extraction attempted on upload; failures recorded as warnings (not blocking)
 *   - analyzeWorkspaceFile sends extracted text to AI Core with financial context
 *   - AI analysis results cached and persisted on the file document
 *   - Ownership verified via assertGridFsOwnership before delete
 *   - buildWorkspaceFileAttachmentContext exported for chat message attachment injection
 *
 * @module controllers/fileController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import { logger } from "../config/logger";
import type { IUserDocument } from "../models/userModel";
import WorkspaceFileModel from "../models/workspaceFileModel";
import AgentOutputModel from "../models/agentOutputModel";
import AiResponseCacheModel from "../models/aiResponseCacheModel";
import OrganizationModel from "../models/organizationModel";
import { HttpError } from "../middleware/httpError";
import { normalizeAiPlan } from "../schemas/aiPlanSchema";
import { processAiCoreRequest } from "../services/aiCoreClient";
import { buildChatMessageCacheKey, ttlMs } from "../services/aiCache";
import { buildProcessRequest } from "../services/aiRequestBuilder";
import { enforceFeatureLimit, recordFeatureUsage } from "../services/entitlements";
import { extractWorkspaceFileText, detectWorkspaceFileKind } from "../services/fileTextExtraction";
import { assertGridFsOwnership, deleteGridFsFile, uploadBufferToGridFs } from "../services/gridfs";
import { getJournalContextForAi } from "../services/journalContext";
import { ensureProfileWithMigration } from "../services/profileService";
import { fetchTransactionsForAi } from "../services/transactionService";

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

const getOrgAiSettings = async (orgId: mongoose.Types.ObjectId) => {
  const org = await OrganizationModel.findById(orgId)
    .select({ currency: 1, locale: 1, timezone: 1 })
    .lean();

  return {
    currency: String((org as any)?.currency || "USD"),
    locale: String((org as any)?.locale || "en-US"),
    timezone: String((org as any)?.timezone || "UTC"),
  };
};

const buildWorkspaceFileDto = (doc: any, includeExtractedText = false) => ({
  id: String(doc._id),
  fileId: String(doc.fileId),
  originalName: String(doc.originalName),
  mimeType: String(doc.mimeType),
  sizeBytes: Number(doc.sizeBytes || 0),
  extension: doc.extension ? String(doc.extension) : undefined,
  kind: String(doc.kind || "other"),
  status: String(doc.status || "uploaded"),
  extractedPreview: doc.extractedPreview ? String(doc.extractedPreview) : "",
  extractedText: includeExtractedText ? String(doc.extractedText || "") : undefined,
  extractionWarnings: Array.isArray(doc.extractionWarnings) ? doc.extractionWarnings.map((warning: unknown) => String(warning)) : [],
  lastAnalyzedAt: doc.lastAnalyzedAt,
  analysis: doc.analysis
    ? {
        summary: String(doc.analysis.summary || ""),
        response: String(doc.analysis.response || ""),
        plan: doc.analysis.plan,
        analysisType: doc.analysis.analysisType ? String(doc.analysis.analysisType) : undefined,
        agentsInvolved: Array.isArray(doc.analysis.agentsInvolved)
          ? doc.analysis.agentsInvolved.map((agent: unknown) => String(agent))
          : [],
        workflowTrace: Array.isArray(doc.analysis.workflowTrace) ? doc.analysis.workflowTrace : [],
        fallbackUsed: Boolean(doc.analysis.fallbackUsed),
        llmCallCount: Number(doc.analysis.llmCallCount || 0),
        requestId: doc.analysis.requestId ? String(doc.analysis.requestId) : undefined,
        updatedAt: doc.analysis.updatedAt,
      }
    : undefined,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const buildFileAnalysisPrompt = (params: {
  fileName: string;
  mimeType: string;
  extractedText: string;
  prompt?: string;
}) => {
  const userPrompt =
    params.prompt?.trim() ||
    "Analyze this uploaded file in the context of my finances. Highlight what matters, what action I should take, and any risks or opportunities.";

  const extractedText = params.extractedText.trim();
  const fileContext = extractedText
    ? extractedText.slice(0, 12_000)
    : "No textual content could be extracted. Focus on the file metadata and explain any limitations.";

  return [
    "The user uploaded a file and wants a finance-focused analysis.",
    `File name: ${params.fileName}`,
    `Mime type: ${params.mimeType}`,
    "",
    "Instructions:",
    "- Summarize the file in plain language.",
    "- Identify financial signals, obligations, opportunities, or red flags.",
    "- Recommend concrete next actions.",
    "- If the file is not clearly financial, explain how it could still be useful in the workspace.",
    "",
    `User ask: ${userPrompt}`,
    "",
    "Extracted file contents:",
    fileContext,
  ].join("\n");
};

export const buildWorkspaceFileAttachmentContext = (files: Array<any>) => {
  if (!files.length) return "";

  const sections = files.map((file, index) => {
    const extractedText = String(file.extractedText || "").trim();
    const preview = extractedText ? extractedText.slice(0, 2_500) : "No extracted text available.";

    return [
      `Attachment ${index + 1}: ${String(file.originalName)}`,
      `Type: ${String(file.mimeType)} | Kind: ${String(file.kind)} | Size: ${Number(file.sizeBytes || 0)} bytes`,
      "Extracted content:",
      preview,
    ].join("\n");
  });

  return `Attached workspace files:\n\n${sections.join("\n\n")}`;
};

export const uploadWorkspaceFiles = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const files = ((req as any).files || []) as Express.Multer.File[];
  if (!files.length) {
    throw new HttpError(400, "MISSING_FILE", "Missing uploaded file");
  }

  const created = await Promise.all(
    files.map(async (file) => {
      const fileId = await uploadBufferToGridFs({
        userId: user._id.toString(),
        orgId: orgId.toString(),
        purpose: "workspace_file",
        buffer: file.buffer,
        filename: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
      });

      let extracted = {
        text: "",
        preview: "",
        warnings: [] as string[],
      };
      let status: "uploaded" | "processed" | "error" = "uploaded";

      try {
        const result = await extractWorkspaceFileText({
          buffer: file.buffer,
          mimeType: file.mimetype || "application/octet-stream",
          fileName: file.originalname,
          requestId: req.requestId,
          userId: user._id.toString(),
        });
        extracted = {
          text: result.text,
          preview: result.preview,
          warnings: result.warnings,
        };
        status = "processed";
      } catch (error) {
        logger.warn({ error }, `[requestId=${req.requestId}] Failed to extract workspace file text`);
        extracted = {
          text: "",
          preview: "",
          warnings: ["The file was uploaded, but text extraction failed for this format."],
        };
        status = "error";
      }

      const doc = await WorkspaceFileModel.create({
        orgId,
        userId: user._id,
        fileId,
        originalName: file.originalname,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: Number(file.size || file.buffer.length || 0),
        extension: file.originalname.includes(".") ? file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase() : undefined,
        kind: detectWorkspaceFileKind(file.mimetype || "application/octet-stream", file.originalname),
        status,
        extractedText: extracted.text,
        extractedPreview: extracted.preview,
        extractionWarnings: extracted.warnings,
      });

      return buildWorkspaceFileDto(doc, true);
    })
  );

  return res.status(201).json({
    files: created,
    request_id: req.requestId,
  });
};

export const listWorkspaceFiles = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const page = Math.max(1, Number((req.query as any)?.page) || 1);
  const limit = Math.max(1, Math.min(100, Number((req.query as any)?.limit) || 20));
  const search = String((req.query as any)?.search || "").trim();
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {
    orgId,
    userId: user._id,
  };

  if (search) {
    query.$or = [
      { originalName: { $regex: search, $options: "i" } },
      { extractedPreview: { $regex: search, $options: "i" } },
    ];
  }

  const [total, docs] = await Promise.all([
    WorkspaceFileModel.countDocuments(query),
    WorkspaceFileModel.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return res.json({
    files: docs.map((doc) => buildWorkspaceFileDto(doc)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    request_id: req.requestId,
  });
};

export const getWorkspaceFile = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const id = String((req.params as any)?.id || "");
  const file = await WorkspaceFileModel.findOne({ _id: id, orgId, userId: user._id }).lean();
  if (!file) {
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  return res.json({
    file: buildWorkspaceFileDto(file, true),
    request_id: req.requestId,
  });
};

export const analyzeWorkspaceFile = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const id = String((req.params as any)?.id || "");
  const prompt = typeof (req.body as any)?.prompt === "string" ? String((req.body as any).prompt) : undefined;

  await enforceFeatureLimit({
    orgId,
    userId: user._id,
    feature: "monthly_ai_calls",
    units: 1,
    requestId: req.requestId,
  });

  const file = await WorkspaceFileModel.findOne({ _id: id, orgId, userId: user._id });
  if (!file) {
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  const [profile, journalContext, orgSettings, txResult] = await Promise.all([
    ensureProfileWithMigration({ orgId, userId: user._id }),
    getJournalContextForAi({ orgId, userId: user._id }),
    getOrgAiSettings(orgId),
    fetchTransactionsForAi({ orgId, userId: user._id }),
  ]);

  const profileUpdatedAt = profile.updatedAt ? new Date(profile.updatedAt).toISOString() : "unknown";
  const transactionsUpdatedAt = profile.transactionsUpdatedAt
    ? new Date(profile.transactionsUpdatedAt as unknown as Date).toISOString()
    : undefined;

  const cacheKey = buildChatMessageCacheKey({
    orgId: orgId.toString(),
    userId: user._id.toString(),
    profileUpdatedAt,
    transactionsUpdatedAt,
    journalUpdatedAt: journalContext.updatedAt,
    sessionId: file._id.toString(),
    sessionMessageCount: 0,
    sessionSummaryUpdatedAt: file.updatedAt ? new Date(file.updatedAt).toISOString() : undefined,
    content: `${file.originalName}|${prompt || ""}|${file.extractedText || ""}`.slice(0, 8_000),
    narrative: true,
  });

  const cached = await AiResponseCacheModel.findOne({ cacheKey }).lean();
  if (cached?.responseData && typeof cached.responseData === "object") {
    const responseData = cached.responseData as Record<string, unknown>;
    return res.json({
      file: {
        ...buildWorkspaceFileDto(file.toObject(), true),
        analysis: responseData,
      },
      request_id: req.requestId,
      cache_hit: true,
    });
  }

  const { request: aiRequest } = buildProcessRequest({
    userInput: buildFileAnalysisPrompt({
      fileName: file.originalName,
      mimeType: file.mimeType,
      extractedText: String(file.extractedText || ""),
      prompt,
    }),
    profile,
    orgId: orgId.toString(),
    userId: user._id.toString(),
    orgSettings,
    transactions: txResult.transactions,
    totalTransactions: txResult.stats.totalTransactions,
    sessionSummary: journalContext.summary || undefined,
    narrative: true,
  });

  const aiResponse = await processAiCoreRequest(aiRequest, req.requestId, { userId: user._id.toString() });
  const { plan: normalizedPlan } = normalizeAiPlan(aiResponse.plan);

  const responsePayload = {
    summary: String(aiResponse.final_output || "").slice(0, 280),
    response: aiResponse.final_output,
    plan: normalizedPlan,
    analysisType: aiResponse.analysis_type,
    agentsInvolved: aiResponse.agents_involved,
    workflowTrace: aiResponse.workflow_trace || [],
    fallbackUsed: aiResponse.fallback_used || false,
    llmCallCount: aiResponse.llm_call_count || 0,
    requestId: aiResponse.request_id || req.requestId,
    updatedAt: new Date(),
  };

  file.analysis = responsePayload;
  file.lastAnalyzedAt = new Date();
  await file.save();

  await AgentOutputModel.create({
    orgId,
    userId: user._id,
    sessionId: file._id.toString(),
    userInput: prompt || `Analyze uploaded file: ${file.originalName}`,
    agentType: aiResponse.agent || "master",
    outputData: {
      title: `File analysis: ${file.originalName}`,
      description: String(aiResponse.final_output || "").slice(0, 200),
      response: aiResponse.final_output,
      actionType: aiResponse.actionType || "review",
      agent: aiResponse.agent || "master",
      plan: normalizedPlan,
    },
    analysis_type: aiResponse.analysis_type || "comprehensive",
    agents_involved: aiResponse.agents_involved || ["master"],
    workflow_trace: aiResponse.workflow_trace || [],
    detailed_analysis: {
      file_id: file._id.toString(),
      mime_type: file.mimeType,
    },
    fallback_used: aiResponse.fallback_used || false,
    llm_call_count: aiResponse.llm_call_count || 0,
    request_id: aiResponse.request_id || req.requestId,
    priority: aiResponse.priority || "medium",
    actionable: true,
    timestamp: new Date(),
  }).catch(() => null);

  await AiResponseCacheModel.findOneAndUpdate(
    { cacheKey },
    {
      $set: {
        orgId,
        userId: user._id,
        endpoint: "workspace-file-analysis",
        responseData: responsePayload,
        expiresAt: new Date(Date.now() + ttlMs.chatMessage),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);

  await recordFeatureUsage({
    orgId,
    userId: user._id,
    feature: "monthly_ai_calls",
    units: 1,
    tokensIn: aiResponse.usage?.tokens_in,
    tokensOut: aiResponse.usage?.tokens_out,
    costUsd: aiResponse.usage?.cost_usd,
    modelName: aiResponse.usage?.models?.[0],
    requestId: req.requestId,
    context: {
      endpoint: "workspace-files/analyze",
      file_id: file._id.toString(),
      file_name: file.originalName,
    },
  }).catch(() => null);

  return res.json({
    file: buildWorkspaceFileDto(file.toObject(), true),
    request_id: req.requestId,
    cache_hit: false,
  });
};

export const deleteWorkspaceFile = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const id = String((req.params as any)?.id || "");
  const file = await WorkspaceFileModel.findOne({ _id: id, orgId, userId: user._id });
  if (!file) {
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  await assertGridFsOwnership({
    fileId: file.fileId.toString(),
    userId: user._id.toString(),
    orgId: orgId.toString(),
    purpose: "workspace_file",
  });

  await WorkspaceFileModel.deleteOne({ _id: file._id });
  await deleteGridFsFile(file.fileId.toString()).catch((error) => {
    logger.warn({ error }, `[requestId=${req.requestId}] Failed to delete workspace GridFS file`);
  });

  return res.json({
    file_id: id,
    request_id: req.requestId,
  });
};

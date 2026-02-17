import type { Request, Response } from "express";
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import AgentOutputModel from "../models/agentOutputModel";
import JournalEntryModel from "../models/journalEntryModel";
import { IUserDocument } from "../models/userModel";
import { processAiCoreHandwriting, processAiCoreRequest } from "../services/aiCoreClient";
import { buildProcessRequest } from "../services/aiRequestBuilder";
import { uploadBufferToGridFs } from "../services/gridfs";
import { parseJournalIntent } from "../services/journalIntentParser";
import { ensureProfileWithMigration } from "../services/profileService";
import { fetchTransactionsForAi } from "../services/transactionService";
import { normalizeAiPlan } from "../schemas/aiPlanSchema";

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

export const recognizeHandwriting = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file?.buffer || !file.originalname) {
    throw new HttpError(400, "MISSING_FILE", "Missing handwriting image file");
  }

  const lang = typeof req.body?.lang === "string" ? req.body.lang.trim() : "en";
  const strokes = parseMaybeJson(req.body?.strokes);

  const fileId = await uploadBufferToGridFs({
    userId: user._id.toString(),
    purpose: "journal",
    buffer: file.buffer,
    filename: file.originalname,
    contentType: file.mimetype || "application/octet-stream",
  });

  const recognition = await processAiCoreHandwriting(
    {
      image: file.buffer,
      contentType: file.mimetype || "application/octet-stream",
      lang,
    },
    req.requestId,
    { userId: user._id.toString() }
  );

  const entry = await JournalEntryModel.create({
    userId: user._id,
    fileId,
    strokes,
    recognizedText: String(recognition.recognized_text || ""),
    confidence: recognition.confidence || {},
    parsedIntent: recognition.detected_values || {},
  });

  await AgentOutputModel.create({
    userId: user._id,
    sessionId: entry._id.toString(),
    userInput: String(recognition.recognized_text || "(handwriting)").slice(0, 5000),
    agentType: "journal_annotation",
    outputData: {
      entry_id: entry._id.toString(),
      recognized_text: recognition.recognized_text,
      confidence: recognition.confidence,
      parsed_intent: recognition.detected_values,
    },
    analysis_type: "journal",
    agents_involved: ["user"],
    priority: "low",
    actionable: true,
    request_id: recognition.request_id || req.requestId,
    timestamp: new Date(),
  });

  res.json({
    entry_id: entry._id.toString(),
    file_id: fileId.toString(),
    recognized_text: recognition.recognized_text || "",
    confidence: recognition.confidence || {},
    detected_values: recognition.detected_values || {},
    warnings: Array.isArray(recognition.warnings) ? recognition.warnings : [],
    request_id: recognition.request_id || req.requestId,
    success: Boolean(recognition.success),
  });
};

export const listJournalEntries = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const page = Math.max(1, Number((req as any).query?.page) || 1);
  const limit = Math.max(1, Math.min(100, Number((req as any).query?.limit) || 20));
  const skip = (page - 1) * limit;

  const [total, docs] = await Promise.all([
    JournalEntryModel.countDocuments({ userId: user._id }),
    JournalEntryModel.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    entries: docs.map(doc => ({
      id: String((doc as any)._id),
      recognizedText: String((doc as any).recognizedText || ""),
      confidence: (doc as any).confidence || {},
      parsedIntent: (doc as any).parsedIntent || {},
      fileId: (doc as any).fileId ? String((doc as any).fileId) : undefined,
      createdAt: (doc as any).createdAt,
      updatedAt: (doc as any).updatedAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    request_id: req.requestId,
  });
};

export const getJournalEntryById = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const entryId = String((req as any).params?.id || "");

  const entry = await JournalEntryModel.findOne({ _id: entryId, userId: user._id }).lean();
  if (!entry) {
    throw new HttpError(404, "NOT_FOUND", "Journal entry not found");
  }

  res.json({
    entry: {
      id: String((entry as any)._id),
      recognizedText: String((entry as any).recognizedText || ""),
      confidence: (entry as any).confidence || {},
      parsedIntent: (entry as any).parsedIntent || {},
      strokes: (entry as any).strokes,
      fileId: (entry as any).fileId ? String((entry as any).fileId) : undefined,
      createdAt: (entry as any).createdAt,
      updatedAt: (entry as any).updatedAt,
    },
    request_id: req.requestId,
  });
};

export const patchJournalEntry = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const entryId = String((req as any).params?.id || "");

  const recognizedText = String((req.body as any)?.recognized_text || "").slice(0, 5000);
  const parsedIntent = parseJournalIntent(recognizedText);

  const entry = await JournalEntryModel.findOneAndUpdate(
    { _id: entryId, userId: user._id },
    { $set: { recognizedText, parsedIntent } },
    { new: true }
  ).lean();

  if (!entry) {
    throw new HttpError(404, "NOT_FOUND", "Journal entry not found");
  }

  res.json({
    entry: {
      id: String((entry as any)._id),
      recognizedText: String((entry as any).recognizedText || ""),
      confidence: (entry as any).confidence || {},
      parsedIntent: (entry as any).parsedIntent || {},
      strokes: (entry as any).strokes,
      fileId: (entry as any).fileId ? String((entry as any).fileId) : undefined,
      createdAt: (entry as any).createdAt,
      updatedAt: (entry as any).updatedAt,
    },
    request_id: req.requestId,
  });
};

export const generateJournalInsights = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const entryId = String((req as any).params?.id || "");

  const entry = await JournalEntryModel.findOne({ _id: entryId, userId: user._id });
  if (!entry) {
    throw new HttpError(404, "NOT_FOUND", "Journal entry not found");
  }

  const profile = await ensureProfileWithMigration(user._id);
  const txResult = await fetchTransactionsForAi({ userId: user._id });

  const prompt =
    "You are a personal finance coach. The user wrote a journal note.\n" +
    "1) Extract the user's intent (goals, budgets, amounts).\n" +
    "2) Give up to 5 concise recommendations.\n" +
    "3) If there are numbers, restate them clearly.\n\n" +
    "Journal note:\n" +
    entry.recognizedText;

  const { request: aiRequest } = buildProcessRequest({
    userInput: prompt,
    profile,
    transactions: txResult.transactions,
    totalTransactions: txResult.stats.totalTransactions,
    narrative: true,
  });

  const aiResponse = await processAiCoreRequest(aiRequest, req.requestId, { userId: user._id.toString() });
  const { plan: normalizedPlan } = normalizeAiPlan(aiResponse.plan);

  const stored = await AgentOutputModel.create({
    userId: user._id,
    sessionId: entry._id.toString(),
    userInput: entry.recognizedText.slice(0, 5000),
    agentType: "journal_insights",
    outputData: {
      entry_id: entry._id.toString(),
      recognized_text: entry.recognizedText,
      response: aiResponse.final_output,
      agent: aiResponse.agent,
      actionType: aiResponse.actionType,
      plan: normalizedPlan,
      insights: aiResponse.insights || [],
      fallback_used: aiResponse.fallback_used,
      llm_call_count: aiResponse.llm_call_count,
    },
    analysis_type: aiResponse.analysis_type || "comprehensive",
    agents_involved: aiResponse.agents_involved || [aiResponse.agent || "master"],
    workflow_trace: aiResponse.workflow_trace || [],
    detailed_analysis: aiResponse.detailed_analysis || {},
    fallback_used: aiResponse.fallback_used,
    llm_call_count: aiResponse.llm_call_count,
    request_id: aiResponse.request_id || req.requestId,
    priority: aiResponse.priority || "medium",
    actionable: true,
    timestamp: new Date(),
  });

  res.json({
    success: true,
    entry_id: entry._id.toString(),
    agent_output_id: stored._id.toString(),
    response: aiResponse.final_output,
    plan: normalizedPlan,
    analysis_type: aiResponse.analysis_type,
    agents_involved: aiResponse.agents_involved,
    insights: aiResponse.insights,
    fallback_used: aiResponse.fallback_used,
    llm_call_count: aiResponse.llm_call_count,
    request_id: aiResponse.request_id || req.requestId,
  });
};

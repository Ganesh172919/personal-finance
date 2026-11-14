/**
 * @fileoverview Financial Journal Controller
 *
 * Handwriting-based financial journal. Users upload photos of handwritten notes,
 * which are OCR-recognized and parsed into structured financial intents. AI can
 * then generate insights from journal entries. Also provides offline stroke batch
 * synchronization and dense semantic vector search with cosine similarity.
 *
 * Routes served:
 *   POST   /api/financial-journal/recognize-handwriting  - recognizeHandwriting (upload + OCR)
 *   GET    /api/financial-journal/entries                - listJournalEntries
 *   GET    /api/financial-journal/entries/:id            - getJournalEntryById
 *   PATCH  /api/financial-journal/entries/:id            - patchJournalEntry (edit text, tags, title)
 *   POST   /api/financial-journal/entries/:id/insights   - generateJournalInsights (AI analysis)
 *   POST   /api/financial-journal/entries/batch-sync     - batchSyncOfflineStrokes (offline drafts queue)
 *   GET    /api/financial-journal/semantic-search        - semanticSearchJournal (vector cosine similarity)
 *
 * Key patterns:
 *   - Feature-gated: all endpoints return 404 when JOURNAL_ENABLED is false
 *   - Handwriting images stored in GridFS; text extracted via AI Core OCR
 *   - Journal intent parser extracts financial signals from recognized text
 *   - Offline drafts synced idempotently with clientDraftId deduplication
 *   - Deterministic 64-dimensional semantic embeddings with cosine similarity search
 *
 * @module controllers/financialJournalController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import AgentOutputModel from "../models/agentOutputModel";
import JournalEntryModel from "../models/journalEntryModel";
import OrganizationModel from "../models/organizationModel";
import { IUserDocument } from "../models/userModel";
import { processAiCoreHandwriting, processAiCoreRequest } from "../services/aiCoreClient";
import { buildProcessRequest } from "../services/aiRequestBuilder";
import { uploadBufferToGridFs } from "../services/gridfs";
import {
  analyzeJournalSentiment,
  cosineSimilarity,
  extractJournalTags,
  generateTextEmbedding,
} from "../services/journalEmbeddingService";
import { parseJournalIntent } from "../services/journalIntentParser";
import { ensureProfileWithMigration } from "../services/profileService";
import { fetchTransactionsForAi } from "../services/transactionService";
import { normalizeAiPlan } from "../schemas/aiPlanSchema";

// Attempts to safely parse an unknown input value as a JSON document structure.
// Validates that the input is a non-empty string prior to invoking JSON parse logic.
// Returns the deserialized JSON object if valid or undefined on syntax errors.
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

// Verifies tenant organization context attached to the authenticated request.
// Confirms that the extracted organization string satisfies MongoDB ObjectId rules.
// Throws an unauthorized HTTP exception if organization context is not present.
const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

// Reads localized currency, language locale, and timezone settings for an organization.
// Pulls configured tenant preferences from storage to contextualize AI prompt queries.
// Defaults gracefully to USD currency, en-US locale, and UTC timezone settings.
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

// Uploads handwritten journal note images to GridFS and processes them via AI OCR.
// Extracts recognized text, semantic tags, sentiment indicators, and vector embeddings.
// Persists the newly created journal entry document and returns its details.
export const recognizeHandwriting = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file?.buffer || !file.originalname) {
    throw new HttpError(400, "MISSING_FILE", "Missing handwriting image file");
  }

  const lang = typeof req.body?.lang === "string" ? req.body.lang.trim() : "en";
  const strokes = parseMaybeJson(req.body?.strokes);

  const fileId = await uploadBufferToGridFs({
    userId: user._id.toString(),
    orgId: orgId.toString(),
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

  const recognizedText = String(recognition.recognized_text || "");
  const tags = extractJournalTags(recognizedText);
  const sentiment = analyzeJournalSentiment(recognizedText);
  const embedding = generateTextEmbedding(recognizedText, tags);

  const entry = await JournalEntryModel.create({
    orgId,
    userId: user._id,
    fileId,
    strokes,
    recognizedText,
    confidence: recognition.confidence || {},
    parsedIntent: recognition.detected_values || {},
    tags,
    sentiment,
    embedding,
  });

  await AgentOutputModel.create({
    orgId,
    userId: user._id,
    sessionId: entry._id.toString(),
    userInput: recognizedText.slice(0, 5000) || "(handwriting)",
    agentType: "journal_annotation",
    outputData: {
      entry_id: entry._id.toString(),
      recognized_text: recognition.recognized_text,
      confidence: recognition.confidence,
      parsed_intent: recognition.detected_values,
      tags,
      sentiment,
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
    tags,
    sentiment,
    has_embedding: embedding.length > 0,
    request_id: recognition.request_id || req.requestId,
    success: Boolean(recognition.success),
  });
};

// Queries a paginated list of financial journal entries for the current user and tenant.
// Supports full-text search across titles and recognized handwritten text bodies.
// Returns an array of journal entry records accompanied by pagination metadata.
export const listJournalEntries = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const page = Math.max(1, Number((req as any).query?.page) || 1);
  const limit = Math.max(1, Math.min(100, Number((req as any).query?.limit) || 20));
  const skip = (page - 1) * limit;

  const [total, docs] = await Promise.all([
    JournalEntryModel.countDocuments({ orgId, userId: user._id }),
    JournalEntryModel.find({ orgId, userId: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    entries: docs.map((doc) => ({
      id: String((doc as any)._id),
      clientDraftId: (doc as any).clientDraftId || undefined,
      title: (doc as any).title || "",
      recognizedText: String((doc as any).recognizedText || ""),
      confidence: (doc as any).confidence || {},
      parsedIntent: (doc as any).parsedIntent || {},
      tags: (doc as any).tags || [],
      sentiment: (doc as any).sentiment || "neutral",
      fileId: (doc as any).fileId ? String((doc as any).fileId) : undefined,
      hasEmbedding: Array.isArray((doc as any).embedding) && (doc as any).embedding.length > 0,
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

// Resolves a specific financial journal entry by its unique database identifier.
// Verifies tenant isolation and caller ownership permissions before returning data.
// Throws a not found exception if no corresponding journal document exists.
export const getJournalEntryById = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const entryId = String((req as any).params?.id || "");

  const entry = await JournalEntryModel.findOne({ _id: entryId, orgId, userId: user._id }).lean();
  if (!entry) {
    throw new HttpError(404, "NOT_FOUND", "Journal entry not found");
  }

  res.json({
    entry: {
      id: String((entry as any)._id),
      clientDraftId: (entry as any).clientDraftId || undefined,
      title: (entry as any).title || "",
      recognizedText: String((entry as any).recognizedText || ""),
      confidence: (entry as any).confidence || {},
      parsedIntent: (entry as any).parsedIntent || {},
      tags: (entry as any).tags || [],
      sentiment: (entry as any).sentiment || "neutral",
      strokes: (entry as any).strokes,
      fileId: (entry as any).fileId ? String((entry as any).fileId) : undefined,
      hasEmbedding: Array.isArray((entry as any).embedding) && (entry as any).embedding.length > 0,
      createdAt: (entry as any).createdAt,
      updatedAt: (entry as any).updatedAt,
    },
    request_id: req.requestId,
  });
};

// Updates editable attributes of an existing financial journal entry document.
// Allows revisions to titles, recognized text contents, and associated tag arrays.
// Re-indexes vector embeddings when textual content is modified and saves changes.
export const patchJournalEntry = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const entryId = String((req as any).params?.id || "");

  const recognizedText = String((req.body as any)?.recognized_text || "").slice(0, 5000);
  const parsedIntent = parseJournalIntent(recognizedText);

  const manualTags = Array.isArray((req.body as any)?.tags) ? (req.body as any).tags : [];
  const tags = extractJournalTags(recognizedText, manualTags);
  const sentiment = analyzeJournalSentiment(recognizedText);
  const embedding = generateTextEmbedding(recognizedText, tags);

  const updateFields: Record<string, any> = {
    recognizedText,
    parsedIntent,
    tags,
    sentiment,
    embedding,
  };

  if (typeof (req.body as any)?.title === "string") {
    updateFields.title = (req.body as any).title.trim();
  }

  const entry = await JournalEntryModel.findOneAndUpdate(
    { _id: entryId, orgId, userId: user._id },
    { $set: updateFields },
    { new: true }
  ).lean();

  if (!entry) {
    throw new HttpError(404, "NOT_FOUND", "Journal entry not found");
  }

  res.json({
    entry: {
      id: String((entry as any)._id),
      clientDraftId: (entry as any).clientDraftId || undefined,
      title: (entry as any).title || "",
      recognizedText: String((entry as any).recognizedText || ""),
      confidence: (entry as any).confidence || {},
      parsedIntent: (entry as any).parsedIntent || {},
      tags: (entry as any).tags || [],
      sentiment: (entry as any).sentiment || "neutral",
      strokes: (entry as any).strokes,
      fileId: (entry as any).fileId ? String((entry as any).fileId) : undefined,
      hasEmbedding: Array.isArray((entry as any).embedding) && (entry as any).embedding.length > 0,
      createdAt: (entry as any).createdAt,
      updatedAt: (entry as any).updatedAt,
    },
    request_id: req.requestId,
  });
};

// Idempotently synchronizes batches of offline canvas stroke drafts from client devices.
// Deduplicates submissions using unique client draft keys to prevent redundant entries.
// Generates persistent journal records from offline stroke coordinates and text.
export const batchSyncOfflineStrokes = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const notes = Array.isArray(req.body?.notes) ? req.body.notes : [];

  if (notes.length === 0) {
    return res.json({
      success: true,
      syncedCount: 0,
      duplicatesSkipped: 0,
      entries: [],
      request_id: req.requestId,
    });
  }

  // Lookup existing drafts to prevent duplicates
  const draftIds = notes.map((n: any) => String(n.clientDraftId || "").trim()).filter(Boolean);
  const existingDocs = await JournalEntryModel.find({
    orgId,
    userId: user._id,
    clientDraftId: { $in: draftIds },
  }).lean();

  const existingMap = new Map<string, any>();
  for (const doc of existingDocs) {
    if ((doc as any).clientDraftId) {
      existingMap.set((doc as any).clientDraftId, doc);
    }
  }

  const syncedEntries: any[] = [];
  let duplicatesSkipped = 0;

  for (const note of notes) {
    const clientDraftId = String(note.clientDraftId || "").trim();
    if (!clientDraftId) continue;

    if (existingMap.has(clientDraftId)) {
      duplicatesSkipped++;
      const existing = existingMap.get(clientDraftId);
      syncedEntries.push({
        id: String(existing._id),
        clientDraftId,
        title: existing.title || "",
        recognizedText: existing.recognizedText || "",
        tags: existing.tags || [],
        sentiment: existing.sentiment || "neutral",
        parsedIntent: existing.parsedIntent || {},
        createdAt: existing.createdAt,
        isDuplicate: true,
      });
      continue;
    }

    const recognizedText = String(note.recognizedText || "").trim();
    const parsedIntent = parseJournalIntent(recognizedText);
    const tags = extractJournalTags(recognizedText, Array.isArray(note.tags) ? note.tags : []);
    const sentiment = analyzeJournalSentiment(recognizedText);
    const embedding = generateTextEmbedding(recognizedText, tags);
    const title = typeof note.title === "string" ? note.title.trim() : "";
    const createdAt = note.createdAt ? new Date(note.createdAt) : new Date();

    const newDoc = await JournalEntryModel.create({
      orgId,
      userId: user._id,
      clientDraftId,
      title,
      strokes: note.strokes,
      recognizedText,
      confidence: { overall: recognizedText ? 1.0 : 0.5 },
      parsedIntent,
      tags,
      sentiment,
      embedding,
      createdAt,
    });

    syncedEntries.push({
      id: String(newDoc._id),
      clientDraftId,
      title: newDoc.title || "",
      recognizedText: newDoc.recognizedText || "",
      tags: newDoc.tags || [],
      sentiment: newDoc.sentiment || "neutral",
      parsedIntent: newDoc.parsedIntent || {},
      createdAt: newDoc.createdAt,
      isDuplicate: false,
    });
  }

  res.json({
    success: true,
    syncedCount: syncedEntries.length - duplicatesSkipped,
    duplicatesSkipped,
    entries: syncedEntries,
    request_id: req.requestId,
  });
};

// Executes dense semantic vector searches across stored financial journal records.
// Calculates cosine similarity against vector embeddings representing journal notes.
// Delivers ranked search results matching the conceptual intent of the query.
export const semanticSearchJournal = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);

  const query = String((req as any).query?.query || "").trim();
  const threshold = Math.max(0, Math.min(1, Number((req as any).query?.threshold) || 0.1));
  const limit = Math.max(1, Math.min(50, Number((req as any).query?.limit) || 10));
  const tagFilter = typeof (req as any).query?.tag === "string" && (req as any).query.tag.trim()
    ? (req as any).query.tag.trim().toLowerCase()
    : undefined;

  const queryEmbedding = generateTextEmbedding(query);

  const queryFilter: any = { orgId, userId: user._id };
  if (tagFilter) {
    queryFilter.tags = tagFilter;
  }

  const entries = await JournalEntryModel.find(queryFilter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const scoredResults: any[] = [];

  for (const entry of entries) {
    let score = 0;
    const entryEmbedding =
      Array.isArray((entry as any).embedding) && (entry as any).embedding.length > 0
        ? (entry as any).embedding
        : generateTextEmbedding((entry as any).recognizedText || "", (entry as any).tags || []);

    score = cosineSimilarity(queryEmbedding, entryEmbedding);

    // Exact lexical phrase bonus if query is directly found in text
    const textLower = ((entry as any).recognizedText || "").toLowerCase();
    if (query && textLower.includes(query.toLowerCase())) {
      score = Math.min(1.0, score + 0.15);
    }

    if (score >= threshold) {
      scoredResults.push({
        id: String((entry as any)._id),
        title: (entry as any).title || "",
        clientDraftId: (entry as any).clientDraftId || undefined,
        recognizedText: (entry as any).recognizedText || "",
        tags: (entry as any).tags || [],
        sentiment: (entry as any).sentiment || "neutral",
        parsedIntent: (entry as any).parsedIntent || {},
        similarityScore: Number(score.toFixed(4)),
        createdAt: (entry as any).createdAt,
      });
    }
  }

  scoredResults.sort((a, b) => b.similarityScore - a.similarityScore);

  res.json({
    query,
    threshold,
    totalMatches: scoredResults.length,
    results: scoredResults.slice(0, limit),
    request_id: req.requestId,
  });
};

// Synthesizes qualitative insights from handwritten financial journal reflections.
// Correlates journal sentiment and goals with recent transactional account history.
// Dispatches structured AI prompts and returns tailored financial recommendations.
export const generateJournalInsights = async (req: Request, res: Response) => {
  const env = getEnv();
  if (!env.JOURNAL_ENABLED) {
    throw new HttpError(404, "NOT_FOUND", "Financial journal is disabled");
  }

  const user = req.user as IUserDocument;
  const orgId = requireOrgId(req);
  const entryId = String((req as any).params?.id || "");

  const entry = await JournalEntryModel.findOne({ _id: entryId, orgId, userId: user._id });
  if (!entry) {
    throw new HttpError(404, "NOT_FOUND", "Journal entry not found");
  }

  const [profile, txResult, orgSettings] = await Promise.all([
    ensureProfileWithMigration({ orgId, userId: user._id }),
    fetchTransactionsForAi({ orgId, userId: user._id }),
    getOrgAiSettings(orgId),
  ]);

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
    orgId: orgId.toString(),
    userId: user._id.toString(),
    orgSettings,
    transactions: txResult.transactions,
    totalTransactions: txResult.stats.totalTransactions,
    narrative: true,
  });

  const aiResponse = await processAiCoreRequest(aiRequest, req.requestId, { userId: user._id.toString() });
  const { plan: normalizedPlan } = normalizeAiPlan(aiResponse.plan);

  const stored = await AgentOutputModel.create({
    orgId,
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

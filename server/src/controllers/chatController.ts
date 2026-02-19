import { Request, Response } from "express";
import ChatSessionModel, { IChatSessionDocument } from "../models/chatSessionModel";
import ChatMessageModel, { IChatMessageDocument } from "../models/chatMessageModel";
import AiResponseCacheModel from "../models/aiResponseCacheModel";
import AgentOutputModel from "../models/agentOutputModel";
import { IUserDocument } from "../models/userModel";
import OrganizationModel from "../models/organizationModel";
import mongoose from "mongoose";
import { processAiCoreRequest } from "../services/aiCoreClient";
import { buildProcessRequest } from "../services/aiRequestBuilder";
import { buildChatMessageCacheKey, ttlMs } from "../services/aiCache";
import { buildDeterministicChatSummary } from "../services/chatSummary";
import { ensureProfileWithMigration } from "../services/profileService";
import { fetchTransactionsForAi } from "../services/transactionService";
import { getJournalContextForAi } from "../services/journalContext";
import { normalizeAiPlan } from "../schemas/aiPlanSchema";
import { recordAiCache, recordAiFallback } from "../observability/metrics";
import { enforceFeatureLimit, recordFeatureUsage } from "../services/entitlements";
import { HttpError } from "../middleware/httpError";
import { logger } from "../config/logger";

const getSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

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

/**
 * Create a new chat session
 */
export async function createSession(req: Request, res: Response) {
  try {
    const user = req.user as IUserDocument;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgId = requireOrgId(req);
    const session = await ChatSessionModel.create({
      orgId,
      userId: user._id,
      title: "New Chat",
      lastMessageAt: new Date(),
      messageCount: 0
    });

    return res.status(201).json({
      id: session._id.toString(),
      title: session.title,
      lastMessageAt: session.lastMessageAt,
      messageCount: session.messageCount,
      createdAt: session.createdAt
    });
  } catch (error) {
    logger.error({ error }, "Error creating chat session");
    return res.status(500).json({ message: "Failed to create chat session" });
  }
}

/**
 * Get all chat sessions for the current user
 */
export async function getSessions(req: Request, res: Response) {
  try {
    const user = req.user as IUserDocument;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgId = requireOrgId(req);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const sessions = await ChatSessionModel.find({
      orgId,
      userId: user._id,
      isArchived: false
    })
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ChatSessionModel.countDocuments({
      orgId,
      userId: user._id,
      isArchived: false
    });

    return res.json({
      sessions: sessions.map(s => ({
        id: s._id.toString(),
        title: s.title,
        lastMessageAt: s.lastMessageAt,
        messageCount: s.messageCount,
        createdAt: s.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error({ error }, "Error fetching chat sessions");
    return res.status(500).json({ message: "Failed to fetch chat sessions" });
  }
}

/**
 * Get a single chat session with its messages
 */
export async function getSession(req: Request, res: Response) {
  try {
    const user = req.user as IUserDocument;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgId = requireOrgId(req);
    const sessionId = getSingleParam(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ message: "Invalid session ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await ChatSessionModel.findOne({
      _id: sessionId,
      orgId,
      userId: user._id
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.json({
      id: session._id.toString(),
      title: session.title,
      lastMessageAt: session.lastMessageAt,
      messageCount: session.messageCount,
      createdAt: session.createdAt
    });
  } catch (error) {
    logger.error({ error }, "Error fetching chat session");
    return res.status(500).json({ message: "Failed to fetch chat session" });
  }
}

/**
 * Delete a chat session and all its messages
 */
export async function deleteSession(req: Request, res: Response) {
  try {
    const user = req.user as IUserDocument;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgId = requireOrgId(req);
    const sessionId = getSingleParam(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ message: "Invalid session ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await ChatSessionModel.findOneAndDelete({
      _id: sessionId,
      orgId,
      userId: user._id
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Delete all messages in this session
    await ChatMessageModel.deleteMany({ orgId, sessionId: session._id });

    return res.json({ message: "Session deleted successfully" });
  } catch (error) {
    logger.error({ error }, "Error deleting chat session");
    return res.status(500).json({ message: "Failed to delete chat session" });
  }
}

/**
 * Rename a chat session
 */
export async function renameSession(req: Request, res: Response) {
  try {
    const user = req.user as IUserDocument;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgId = requireOrgId(req);
    const sessionId = getSingleParam(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ message: "Invalid session ID" });
    }
    const { title } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await ChatSessionModel.findOneAndUpdate(
      { _id: sessionId, orgId, userId: user._id },
      { title: title.trim().substring(0, 200) },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.json({
      id: session._id.toString(),
      title: session.title,
      lastMessageAt: session.lastMessageAt,
      messageCount: session.messageCount
    });
  } catch (error) {
    logger.error({ error }, "Error renaming chat session");
    return res.status(500).json({ message: "Failed to rename chat session" });
  }
}

/**
 * Get messages for a session with pagination
 */
export async function getMessages(req: Request, res: Response) {
  try {
    const user = req.user as IUserDocument;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgId = requireOrgId(req);
    const sessionId = getSingleParam(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ message: "Invalid session ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    // Verify session belongs to user
    const session = await ChatSessionModel.findOne({
      _id: sessionId,
      orgId,
      userId: user._id
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const messages = await ChatMessageModel.find({ orgId, sessionId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ChatMessageModel.countDocuments({ orgId, sessionId });

    return res.json({
      messages: messages.map(m => ({
        id: m._id.toString(),
        sessionId: m.sessionId.toString(),
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error({ error }, "Error fetching messages");
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
}

/**
 * Send a message to a chat session (and get AI response)
 */
export async function sendMessage(req: Request, res: Response) {
  try {
    const user = req.user as IUserDocument;
    const { requestId } = req;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgId = requireOrgId(req);
    const sessionId = getSingleParam(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ message: "Invalid session ID" });
    }
    const { content, options } = req.body as any;
    const narrative = typeof options?.narrative === "boolean" ? options.narrative : false;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ message: "Message content is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    await enforceFeatureLimit({
      orgId,
      userId: user._id,
      feature: "monthly_ai_calls",
      units: 1,
      requestId,
    });

    // Verify session belongs to user
    const session = await ChatSessionModel.findOne({
      _id: sessionId,
      orgId,
      userId: user._id
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const historyDocs = await ChatMessageModel.find({ orgId, sessionId: session._id })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const conversationHistory = historyDocs
      .reverse()
      .map(message => ({
        role: message.role as "user" | "assistant",
        content: String(message.content)
      }));

    // Create user message
    const userMessage = await ChatMessageModel.create({
      orgId,
      sessionId: session._id,
      userId: user._id,
      role: "user",
      content: content.trim()
    });

    // Get the user's financial profile for AI context
    const financialProfile = await ensureProfileWithMigration({ orgId, userId: user._id });

    let aiResponseContent = "I apologize, but I'm having trouble processing your request right now. Please try again.";
    let aiMetadata: any = {};
    let aiUsage: any = undefined;

    try {
      const aiStartedAt = Date.now();

      const profileUpdatedAt = financialProfile?.updatedAt ? new Date(financialProfile.updatedAt).toISOString() : "unknown";
      const transactionsUpdatedAt = financialProfile?.transactionsUpdatedAt
        ? new Date(financialProfile.transactionsUpdatedAt as unknown as Date).toISOString()
        : undefined;
      const sessionSummaryUpdatedAt = session.summaryUpdatedAt
        ? new Date(session.summaryUpdatedAt as unknown as Date).toISOString()
        : undefined;

      const journalContext = await getJournalContextForAi({ orgId, userId: user._id });

      const cacheKey = buildChatMessageCacheKey({
        orgId: orgId.toString(),
        userId: user._id.toString(),
        profileUpdatedAt,
        transactionsUpdatedAt,
        journalUpdatedAt: journalContext.updatedAt,
        narrative,
        sessionId: session._id.toString(),
        sessionMessageCount: session.messageCount,
        sessionSummaryUpdatedAt,
        content: content.trim()
      });

      const cached = await AiResponseCacheModel.findOne({ cacheKey }).lean();
      if (cached?.responseData && typeof cached.responseData === "object") {
        const cachedData = cached.responseData as any;
        aiResponseContent = String(cachedData.content || aiResponseContent);
        aiMetadata = { ...(cachedData.metadata || {}), cacheHit: true, aiCoreDurationMs: 0 };
        aiUsage = (cachedData.metadata as any)?.tokenUsage || (cachedData.metadata as any)?.usage;
        logger.info(`[requestId=${requestId}] chat-message cache_hit=true`);
        recordAiCache({ endpoint: "chat-message", hit: true });
      } else {
        recordAiCache({ endpoint: "chat-message", hit: false });
        const txResult = await fetchTransactionsForAi({ orgId, userId: user._id });

        const orgSettings = await getOrgAiSettings(orgId);

         const { request: aiRequest, stats } = buildProcessRequest({
           userInput: content.trim(),
           profile: financialProfile,
           orgId: orgId.toString(),
           userId: user._id.toString(),
           orgSettings,
           transactions: txResult.transactions,
           totalTransactions: txResult.stats.totalTransactions,
           conversationHistory,
           sessionSummary: [session.summary, journalContext.summary].filter(Boolean).join("\n\n") || undefined,
           narrative,
         });

        logger.info(
          `[requestId=${requestId}] chat.aiRequest transactionCountSent=${stats.sentTransactions} droppedTransactions=${stats.droppedTransactions}`
        );

        const aiResponse = await processAiCoreRequest(aiRequest, requestId, { userId: user._id.toString() });
        aiUsage = aiResponse.usage;
        const aiDurationMs = Date.now() - aiStartedAt;

        if (aiResponse && aiResponse.success) {
          const { plan: normalizedPlan, valid: planValid } = normalizeAiPlan(aiResponse.plan);
          if (!planValid) {
            logger.warn(`[requestId=${requestId}] chat.ai.plan_validation_failed=true`);
          }

          aiResponseContent = aiResponse.final_output || aiResponseContent;
          aiMetadata = {
            analysisType: aiResponse.analysis_type,
            agentsInvolved: aiResponse.agents_involved,
            priority: aiResponse.priority,
            actionable: aiResponse.actionType ? true : false,
            plan: normalizedPlan,
            toolCalls: aiResponse.tool_calls || [],
            detailedAnalysis: aiResponse.detailed_analysis || {},
            workflowTrace: aiResponse.workflow_trace || [],
            fallbackUsed: aiResponse.fallback_used || false,
            llmCallCount: aiResponse.llm_call_count || 0,
            tokenUsage: aiResponse.usage,
            requestId: aiResponse.request_id || requestId,
            actionLinkId: aiResponse.request_id || requestId,
            linkedTaskIds: [],
            aiCoreDurationMs: aiDurationMs,
            cacheHit: false
          };
          if (aiResponse.fallback_used) {
            recordAiFallback({ endpoint: "chat-message" });
          }
        }

        await AiResponseCacheModel.findOneAndUpdate(
          { cacheKey },
          {
            $set: {
              orgId,
              userId: user._id,
              endpoint: "chat-message",
              responseData: { content: aiResponseContent, metadata: aiMetadata },
              expiresAt: new Date(Date.now() + ttlMs.chatMessage)
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (aiError: any) {
      logger.error({ error: aiError?.message ?? aiError }, `[requestId=${requestId}] AI service error`);
      aiResponseContent = "I'm currently experiencing some difficulties connecting to the AI service. Please try again in a moment.";
    }

    // Persist assistant response as an agent output (enables feedback + task creation by id)
    try {
      const agentOutput = await AgentOutputModel.create({
        orgId,
        userId: user._id,
        sessionId: session._id.toString(),
        userInput: content.trim(),
        agentType: String(aiMetadata?.agentsInvolved?.[0] || "master"),
        outputData: {
          response: aiResponseContent,
          title: "Chat Response",
          description: aiResponseContent?.substring(0, 200) || "Chat response",
          actionType: aiMetadata?.actionType || "review",
          agent: String(aiMetadata?.agentsInvolved?.[0] || "master"),
          plan: aiMetadata?.plan,
          tool_calls: aiMetadata?.toolCalls || [],
        },
        analysis_type: String(aiMetadata?.analysisType || "comprehensive"),
        agents_involved: Array.isArray(aiMetadata?.agentsInvolved) ? aiMetadata.agentsInvolved : [],
        workflow_trace: Array.isArray(aiMetadata?.workflowTrace) ? aiMetadata.workflowTrace : [],
        detailed_analysis: aiMetadata?.detailedAnalysis || {},
        fallback_used: Boolean(aiMetadata?.fallbackUsed),
        llm_call_count: Number(aiMetadata?.llmCallCount || 0),
        request_id: String(aiMetadata?.requestId || requestId),
        priority: aiMetadata?.priority || "medium",
        actionable: Boolean(aiMetadata?.actionable),
        timestamp: new Date(),
      });

      aiMetadata.agentOutputId = agentOutput._id.toString();
    } catch (persistError: any) {
      logger.warn(`[requestId=${requestId}] Failed to persist chat agent output:`, persistError?.message || persistError);
    }

    // Create AI response message
    const aiMessage = await ChatMessageModel.create({
      orgId,
      sessionId: session._id,
      userId: user._id,
      role: "assistant",
      content: aiResponseContent,
      metadata: aiMetadata
    });

    // Update session with new message info
    const isFirstMessage = session.messageCount === 0;
    const updateData: any = {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 }
    };

    // Auto-generate title from first user message
    if (isFirstMessage) {
      updateData.title = content.trim().substring(0, 50) + (content.length > 50 ? "..." : "");
    }

    const updatedSession = await ChatSessionModel.findByIdAndUpdate(session._id, updateData, { new: true });

    const nextMessageCount = (updatedSession?.messageCount ?? session.messageCount + 2) as number;
    const nextUserMessageCount = Math.floor(nextMessageCount / 2);
    const shouldUpdateSummary =
      !session.summary ||
      session.summary.trim().length === 0 ||
      nextUserMessageCount % 8 === 0;

    if (shouldUpdateSummary) {
      const summaryDocs = await ChatMessageModel.find({ orgId, sessionId: session._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const summary = buildDeterministicChatSummary(
        summaryDocs
          .reverse()
          .map(message => ({ role: message.role as "user" | "assistant", content: String(message.content) }))
      );

      await ChatSessionModel.findByIdAndUpdate(session._id, {
        summary,
        summaryUpdatedAt: new Date()
      });
    }

    await recordFeatureUsage({
      orgId,
      userId: user._id,
      feature: "monthly_ai_calls",
      units: 1,
      tokensIn: aiUsage?.tokens_in,
      tokensOut: aiUsage?.tokens_out,
      costUsd: aiUsage?.cost_usd,
      modelName: Array.isArray(aiUsage?.models) ? aiUsage.models[0] : undefined,
      requestId,
      context: {
        endpoint: "chat/send-message",
        session_id: session._id.toString(),
      },
    });

    return res.json({
      userMessage: {
        id: userMessage._id.toString(),
        sessionId: userMessage.sessionId.toString(),
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt
      },
      assistantMessage: {
        id: aiMessage._id.toString(),
        sessionId: aiMessage.sessionId.toString(),
        role: aiMessage.role,
        content: aiMessage.content,
        metadata: aiMessage.metadata,
        createdAt: aiMessage.createdAt
      }
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
        request_id: req.requestId,
      });
    }
    logger.error({ error }, `[requestId=${req.requestId}] Error sending message`);
    return res.status(500).json({ message: "Failed to send message", request_id: req.requestId });
  }
}

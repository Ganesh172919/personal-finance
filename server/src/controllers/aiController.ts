/**
 * @fileoverview AI Controller
 *
 * This module handles AI-related endpoints for the Personal Finance application.
 * It provides endpoints for processing AI commands, streaming AI responses,
 * running what-if scenarios, and managing financial profiles.
 *
 * KEY FEATURES:
 * - AI command processing with caching
 * - Real-time AI streaming via Server-Sent Events (SSE)
 * - What-if scenario analysis
 * - Financial profile management (CRUD)
 * - Investment tracking
 * - Agent output management and feedback
 * - Entitlement enforcement (rate limiting)
 * - Audit logging and metrics
 *
 * ARCHITECTURE:
 * - Uses Python AI Core service for AI processing
 * - Implements response caching for performance
 * - Supports streaming responses for real-time updates
 * - Integrates with entitlement system for rate limiting
 * - Publishes domain events for audit trail
 *
 * @module controllers/aiController
 */

import { Request, Response } from "express"; // Express types
import FinancialProfileModel from "../models/financialProfileModel"; // Financial profile model
import AgentOutputModel from "../models/agentOutputModel"; // Agent output model
import AiResponseCacheModel from "../models/aiResponseCacheModel"; // AI response cache model
import TaskModel from "../models/taskModel"; // Task model
import { IUserDocument } from "../models/userModel"; // User document type
import { v4 as uuidv4 } from "uuid"; // UUID generation
import mongoose from "mongoose"; // MongoDB ODM
import OrganizationModel from "../models/organizationModel"; // Organization model
import { processAiCoreRequest, processAiCoreScenario } from "../services/aiCoreClient"; // AI Core client
import { buildProcessRequest } from "../services/aiRequestBuilder"; // AI request builder
import { buildProcessCommandCacheKey, ttlMs } from "../services/aiCache"; // AI caching utilities
import TransactionModel from "../models/transactionModel"; // Transaction model
import { fetchTransactionsForAi } from "../services/transactionService"; // Transaction service
import { getJournalContextForAi } from "../services/journalContext"; // Journal context service
import { normalizeAiPlan } from "../schemas/aiPlanSchema"; // AI plan normalization
import { recordAiCache, recordAiFallback, recordScenarioDuration } from "../observability/metrics"; // Metrics
import { publishDomainEvent } from "../services/domainEvents"; // Domain event publishing
import { buildAiFinanceGrounding } from "../services/financeGrounding"; // Finance grounding service
import {
  bumpTransactionMetadata,
  ensureProfile,
  ensureProfileWithMigration,
  setProfileMutationSource,
} from "../services/profileService"; // Profile service
import { enforceFeatureLimit, recordFeatureUsage } from "../services/entitlements"; // Entitlements
import { HttpError } from "../middleware/httpError"; // Custom HTTP error
import { logger } from "../config/logger"; // Application logger

/**
 * Constants
 */
const DEFAULT_GOAL_TIMELINE_MONTHS = 12; // Default goal timeline in months

/**
 * Profile Updatable Fields
 *
 * List of fields that can be updated in the financial profile.
 */
const PROFILE_UPDATABLE_FIELDS = [
  "age",
  "annual_income",
  "monthly_expenses",
  "savings",
  "goals",
  "debts",
  "onboardingCompletedAt",
  "onboardingVersion",
  "risk_tolerance",
  "investment_experience"
] as const;

/**
 * Sanitizes profile update payload.
 *
 * Filters out invalid fields and returns only updatable fields.
 *
 * @param {Record<string, unknown>} payload - Raw update payload
 * @returns {Partial<Record<(typeof PROFILE_UPDATABLE_FIELDS)[number], unknown>>} Sanitized update object
 */
const sanitizeProfileUpdate = (payload: Record<string, unknown>) => {
  const sanitized: Partial<Record<(typeof PROFILE_UPDATABLE_FIELDS)[number], unknown>> = {};

  // Only include valid updatable fields
  for (const field of PROFILE_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field) && payload[field] !== undefined) {
      sanitized[field] = payload[field];
    }
  }

  return sanitized;
};

/**
 * Calculates timeline months from deadline string.
 *
 * @param {string} [deadline] - Deadline date string
 * @returns {number} Timeline in months (minimum 1)
 */
const getTimelineMonths = (deadline?: string) => {
  if (!deadline) {
    return DEFAULT_GOAL_TIMELINE_MONTHS;
  }

  const deadlineDate = new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime())) {
    return DEFAULT_GOAL_TIMELINE_MONTHS;
  }

  const now = new Date();
  const months =
    (deadlineDate.getFullYear() - now.getFullYear()) * 12 +
    (deadlineDate.getMonth() - now.getMonth());

  return Math.max(1, months);
};

/**
 * Gets single parameter value from array or string.
 *
 * @param {string | string[] | undefined} value - Parameter value
 * @returns {string | undefined} Single parameter value
 */
const getSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * Requires and validates organization ID from request.
 *
 * @param {Request} req - Express request object
 * @returns {mongoose.Types.ObjectId} Valid organization ID
 * @throws {HttpError} If organization ID is missing or invalid
 */
const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

/**
 * Gets organization AI settings.
 *
 * @param {mongoose.Types.ObjectId} orgId - Organization ID
 * @returns {Promise<{currency: string, locale: string, timezone: string}>} Organization settings
 */
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

type ScenarioParametersInput =
  | {
      scenario_type: "expense" | "income" | "investment";
      amount: number;
      description?: string;
      assumptions?: {
        months?: number;
        expected_return_pct?: number;
        inflation_pct?: number;
      };
    }
  | {
      type?: "expense" | "income" | "investment";
      expense?: number;
      income?: number;
      description?: string;
    };

const normalizeScenarioParameters = (input: ScenarioParametersInput) => {
  const value = input as any;

  if (typeof value?.scenario_type === "string") {
    return {
      scenario_type: value.scenario_type,
      amount: Number(value.amount || 0),
      description: value.description ? String(value.description) : "",
      assumptions: value.assumptions,
    };
  }

  const type = value?.type || "expense";
  const amount =
    type === "income" ? Number(value?.income || 0) : Number(value?.expense || 0);

  return {
    scenario_type: type,
    amount,
    description: value?.description ? String(value.description) : "",
    assumptions: undefined,
  };
};


/**
 * Processes an AI command and returns the response.
 *
 * This endpoint:
 * 1. Enforces feature limits (rate limiting)
 * 2. Fetches user profile, journal context, and organization settings
 * 3. Checks for cached response
 * 4. Builds and sends request to Python AI Core
 * 5. Stores agent output and insights
 * 6. Caches response for future use
 * 7. Records feature usage and metrics
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>} JSON response with AI analysis
 */
export const processAICommand = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { command, options } = req.body as any;
    const { requestId } = req;
    const narrative = typeof options?.narrative === "boolean" ? options.narrative : false;
    const orgId = requireOrgId(req);

    // Enforce feature limits (rate limiting)
    await enforceFeatureLimit({
      orgId,
      userId: user._id,
      feature: "monthly_ai_calls",
      units: 1,
      requestId,
    });

    // Fetch user profile, journal context, and organization settings in parallel
    const [profile, journalContext, orgSettings] = await Promise.all([
      ensureProfileWithMigration({ orgId, userId: user._id }),
      getJournalContextForAi({ orgId, userId: user._id }),
      getOrgAiSettings(orgId),
    ]);

    // Build cache key for response caching
    const profileUpdatedAt = profile.updatedAt ? new Date(profile.updatedAt).toISOString() : "unknown";
    const transactionsUpdatedAt = profile.transactionsUpdatedAt
      ? new Date(profile.transactionsUpdatedAt as unknown as Date).toISOString()
      : "unknown";
    const cacheKey = buildProcessCommandCacheKey({
      orgId: orgId.toString(),
      userId: user._id.toString(),
      profileUpdatedAt,
      transactionsUpdatedAt,
      journalUpdatedAt: journalContext.updatedAt,
      command: String(command || ""),
      narrative,
    });

    // Check for cached response
    const cached = await AiResponseCacheModel.findOne({ cacheKey }).lean();
    if (cached?.responseData && typeof cached.responseData === "object") {
      logger.info(`[requestId=${requestId}] process-command cache_hit=true`);
      recordAiCache({ endpoint: "process-command", hit: true });
      return res.json({ ...(cached.responseData as any), cache_hit: true });
    }

    recordAiCache({ endpoint: "process-command", hit: false });

    // Fetch transactions and build finance grounding in parallel
    const [txResult, grounding] = await Promise.all([
      fetchTransactionsForAi({ orgId, userId: user._id }),
      buildAiFinanceGrounding({ orgId, userId: user._id }),
    ]);

    // Build AI request
    const { request: aiRequest, stats } = buildProcessRequest({
      userInput: command,
      profile,
      financeContext: grounding.finance_context,
      orgId: orgId.toString(),
      userId: user._id.toString(),
      orgSettings,
      transactions: txResult.transactions,
      totalTransactions: txResult.stats.totalTransactions,
      sessionSummary: journalContext.summary || undefined,
      narrative,
    });

    // Log request details
    logger.info(`[requestId=${requestId}] Sending command to Python AI Core`);
    logger.info(`[requestId=${requestId}] userInputLength=${command?.length ?? 0}`);
    logger.info(
      `[requestId=${requestId}] profileAge=${profile.age} transactionCountSent=${stats.sentTransactions} droppedTransactions=${stats.droppedTransactions}`
    );

    // Send request to Python AI Core
    const aiStartedAt = Date.now();
    const aiResponse = await processAiCoreRequest(aiRequest, requestId, { userId: user._id.toString() });
    const aiDurationMs = Date.now() - aiStartedAt;

    // Record fallback usage
    if (aiResponse.fallback_used) {
      recordAiFallback({ endpoint: "process-command" });
    }

    // Normalize AI plan
    const { plan: normalizedPlan, valid: planValid } = normalizeAiPlan(aiResponse.plan);
    if (!planValid) {
      logger.warn(`[requestId=${requestId}] ai.plan_validation_failed=true`);
    }

    // Log response details
    logger.info(
      `[requestId=${requestId}] aiCore.durationMs=${aiDurationMs} fallback_used=${aiResponse.fallback_used} llm_call_count=${aiResponse.llm_call_count} analysis_type=${aiResponse.analysis_type}`
    );

    logger.info(
      `[requestId=${requestId}] Python response agent=${aiResponse.agent} analysisType=${aiResponse.analysis_type} responseLength=${aiResponse.final_output?.length || 0}`
    );

    // Extract and store complete agent output
    const sessionId = uuidv4();

    const priority = aiResponse.priority || 'medium';
    const actionable = !!(aiResponse.actionType || aiResponse.insights?.length > 0);

    // Create main agent output
    const mainOutput = await AgentOutputModel.create({
      orgId,
      userId: user._id,
      sessionId,
      userInput: command,
      agentType: aiResponse.agent || "master",
      outputData: {
        response: aiResponse.final_output,
        title: "Financial Analysis",
        description: aiResponse.final_output?.substring(0, 200) || "Analysis complete",
        actionType: aiResponse.actionType || "review",
        agent: aiResponse.agent || "master",
        insights: aiResponse.insights || [],
        plan: normalizedPlan,
        tool_calls: aiResponse.tool_calls || [],
        evidence: aiResponse.evidence || grounding.evidence,
        confidence: aiResponse.confidence || grounding.confidence,
        suggested_actions:
          aiResponse.suggested_actions ||
          [
            ...(normalizedPlan.actions?.next_7_days || []),
            ...(normalizedPlan.actions?.next_30_days || []),
          ].slice(0, 3),
        linked_entity_ids: aiResponse.linked_entity_ids || {},
        fallback_used: aiResponse.fallback_used,
        llm_call_count: aiResponse.llm_call_count,
        active_provider: aiResponse.active_provider,
        active_model: aiResponse.active_model,
        session_id: aiResponse.session_id,
      },
      analysis_type: aiResponse.analysis_type || "comprehensive",
      agents_involved: aiResponse.agents_involved || ["master"],
      workflow_trace: aiResponse.workflow_trace || [],
      detailed_analysis: aiResponse.detailed_analysis || {},
      fallback_used: aiResponse.fallback_used,
      llm_call_count: aiResponse.llm_call_count,
      request_id: aiResponse.request_id || requestId,
      active_provider: aiResponse.active_provider,
      active_model: aiResponse.active_model,
      session_id: aiResponse.session_id,
      priority,
      actionable
    });

    // Store individual insights
    if (aiResponse.insights && Array.isArray(aiResponse.insights)) {
      for (const insight of aiResponse.insights) {
        await AgentOutputModel.create({
          orgId,
          userId: user._id,
          sessionId,
          userInput: command,
          agentType: insight.agent || "unknown",
          outputData: {
            title: insight.title,
            description: insight.description,
            actionType: insight.actionType,
            agent: insight.agent
          },
          analysis_type: aiResponse.analysis_type || "comprehensive",
          agents_involved: [insight.agent],
          priority: insight.priority || priority,
          actionable: true,
          timestamp: new Date()
        });
      }
    }

    // Build response payload
    const responsePayload = {
      success: true,
      response: aiResponse.final_output,
      plan: normalizedPlan,
      agent_output_id: mainOutput._id.toString(),
      analysis_type: aiResponse.analysis_type,
      agents_involved: aiResponse.agents_involved,
      actionType: aiResponse.actionType,
      priority,
      insights: aiResponse.insights,
      tool_calls: aiResponse.tool_calls || [],
      evidence: aiResponse.evidence || grounding.evidence,
      confidence: aiResponse.confidence || grounding.confidence,
      suggested_actions:
        aiResponse.suggested_actions ||
        [
          ...(normalizedPlan.actions?.next_7_days || []),
          ...(normalizedPlan.actions?.next_30_days || []),
        ].slice(0, 3),
      linked_entity_ids: aiResponse.linked_entity_ids || {},
      workflow_trace: aiResponse.workflow_trace || [],
      detailed_analysis: aiResponse.detailed_analysis || {},
      fallback_used: aiResponse.fallback_used,
      llm_call_count: aiResponse.llm_call_count,
      request_id: aiResponse.request_id || requestId,
      session_id: aiResponse.session_id,
      session_status: aiResponse.session_status,
      workflow_phase: aiResponse.workflow_phase,
      active_provider: aiResponse.active_provider,
      active_model: aiResponse.active_model,
      active_key_id: aiResponse.active_key_id,
      fallback_path: aiResponse.fallback_path,
      recovered_failures: aiResponse.recovered_failures,
      recovered_from_checkpoint: aiResponse.recovered_from_checkpoint,
    };

    // Cache response for future use
    await AiResponseCacheModel.findOneAndUpdate(
      { cacheKey },
      {
        $set: {
          orgId,
          userId: user._id,
          endpoint: "process-command",
          responseData: responsePayload,
          expiresAt: new Date(Date.now() + ttlMs.processCommand)
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Record feature usage and metrics
    await recordFeatureUsage({
      orgId,
      userId: user._id,
      feature: "monthly_ai_calls",
      units: 1,
      tokensIn: aiResponse.usage?.tokens_in,
      tokensOut: aiResponse.usage?.tokens_out,
      costUsd: aiResponse.usage?.cost_usd,
      modelName: aiResponse.usage?.models?.[0],
      requestId,
      context: {
        endpoint: "process-command",
        command_length: String(command || "").length,
      },
    });

    // Return response
    res.json({ ...responsePayload, cache_hit: false });

  } catch (error: any) {
    // Handle HTTP errors
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
        request_id: req.requestId,
      });
    }
    // Log and return generic error
    logger.error(`[requestId=${req.requestId}] AI processing error status=${error.response?.status ?? "unknown"}`);
    logger.error(`[requestId=${req.requestId}]`, error.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: "Failed to process AI command",
      error: error.response?.data?.detail || error.message,
      request_id: req.requestId
    });
  }
};

export const processAiStream = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { command, options } = req.body as any;
    const { requestId } = req;
    const orgId = requireOrgId(req);
    const narrative = typeof options?.narrative === "boolean" ? options.narrative : false;

    // Optional: enforce limits, but we can't easily record exact usage until stream ends.
    await enforceFeatureLimit({
      orgId,
      userId: user._id,
      feature: "monthly_ai_calls",
      units: 1,
      requestId,
    });

    const [profile, journalContext, orgSettings] = await Promise.all([
      ensureProfileWithMigration({ orgId, userId: user._id }),
      getJournalContextForAi({ orgId, userId: user._id }),
      getOrgAiSettings(orgId),
    ]);

    const txResult = await fetchTransactionsForAi({ orgId, userId: user._id });

    const { request: aiRequest } = buildProcessRequest({
      userInput: command,
      profile,
      orgId: orgId.toString(),
      userId: user._id.toString(),
      orgSettings,
      transactions: txResult.transactions,
      totalTransactions: txResult.stats.totalTransactions,
      sessionSummary: journalContext.summary || undefined,
      narrative,
    });

    logger.info(`[requestId=${requestId}] Starting SSE proxy to Python AI Core`);

    const { streamAiCoreRequest } = await import("../services/aiCoreClient");
    
    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Important for Nginx if present

    try {
      const stream = await streamAiCoreRequest(aiRequest, requestId, { userId: user._id.toString() });
      
      // Pipe the Axios stream directly to the Express response
      stream.pipe(res);

      stream.on("error", (err: any) => {
        logger.error(`[requestId=${requestId}] SSE proxy stream error`, err);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          // If already streaming, send an error event and close
          res.write(`data: ${JSON.stringify({ phase: "error", message: "Stream interrupted" })}\n\n`);
          res.end();
        }
      });
    } catch (error: any) {
      if (!res.headersSent) {
        throw error; // Let outer catch block handle it
      }
      res.write(`data: ${JSON.stringify({ phase: "error", message: error.message })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] AI streaming error:`, error.message);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        message: "Failed to start AI stream",
        error: error.message,
        request_id: req.requestId
      });
    }
  }
};

export const processWhatIfScenario = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { parameters } = req.body as { parameters: ScenarioParametersInput };
    const { requestId } = req;
    const orgId = requireOrgId(req);

    await enforceFeatureLimit({
      orgId,
      userId: user._id,
      feature: "scenario_depth",
      units: 1,
      requestId,
    });

    const [profile, orgSettings] = await Promise.all([
      ensureProfile({ orgId, userId: user._id }),
      getOrgAiSettings(orgId),
    ]);
    const normalized = normalizeScenarioParameters(parameters);
    if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
      return res.status(400).json({
        message: "Scenario amount must be greater than 0",
        request_id: requestId
      });
    }
    const txResult = await fetchTransactionsForAi({ orgId, userId: user._id, maxItems: 120 });

    const scenarioRequest = {
      user_profile: {
        age: profile.age,
        annual_income: profile.annual_income,
        monthly_expenses: profile.monthly_expenses,
        savings: profile.savings,
        debts: profile.debts,
        financial_goals: profile.goals.map(g => ({
          name: g.name,
          target: g.target,
          timeline_months: getTimelineMonths(g.deadline),
          priority: g.priority
        })),
        risk_tolerance: profile.risk_tolerance,
        investment_experience: profile.investment_experience,
        time_horizon: 10,
        currency: orgSettings.currency,
        locale: orgSettings.locale,
        timezone: orgSettings.timezone,
        transactions: txResult.transactions.map(transaction => ({
          amount: transaction.amount,
          category: transaction.category,
          description: transaction.description,
          date: transaction.date.toISOString().slice(0, 10),
          type: transaction.type
        }))
      },
      scenario_type: normalized.scenario_type,
      amount: normalized.amount,
      description: normalized.description || "",
      assumptions: normalized.assumptions || {}
    };

    const aiStartedAt = Date.now();
    const response = await processAiCoreScenario(scenarioRequest, requestId, { userId: user._id.toString() });
    const aiDurationMs = Date.now() - aiStartedAt;
    const fallbackUsed = Boolean((response as any)?.fallback_used);
    recordScenarioDuration({ durationMs: aiDurationMs, fallbackUsed });
    if (fallbackUsed) {
      recordAiFallback({ endpoint: "what-if" });
    }

    await publishDomainEvent({
      orgId,
      userId: user._id,
      eventType: "ScenarioEvaluated",
      aggregateType: "scenario",
      aggregateId: `${normalized.scenario_type}:${Date.now()}`,
      requestId,
      payload: {
        scenario_type: normalized.scenario_type,
        amount: normalized.amount,
        fallback_used: fallbackUsed,
      },
    });

    await recordFeatureUsage({
      orgId,
      userId: user._id,
      feature: "scenario_depth",
      units: 1,
      requestId,
      context: {
        endpoint: "what-if",
        scenario_type: normalized.scenario_type,
        amount: normalized.amount,
      },
    });

    logger.info(`[requestId=${requestId}] aiCore.scenario.durationMs=${aiDurationMs}`);

    res.json({
      ...response,
      scenario_request: {
        scenario_type: normalized.scenario_type,
        amount: normalized.amount,
        assumptions: normalized.assumptions || {}
      },
      request_id: response?.request_id || requestId
    });

  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
        request_id: req.requestId,
      });
    }
    logger.error(`[requestId=${req.requestId}] Scenario processing error`, error);
    res.status(500).json({ 
      message: "Failed to process scenario",
      error: error.message,
      request_id: req.requestId
    });
  }
};

export const getFinancialProfile = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const includeTransactions = String(req.query.includeTransactions || "").toLowerCase() === "true";
    const txLimitRaw = Number(req.query.txLimit || 50);
    const txLimit = Number.isFinite(txLimitRaw) ? Math.min(Math.max(1, txLimitRaw), 100) : 50;

    if (req.params.userId) {
      logger.warn(
        `[requestId=${req.requestId}] Deprecated endpoint /financial-profiles/:userId called; ignoring userId param`
      );
    }
    
    const orgId = requireOrgId(req);
    const profile = includeTransactions
      ? await ensureProfileWithMigration({ orgId, userId: user._id })
      : await ensureProfile({ orgId, userId: user._id });

    const completeness = {
      has_income: Number(profile.annual_income) > 0,
      has_expenses: Number(profile.monthly_expenses) > 0,
      has_goals: Array.isArray(profile.goals) && profile.goals.length > 0,
      has_debts: Array.isArray(profile.debts) && profile.debts.length > 0,
      has_transactions: Number(profile.transactionsCount || 0) > 0
    };

    if (!includeTransactions) {
      const dto = profile.toObject();
      const goals = Array.isArray((dto as any).goals)
        ? (dto as any).goals.map((goal: any) => ({
            ...goal,
            id: goal?._id ? String(goal._id) : goal?.id
          }))
        : [];
      const debts = Array.isArray((dto as any).debts)
        ? (dto as any).debts.map((debt: any) => ({
            ...debt,
            id: debt?._id ? String(debt._id) : debt?.id
          }))
        : [];
      delete (dto as any).transactions;
      return res.json({ ...dto, goals, debts, completeness });
    }

    const recentTransactions = await TransactionModel.find({ orgId, userId: user._id })
      .sort({ date: -1 })
      .limit(txLimit)
      .lean();

    const dto = profile.toObject();
    const goals = Array.isArray((dto as any).goals)
      ? (dto as any).goals.map((goal: any) => ({
          ...goal,
          id: goal?._id ? String(goal._id) : goal?.id
        }))
      : [];
    const debts = Array.isArray((dto as any).debts)
      ? (dto as any).debts.map((debt: any) => ({
          ...debt,
          id: debt?._id ? String(debt._id) : debt?.id
        }))
      : [];
    return res.json({
      ...dto,
      goals,
      debts,
      completeness: {
        has_income: Number(profile.annual_income) > 0,
        has_expenses: Number(profile.monthly_expenses) > 0,
        has_goals: Array.isArray(profile.goals) && profile.goals.length > 0,
        has_debts: Array.isArray(profile.debts) && profile.debts.length > 0,
        has_transactions: Number(profile.transactionsCount || 0) > 0
      },
      transactions: recentTransactions.map(tx => ({
        id: tx._id.toString(),
        amount: tx.amount,
        category: tx.category,
        description: tx.description,
        date: tx.date,
        type: tx.type,
        source: (tx as any).source || undefined
      }))
    });

  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error fetching profile:`, error);
    res.status(500).json({ message: "Failed to fetch financial profile", request_id: req.requestId });
  }
};

export const updateFinancialProfile = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const rawBody = (req.body ?? {}) as Record<string, unknown>;
    const updates = sanitizeProfileUpdate(rawBody);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "No valid profile fields provided for update",
        request_id: req.requestId
      });
    }

    if (req.params.userId) {
      logger.warn(
        `[requestId=${req.requestId}] Deprecated endpoint /financial-profiles/:userId called; ignoring userId param`
      );
    }

    const orgId = requireOrgId(req);
    const profile = await FinancialProfileModel.findOneAndUpdate(
      { orgId, userId: user._id },
      {
        $set: updates,
        $setOnInsert: {
          orgId,
          userId: user._id
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    const source = {
      origin: "manual" as const,
      request_id: req.requestId,
      actor_type: "user" as const,
      source_ref: "profile:update",
      note: "profile_update",
    };
    setProfileMutationSource(profile, source);
    await profile.save();

    const dto = profile.toObject();
    const goals = Array.isArray((dto as any).goals)
      ? (dto as any).goals.map((goal: any) => ({
          ...goal,
          id: goal?._id ? String(goal._id) : goal?.id
        }))
      : [];
    const debts = Array.isArray((dto as any).debts)
      ? (dto as any).debts.map((debt: any) => ({
          ...debt,
          id: debt?._id ? String(debt._id) : debt?.id
        }))
      : [];

    res.json({
      source,
      ...dto,
      goals,
      debts,
      completeness: {
        has_income: Number(dto.annual_income) > 0,
        has_expenses: Number(dto.monthly_expenses) > 0,
        has_goals: goals.length > 0,
        has_debts: debts.length > 0,
        has_transactions: Number(dto.transactionsCount || 0) > 0
      }
    });

  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error updating profile:`, error);
    res.status(500).json({ message: "Failed to update financial profile", request_id: req.requestId });
  }
};

export const addInvestment = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;

    if (!user || !user._id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { name, amount, date } = req.body;
    const orgId = requireOrgId(req);
    const profile = await ensureProfileWithMigration({ orgId, userId: user._id });

    const normalizedAmount = Math.abs(Number(amount));
    const now = new Date();
    const source = {
      origin: "manual" as const,
      request_id: req.requestId,
      actor_type: "user" as const,
      source_ref: "investment:add",
      note: "investment_add",
    };

    await TransactionModel.create({
      orgId,
      userId: user._id,
      amount: -normalizedAmount,
      category: "Investment",
      description: String(name || "Investment"),
      date: date ? new Date(date) : now,
      type: "investment",
      source,
    });
    profile.savings = Number(profile.savings || 0) - normalizedAmount;
    bumpTransactionMetadata(profile, { deltaCount: 1, at: now });
    setProfileMutationSource(profile, source);
    await profile.save();

    res.status(201).json({
      message: "Investment added successfully",
      source,
      profile
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error in addInvestment:`, error);
    res.status(500).json({
      message: "Failed to add investment",
      error: error.message,
      request_id: req.requestId
    });
  }
};

export const getRecentAgentOutputs = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const limitRaw = Number((req.query as any)?.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 20;

    const orgId = requireOrgId(req);
    const outputs = await AgentOutputModel.find({ orgId, userId: user._id })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select({
        _id: 1,
        agentType: 1,
        timestamp: 1,
      })
      .lean();

    const outputIds = outputs.map(output => String((output as any)._id));
    const objectIds = outputIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const linkedTaskRows =
      objectIds.length > 0
        ? await TaskModel.find({
            orgId,
            userId: user._id,
            "source.agentOutputId": { $in: objectIds },
          })
            .select({ _id: 1, "source.agentOutputId": 1 })
            .lean()
        : [];

    const taskMap = new Map<string, string[]>();
    for (const row of linkedTaskRows as Array<any>) {
      const agentOutputId = row?.source?.agentOutputId ? String(row.source.agentOutputId) : "";
      if (!agentOutputId) continue;
      if (!taskMap.has(agentOutputId)) {
        taskMap.set(agentOutputId, []);
      }
      taskMap.get(agentOutputId)?.push(String(row._id));
    }

    return res.json({
      outputs: outputs.map(output => {
        const id = String((output as any)._id);
        return {
          id,
          type: String((output as any).agentType || "unknown"),
          created_at: (output as any).timestamp,
          linked_task_ids: taskMap.get(id) || [],
        };
      }),
      request_id: req.requestId,
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error fetching recent outputs:`, error);
    return res.status(500).json({ message: "Failed to fetch recent outputs", request_id: req.requestId });
  }
};

export const getAgentOutputById = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const id = getSingleParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid insight ID" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid insight ID" });
    }

    const output = await AgentOutputModel.findOne({ _id: id, orgId, userId: user._id });

    if (!output) {
      return res.status(404).json({ message: "Insight not found" });
    }
    
    const outputData = output.outputData || {};
    const insight = {
      id: output._id.toString(),
      agentType: output.agentType,
      agent: outputData.agent || output.agentType,
      priority: output.priority || "medium",
      actionable: output.actionable || false,
      outputData: {
        title: outputData.title || "Financial Analysis",
        description: outputData.description || "Analysis completed",
        response: outputData.response || outputData.description || "No further details available.",
        action: outputData.actionType || outputData.action,
        actionType: outputData.actionType || outputData.action,
        plan: outputData.plan
      },
      timestamp: output.timestamp,
      analysis_type: output.analysis_type,
      workflow_trace: output.workflow_trace || [],
      detailed_analysis: output.detailed_analysis || {},
      fallback_used: output.fallback_used || false,
      llm_call_count: output.llm_call_count || 0,
      request_id: output.request_id
    };

    res.json(insight);

  } catch (error: any) {
    logger.error("Error fetching single agent output:", error);
    res.status(500).json({ message: "Failed to fetch agent output" });
  }
};

export const submitAgentOutputFeedback = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { id } = req.params;
    const { rating, note } = req.body as { rating: "up" | "down"; note?: string };

    const updated = await AgentOutputModel.findOneAndUpdate(
      { _id: id, orgId, userId: user._id },
      {
        $set: {
          feedback: {
            rating,
            note: note ? String(note) : undefined,
            createdAt: new Date()
          }
        }
      },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Insight not found", request_id: req.requestId });
    }

    return res.json({
      message: "Feedback recorded",
      feedback: (updated as any).feedback || { rating, note },
      request_id: req.requestId
    });
  } catch (error: any) {
    logger.error(`[requestId=${req.requestId}] Error recording feedback:`, error);
    return res.status(500).json({ message: "Failed to record feedback", request_id: req.requestId });
  }
};

export const getAgentOutputs = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const orgId = requireOrgId(req);
    const { userId } = req.params;
    const limitRaw = Number((req.query as any)?.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 20;

    if (userId && userId !== user._id.toString()) {
      logger.warn(
        `[requestId=${req.requestId}] /agent-outputs/user/:userId called with mismatched userId; serving authenticated user's outputs`
      );
    }

    const outputs = await AgentOutputModel.find({ orgId, userId: user._id })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const insights = outputs
      .filter(output => (output as any).outputData && ((output as any).outputData.title || (output as any).outputData.response))
      .map(output => {
        const outputData = (output as any).outputData || {};
        
        return {
          id: String((output as any)._id),
          request_id: (output as any).request_id || undefined,
          agentType: (output as any).agentType,
          agent: outputData.agent || (output as any).agentType,
          priority: (output as any).priority || "medium",
          actionable: Boolean((output as any).actionable),
          outputData: {
            title: outputData.title || (outputData.response ? (output as any).userInput : "Financial Insight"),
            description:
              outputData.description ||
              (outputData.response ? `${String(outputData.response).substring(0, 200)}...` : "Analysis completed"),
            action: outputData.actionType || outputData.action,
            actionType: outputData.actionType || outputData.action
          },
          timestamp: (output as any).timestamp,
          analysis_type: (output as any).analysis_type,
          fallback_used: Boolean((output as any).fallback_used),
          llm_call_count: Number((output as any).llm_call_count || 0)
        };
      });

    res.json(insights);

  } catch (error: any) {
    logger.error("Error fetching outputs:", error);
    res.status(500).json({ message: "Failed to fetch agent outputs" });
  }
};

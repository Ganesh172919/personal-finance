import { Request, Response } from "express";
import FinancialProfileModel from "../models/financialProfileModel";
import AgentOutputModel from "../models/agentOutputModel";
import AiResponseCacheModel from "../models/aiResponseCacheModel";
import { IUserDocument } from "../models/userModel";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { processAiCoreRequest, processAiCoreScenario } from "../services/aiCoreClient";
import { buildProcessRequest } from "../services/aiRequestBuilder";
import { buildProcessCommandCacheKey, ttlMs } from "../services/aiCache";
import TransactionModel from "../models/transactionModel";
import { ensureProfileTransactionsMigrated } from "../services/transactionMigration";
import { fetchTransactionsForAi } from "../services/transactionService";
import { normalizeAiPlan } from "../schemas/aiPlanSchema";
const DEFAULT_GOAL_TIMELINE_MONTHS = 12;
const PROFILE_UPDATABLE_FIELDS = [
  "age",
  "annual_income",
  "monthly_expenses",
  "savings",
  "goals",
  "debts",
  "risk_tolerance",
  "investment_experience"
] as const;

const sanitizeProfileUpdate = (payload: Record<string, unknown>) => {
  const sanitized: Partial<Record<(typeof PROFILE_UPDATABLE_FIELDS)[number], unknown>> = {};

  for (const field of PROFILE_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field) && payload[field] !== undefined) {
      sanitized[field] = payload[field];
    }
  }

  return sanitized;
};

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


export const processAICommand = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { command } = req.body;
    const { requestId } = req;

    // Get user's financial profile
    let profile = await FinancialProfileModel.findOne({ userId: user._id });
    
    if (!profile) {
      return res.status(404).json({ 
        success: false,
        message: "Please create a financial profile first" 
      });
    }

    await ensureProfileTransactionsMigrated(profile);

    const profileUpdatedAt = profile.updatedAt ? new Date(profile.updatedAt).toISOString() : "unknown";
    const transactionsUpdatedAt = profile.transactionsUpdatedAt
      ? new Date(profile.transactionsUpdatedAt as unknown as Date).toISOString()
      : "unknown";
    const cacheKey = buildProcessCommandCacheKey({
      userId: user._id.toString(),
      profileUpdatedAt,
      transactionsUpdatedAt,
      command: String(command || "")
    });

    const cached = await AiResponseCacheModel.findOne({ cacheKey }).lean();
    if (cached?.responseData && typeof cached.responseData === "object") {
      console.log(`[requestId=${requestId}] process-command cache_hit=true`);
      return res.json({ ...(cached.responseData as any), cache_hit: true });
    }

    const txResult = await fetchTransactionsForAi({ userId: user._id });

    const { request: aiRequest, stats } = buildProcessRequest({
      userInput: command,
      profile,
      transactions: txResult.transactions,
      totalTransactions: txResult.stats.totalTransactions,
    });

    console.log(`[requestId=${requestId}] Sending command to Python AI Core`);
    console.log(`[requestId=${requestId}] userInputLength=${command?.length ?? 0}`);
    console.log(
      `[requestId=${requestId}] profileAge=${profile.age} transactionCountSent=${stats.sentTransactions} droppedTransactions=${stats.droppedTransactions}`
    );

    const aiStartedAt = Date.now();
    const aiResponse = await processAiCoreRequest(aiRequest, requestId);
    const aiDurationMs = Date.now() - aiStartedAt;

    const { plan: normalizedPlan, valid: planValid } = normalizeAiPlan(aiResponse.plan);
    if (!planValid) {
      console.warn(`[requestId=${requestId}] ai.plan_validation_failed=true`);
    }
    
    console.log(
      `[requestId=${requestId}] aiCore.durationMs=${aiDurationMs} fallback_used=${aiResponse.fallback_used} llm_call_count=${aiResponse.llm_call_count} analysis_type=${aiResponse.analysis_type}`
    );
    
    console.log(
      `[requestId=${requestId}] Python response agent=${aiResponse.agent} analysisType=${aiResponse.analysis_type} responseLength=${aiResponse.final_output?.length || 0}`
    );

    // Extract and store complete agent output
    const sessionId = uuidv4();
    
    const priority = aiResponse.priority || 'medium';
    const actionable = !!(aiResponse.actionType || aiResponse.insights?.length > 0);
    
    // Create main agent output
    await AgentOutputModel.create({
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
        fallback_used: aiResponse.fallback_used,
        llm_call_count: aiResponse.llm_call_count
      },
      analysis_type: aiResponse.analysis_type || "comprehensive",
      agents_involved: aiResponse.agents_involved || ["master"],
      workflow_trace: aiResponse.workflow_trace || [],
      detailed_analysis: aiResponse.detailed_analysis || {},
      fallback_used: aiResponse.fallback_used,
      llm_call_count: aiResponse.llm_call_count,
      request_id: aiResponse.request_id || requestId,
      priority,
      actionable
    });

    // Store individual insights
    if (aiResponse.insights && Array.isArray(aiResponse.insights)) {
      for (const insight of aiResponse.insights) {
        await AgentOutputModel.create({
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

    const responsePayload = {
      success: true,
      response: aiResponse.final_output,
      plan: normalizedPlan,
      analysis_type: aiResponse.analysis_type,
      agents_involved: aiResponse.agents_involved,
      actionType: aiResponse.actionType,
      priority,
      insights: aiResponse.insights,
      workflow_trace: aiResponse.workflow_trace || [],
      detailed_analysis: aiResponse.detailed_analysis || {},
      fallback_used: aiResponse.fallback_used,
      llm_call_count: aiResponse.llm_call_count,
      request_id: aiResponse.request_id || requestId
    };

    await AiResponseCacheModel.findOneAndUpdate(
      { cacheKey },
      {
        $set: {
          userId: user._id,
          endpoint: "process-command",
          responseData: responsePayload,
          expiresAt: new Date(Date.now() + ttlMs.processCommand)
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ ...responsePayload, cache_hit: false });

  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] AI processing error status=${error.response?.status ?? "unknown"}`);
    console.error(`[requestId=${req.requestId}]`, error.response?.data || error.message);
    
    res.status(500).json({ 
      success: false,
      message: "Failed to process AI command",
      error: error.response?.data?.detail || error.message,
      request_id: req.requestId
    });
  }
};

export const processWhatIfScenario = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { parameters } = req.body;
    const { requestId } = req;

    // Get user's financial profile
    const profile = await FinancialProfileModel.findOne({ userId: user._id });
    
    if (!profile) {
      return res.status(404).json({ message: "Financial profile not found" });
    }

    // Prepare scenario request
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
        transactions: []
      },
      scenario_type: parameters.type || "expense",
      amount: parameters.expense || parameters.income || 0,
      description: parameters.description || ""
    };

    const aiStartedAt = Date.now();
    const response = await processAiCoreScenario(scenarioRequest, requestId);
    const aiDurationMs = Date.now() - aiStartedAt;

    console.log(`[requestId=${requestId}] aiCore.scenario.durationMs=${aiDurationMs}`);

    res.json({
      ...response,
      request_id: response?.request_id || requestId
    });

  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Scenario processing error`, error);
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
      console.warn(
        `[requestId=${req.requestId}] Deprecated endpoint /financial-profiles/:userId called; ignoring userId param`
      );
    }
    
    let profile = await FinancialProfileModel.findOne({ userId: user._id }, { transactions: 0 });
    
    if (!profile) {
      // Create default profile
      profile = await FinancialProfileModel.create({
        userId: user._id,
        age: 30,
        annual_income: 0,
        monthly_expenses: 0,
        savings: 0,
        goals: [],
        debts: [],
        transactions: [],
        risk_tolerance: "moderate",
        investment_experience: "beginner"
      });
    }

    if (!includeTransactions) {
      const dto = profile.toObject();
      delete (dto as any).transactions;
      return res.json(dto);
    }

    const fullProfile = await FinancialProfileModel.findOne({ userId: user._id });
    if (fullProfile) {
      await ensureProfileTransactionsMigrated(fullProfile);
    }

    const recentTransactions = await TransactionModel.find({ userId: user._id })
      .sort({ date: -1 })
      .limit(txLimit)
      .lean();

    const dto = profile.toObject();
    return res.json({
      ...dto,
      transactions: recentTransactions.map(tx => ({
        id: tx._id.toString(),
        amount: tx.amount,
        category: tx.category,
        description: tx.description,
        date: tx.date,
        type: tx.type
      }))
    });

  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error fetching profile:`, error);
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
      console.warn(
        `[requestId=${req.requestId}] Deprecated endpoint /financial-profiles/:userId called; ignoring userId param`
      );
    }

    const profile = await FinancialProfileModel.findOneAndUpdate(
      { userId: user._id },
      {
        $set: updates,
        $setOnInsert: {
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

    res.json(profile);

  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error updating profile:`, error);
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
    const profile = await FinancialProfileModel.findOne({ userId: user._id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    await ensureProfileTransactionsMigrated(profile);

    const normalizedAmount = Math.abs(Number(amount));
    const now = new Date();

    await TransactionModel.create({
      userId: user._id,
      amount: -normalizedAmount,
      category: "Investment",
      description: String(name || "Investment"),
      date: date ? new Date(date) : now,
      type: "investment"
    });

    const updatedProfile = await FinancialProfileModel.findOneAndUpdate(
      { _id: profile._id },
      {
        $set: {
          savings: (profile.savings || 0) - normalizedAmount,
          transactionsUpdatedAt: now
        },
        $inc: { transactionsCount: 1 }
      },
      { new: true }
    );

    res.status(201).json({
      message: "Investment added successfully",
      profile: updatedProfile || profile
    });
  } catch (error: any) {
    console.error(`[requestId=${req.requestId}] Error in addInvestment:`, error);
    res.status(500).json({
      message: "Failed to add investment",
      error: error.message,
      request_id: req.requestId
    });
  }
};

export const getAgentOutputById = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid insight ID" });
    }

    const output = await AgentOutputModel.findById(id);

    if (!output || output.userId.toString() !== user._id.toString()) {
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
        actionType: outputData.actionType || outputData.action
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
    console.error("Error fetching single agent output:", error);
    res.status(500).json({ message: "Failed to fetch agent output" });
  }
};

export const getAgentOutputs = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUserDocument;
    const { userId } = req.params;

    if (userId && userId !== user._id.toString()) {
      console.warn(
        `[requestId=${req.requestId}] /agent-outputs/user/:userId called with mismatched userId; serving authenticated user's outputs`
      );
    }

    const outputs = await AgentOutputModel.find({ userId: user._id })
      .sort({ timestamp: -1 })
      .limit(20);

    // This list correctly contains *summaries* (title, description)
    const insights = outputs
      .filter(output => output.outputData && (output.outputData.title || output.outputData.response)) // Ensure there is data
      .map(output => {
        const outputData = output.outputData || {};
        
        return {
          id: output._id.toString(),
          agentType: output.agentType,
          agent: outputData.agent || output.agentType,
          priority: output.priority || "medium",
          actionable: output.actionable || false,
          outputData: {
            title: outputData.title || (outputData.response ? output.userInput : "Financial Insight"),
            description: outputData.description || 
                           outputData.response?.substring(0, 200) + "..." || 
                           "Analysis completed",
            action: outputData.actionType || outputData.action,
            actionType: outputData.actionType || outputData.action
          },
          timestamp: output.timestamp,
          analysis_type: output.analysis_type,
          fallback_used: output.fallback_used || false,
          llm_call_count: output.llm_call_count || 0
        };
      });

    res.json(insights);

  } catch (error: any) {
    console.error("Error fetching outputs:", error);
    res.status(500).json({ message: "Failed to fetch agent outputs" });
  }
};


import { Request, Response } from "express";
import ChatSessionModel, { IChatSessionDocument } from "../models/chatSessionModel";
import ChatMessageModel, { IChatMessageDocument } from "../models/chatMessageModel";
import FinancialProfileModel from "../models/financialProfileModel";
import { IUserDocument } from "../models/userModel";
import mongoose from "mongoose";
import { processAiCoreRequest } from "../services/aiCoreClient";
const DEFAULT_GOAL_TIMELINE_MONTHS = 12;

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
 * Create a new chat session
 */
export async function createSession(req: Request, res: Response) {
  try {
    const user = req.user as IUserDocument;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const session = await ChatSessionModel.create({
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
    console.error("Error creating chat session:", error);
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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const sessions = await ChatSessionModel.find({
      userId: user._id,
      isArchived: false
    })
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ChatSessionModel.countDocuments({
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
    console.error("Error fetching chat sessions:", error);
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

    const { sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await ChatSessionModel.findOne({
      _id: sessionId,
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
    console.error("Error fetching chat session:", error);
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

    const { sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await ChatSessionModel.findOneAndDelete({
      _id: sessionId,
      userId: user._id
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Delete all messages in this session
    await ChatMessageModel.deleteMany({ sessionId: session._id });

    return res.json({ message: "Session deleted successfully" });
  } catch (error) {
    console.error("Error deleting chat session:", error);
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

    const { sessionId } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await ChatSessionModel.findOneAndUpdate(
      { _id: sessionId, userId: user._id },
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
    console.error("Error renaming chat session:", error);
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

    const { sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    // Verify session belongs to user
    const session = await ChatSessionModel.findOne({
      _id: sessionId,
      userId: user._id
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const messages = await ChatMessageModel.find({ sessionId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ChatMessageModel.countDocuments({ sessionId });

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
    console.error("Error fetching messages:", error);
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

    const { sessionId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ message: "Message content is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    // Verify session belongs to user
    const session = await ChatSessionModel.findOne({
      _id: sessionId,
      userId: user._id
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Create user message
    const userMessage = await ChatMessageModel.create({
      sessionId: session._id,
      userId: user._id,
      role: "user",
      content: content.trim()
    });

    // Get the user's financial profile for AI context
    const financialProfile = await FinancialProfileModel.findOne({ userId: user._id });

    // Build user profile for AI
    const userProfile = {
      age: financialProfile?.age || 30,
      annual_income: financialProfile?.annual_income || 0,
      monthly_expenses: financialProfile?.monthly_expenses || 0,
      savings: financialProfile?.savings || 0,
      goals: financialProfile?.goals || [],
      debts: financialProfile?.debts || [],
      transactions: financialProfile?.transactions?.slice(-50) || [],
      risk_tolerance: financialProfile?.risk_tolerance || "moderate",
      investment_experience: financialProfile?.investment_experience || "beginner"
    };

    let aiResponseContent = "I apologize, but I'm having trouble processing your request right now. Please try again.";
    let aiMetadata: any = {};

    try {
      const aiResponse = await processAiCoreRequest(
        {
          user_input: content.trim(),
          user_profile: {
            age: userProfile.age,
            annual_income: userProfile.annual_income,
            monthly_expenses: userProfile.monthly_expenses,
            savings: userProfile.savings,
            debts: userProfile.debts || [],
            financial_goals: (userProfile.goals || []).map((g: any) => ({
              name: g.name || "Goal",
              target: g.target || 0,
              timeline_months: getTimelineMonths(g.deadline),
              priority: g.priority || 1
            })),
            risk_tolerance: userProfile.risk_tolerance,
            investment_experience: userProfile.investment_experience,
            time_horizon: 10,
            transactions: (userProfile.transactions || []).map((t: any) => ({
              amount: t.amount || 0,
              category: t.category || "Other",
              description: t.description || "",
              date: t.date || new Date().toISOString(),
              type: t.type || "expense"
            }))
          }
        },
        requestId
      );

      if (aiResponse && aiResponse.success) {
        aiResponseContent = aiResponse.final_output || aiResponseContent;
        aiMetadata = {
          analysisType: aiResponse.analysis_type,
          agentsInvolved: aiResponse.agents_involved,
          priority: aiResponse.priority,
          actionable: aiResponse.actionType ? true : false,
          detailedAnalysis: aiResponse.detailed_analysis || {},
          workflowTrace: aiResponse.workflow_trace || [],
          fallbackUsed: aiResponse.fallback_used || false,
          llmCallCount: aiResponse.llm_call_count || 0,
          requestId: aiResponse.request_id || requestId
        };
      }
    } catch (aiError: any) {
      console.error(`[requestId=${requestId}] AI service error:`, aiError.message);
      aiResponseContent = "I'm currently experiencing some difficulties connecting to the AI service. Please try again in a moment.";
    }

    // Create AI response message
    const aiMessage = await ChatMessageModel.create({
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

    await ChatSessionModel.findByIdAndUpdate(session._id, updateData);

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
    console.error(`[requestId=${req.requestId}] Error sending message:`, error);
    return res.status(500).json({ message: "Failed to send message", request_id: req.requestId });
  }
}

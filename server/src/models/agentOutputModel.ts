import { Schema, model, Document, Types } from "mongoose";

// This interface matches the frontend's IAgentOutput AND the new Python response
export interface IAgentOutput {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  sessionId: string;
  userInput: string;
  agentType: string; // The agent that *ran* (e.g., master, budget_planner)
  outputData: {
    response?: string; // The main text response (for comprehensive plan)
    title?: string;
    description?: string;
    action?: string; // Fallback action
    actionType?: string; // Primary action type (e.g., "invest", "review_budget")
    agent?: string; // The agent *name* (e.g., "investment_advisor")
    insights?: Array<{
      agent: string;
      title: string;
      description: string;
      actionType: string;
    }>;
    [key: string]: any; // Allow other properties
  };
  analysis_type: string;
  agents_involved: string[];
  workflow_trace?: Array<{
    agent: string;
    startedAt: string;
    endedAt: string;
    status: string;
    error?: string;
  }>;
  detailed_analysis?: Record<string, unknown>;
  fallback_used?: boolean;
  llm_call_count?: number;
  request_id?: string;
  feedback?: {
    rating: "up" | "down";
    note?: string;
    createdAt?: Date;
  };
  timestamp: Date;
  priority?: 'low' | 'medium' | 'high';
  actionable?: boolean;
}

export interface IAgentOutputDocument extends IAgentOutput, Document {
  _id: Types.ObjectId;
}

const agentOutputSchema = new Schema<IAgentOutputDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true },
    userInput: { type: String, required: true },
    agentType: { type: String, required: true },
    outputData: {
      type: Schema.Types.Mixed,
      required: true,
      default: {}
    },
    analysis_type: { type: String, required: true },
    agents_involved: [String],
    workflow_trace: {
      type: [Schema.Types.Mixed],
      default: []
    },
    detailed_analysis: {
      type: Schema.Types.Mixed,
      default: {}
    },
    fallback_used: { type: Boolean, default: false },
    llm_call_count: { type: Number, default: 0 },
    request_id: { type: String },
    feedback: {
      rating: { type: String, enum: ["up", "down"] },
      note: { type: String },
      createdAt: { type: Date, default: Date.now }
    },
    timestamp: { type: Date, default: Date.now },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    actionable: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    strict: false // Allow any fields inside outputData
  }
);

agentOutputSchema.index({ orgId: 1, userId: 1, timestamp: -1 });
agentOutputSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
agentOutputSchema.index({ orgId: 1, userId: 1, request_id: 1, timestamp: -1 });
agentOutputSchema.index({ orgId: 1, userId: 1, actionable: 1, timestamp: -1 });

const AgentOutputModel = model<IAgentOutputDocument>("AgentOutput", agentOutputSchema);
export default AgentOutputModel;

/**
 * @fileoverview Shared Frontend Type Definitions
 *
 * Core domain types used across all frontend components, hooks, and stores.
 * These interfaces mirror the server-side Mongoose models but are tailored
 * for frontend consumption (e.g., optional fields, Date | string unions).
 *
 * NAMING CONVENTION:
 * - "I" prefix for interfaces (ITransaction, IFinancialProfile)
 * - Matches the server model names for easy cross-referencing
 *
 * DATE HANDLING:
 * Dates use `Date | string` union types because:
 * - Server returns ISO strings in JSON
 * - Frontend components may parse them into Date objects
 * - This flexibility prevents type errors at boundaries
 *
 * @module types
 */

/** A financial goal (e.g., "Save for vacation", "Emergency fund") */
export interface IFinancialGoal {
  id?: string;
  name: string;
  target: number;
  current: number;
  deadline: string;
  priority: number;
}

export interface IDebt {
  id?: string;
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  type: string;
}

export interface IMutationSource {
  origin: "manual" | "csv_import" | "receipt_ocr" | "journal" | "task_completion" | "ai_plan";
  request_id?: string;
  task_id?: string;
  agent_output_id?: string;
  receipt_id?: string;
  journal_entry_id?: string;
  action_link_id?: string;
  actor_type?: "user" | "system" | "agent";
  source_ref?: string;
  note?: string;
}

export interface ITransaction {
  id?: string;
  _id?: string;
  amount: number;
  category: string;
  description: string;
  date: Date | string; 
  type: 'income' | 'expense' | 'investment';
  source?: IMutationSource;
  review?: {
    needs_attention: boolean;
    flags: Array<"uncategorized" | "suspected_duplicate" | "needs_merchant_match" | "split_candidate" | "recurring_candidate">;
    notes?: string[];
    attention_score?: number;
  };
  reconciliation?: {
    status?: "unreconciled" | "cleared" | "reconciled";
    reference?: string;
    statementDate?: string | Date;
    statementBalance?: number;
    reconciledAt?: string | Date;
  };
  import_details?: {
    importId?: string;
    fileName?: string;
    rowIndex?: number;
    duplicateKey?: string;
    committedAt?: string | Date;
  };
  running_balance?: number;
}

export interface IFinancialProfile {
  _id?: string; 
  userId: string;
  age: number;
  annual_income: number;
  monthly_expenses: number;
  savings: number;
  goals: IFinancialGoal[];
  debts: IDebt[];
  transactions?: ITransaction[];
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  investment_experience: 'beginner' | 'intermediate' | 'expert';
  transactionsCount?: number;
  transactionsUpdatedAt?: string;
  onboardingCompletedAt?: string;
  onboardingVersion?: string;
  lastMutation?: IMutationSource & { at?: string };
  completeness?: {
    has_income: boolean;
    has_expenses: boolean;
    has_goals: boolean;
    has_debts: boolean;
    has_transactions: boolean;
  };
}

export interface IWorkflowTraceEntry {
  agent: string;
  startedAt: string;
  endedAt: string;
  status: string;
  error?: string;
}

export interface IAgentOutput {
  id: string; 
  agentType: string;
  agent?: string;
  priority?: 'low' | 'medium' | 'high';
  actionable?: boolean;
  outputData: {
    response?: string;
    title?: string;
    description?: string;
    action?: string;
    actionType?: string;
    agent?: string;
    insights?: Array<{
      agent: string;
      title: string;
      description: string;
      actionType: string;
    }>;
    [key: string]: any;
  };
  analysis_type: string;
  agents_involved: string[];
  workflow_trace?: IWorkflowTraceEntry[];
  detailed_analysis?: Record<string, unknown>;
  fallback_used?: boolean;
  llm_call_count?: number;
  timestamp: Date | string; 
}

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

// Models targeted monetary savings goals established by a user.
// Stores financial targets, current accumulated balances, deadlines, and urgency.
// Supplies the data contract for goal progress tracking widgets and forecasts.
/** A financial goal (e.g., "Save for vacation", "Emergency fund") */
export interface IFinancialGoal {
  id?: string;
  name: string;
  target: number;
  current: number;
  deadline: string;
  priority: number;
}

// Defines outstanding liabilities, loans, and credit balances owed by a user.
// Captures interest rates, current balances, required minimums, and debt types.
// Feeds payoff calculation models like the avalanche and snowball strategies.
export interface IDebt {
  id?: string;
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  type: string;
}

// Traces the origin and attribution context of transaction modifications.
// Records source mechanisms like manual entry, CSV parsing, OCR, or AI actions.
// Maintains audit logs linking records to specific actors, tasks, and requests.
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

// Represents individual financial revenue, expense, and investment transactions.
// Supports multi-currency conversion, category splits, review flags, and reconciliations.
// Acts as the foundational data entity powering charts, budgets, and cashflow analytics.
export interface ITransaction {
  id?: string;
  _id?: string;
  amount: number;
  raw_amount?: number;
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  category: string;
  description: string;
  date: Date | string; 
  type: 'income' | 'expense' | 'investment';
  splits?: Array<{
    category: string;
    amount: number;
    raw_amount?: number;
  }>;
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

// Encapsulates the comprehensive financial snapshot and preferences of a user.
// Aggregates demographic data, income, expenses, linked goals, debts, and risk appetite.
// Serves as the central profile payload consumed by planning and advisory agents.
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
  currency?: string;
  fx_rate?: number;
  currency_symbol?: string;
  completeness?: {
    has_income: boolean;
    has_expenses: boolean;
    has_goals: boolean;
    has_debts: boolean;
    has_transactions: boolean;
  };
}

// Records execution telemetry for an individual agent within a workflow sequence.
// Tracks execution timestamps, latency, phase names, token metrics, and cache status.
// Supplies observable diagnostic trails for inspecting multi-agent coordination.
export interface IWorkflowTraceEntry {
  agent: string;
  startedAt: string;
  endedAt: string;
  status: string;
  error?: string;
  phase?: string;
  latencyMs?: number;
  llmCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  tokenCount?: number;
  fallbackUsed?: boolean;
  cacheHit?: boolean;
}

// Captures synthesized recommendations and analytical findings produced by AI agents.
// Bundles structured response text, action items, involved agent lists, and traces.
// Serves as the primary persistence contract for agent insights and advisory cards.
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

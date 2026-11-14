/**
 * @fileoverview Financial Profile Model
 *
 * Defines the core user financial profile schema, goals, debt instruments,
 * and cache-invalidation metadata for AI planning.
 *
 * ============================================================================
 * MINDMAP FLOW: FINANCIAL PROFILE SCHEMA & SUBDOCUMENT TOPOLOGY
 * ============================================================================
 * - Financial Profile Data Model
 *     ├── 1. Tenant Scoping & Uniqueness
 *     │   ├── orgId: Organization ObjectId reference (indexed)
 *     │   ├── userId: User ObjectId reference (indexed)
 *     │   └── Unique Compound Index: { orgId: 1, userId: 1 }
 *     ├── 2. Baseline Financial Attributes
 *     │   ├── Income & Outflows: annual_income, monthly_expenses, savings
 *     │   ├── Demographics: age
 *     │   └── Behavioral Profiles: risk_tolerance, investment_experience
 *     ├── 3. Embedded Subdocument Collections
 *     │   ├── Goals (IFinancialGoal): target, current, deadline, priority
 *     │   └── Debts (IDebt): balance, interest_rate, minimum_payment, type
 *     └── 4. State & Cache Invalidation Invariants
 *         ├── transactionsCount: Counter used for data freshness checks
 *         ├── transactionsUpdatedAt: Mutation timestamp to bust AI cache keys
 *         ├── transactionsMigratedAt: Legacy embedded to relational migration flag
 *         └── lastMutation: Provenance tracking (source: ai, user, sync)
 *
 * ============================================================================
 * ASCII FLOW: PROFILE ENTITY RELATIONSHIPS & CACHE METADATA
 * ============================================================================
 *                      +----------------------------------+
 *                      |    FinancialProfileDocument      |
 *                      |    - orgId (Multi-tenant ref)    |
 *                      |    - userId (Account owner ref)  |
 *                      |    - annual_income / expenses    |
 *                      +----------------+-----------------+
 *                                       |
 *             +-------------------------+-------------------------+
 *             |                         |                         |
 *             v                         v                         v
 *    +------------------+      +------------------+      +------------------+
 *    | goals []         |      | debts []         |      | Cache Metadata   |
 *    | - target amount  |      | - balance        |      | - txnsUpdatedAt  |
 *    | - current savings|      | - interest rate  |      | - txnsCount      |
 *    | - deadline (ISO) |      | - min payment    |      | - lastMutation   |
 *    +------------------+      +------------------+      +------------------+
 *
 * @module models/financialProfileModel
 */

import { Schema, model, Document, Types } from "mongoose";
import type { MutationSource } from "../types/provenance";

// Defines the structure for a user's financial goal entry.
// Tracks target amount, current savings, deadline, and priority ranking.
// Used within financial profile documents to project future target milestones.
export interface IFinancialGoal {
  _id?: Types.ObjectId;
  name: string;
  target: number;
  current: number;
  deadline: string;
  priority: number;
}

// Defines the structure for an outstanding debt instrument.
// Captures balance, interest rate, minimum payment, and instrument category.
// Helps calculate net worth and debt payoff prioritization strategies.
export interface IDebt {
  _id?: Types.ObjectId;
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  type: string;
}

// Defines the structure for embedded legacy transaction subdocuments.
// Represents basic ledger records with monetary value, category, and date.
// Kept for backwards compatibility alongside dedicated transaction collections.
export interface ITransaction {
  _id?: Types.ObjectId;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: 'income' | 'expense' | 'investment';
}

// Defines the primary interface for user financial profile entities.
// Contains demographic info, income, goals, debts, and AI mutation provenance.
// Serves as the central state object driving automated planning and telemetry.
export interface IFinancialProfile {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  age: number;
  annual_income: number;
  monthly_expenses: number;
  savings: number;
  goals: IFinancialGoal[];
  debts: IDebt[];
  transactions: ITransaction[];
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  investment_experience: 'beginner' | 'intermediate' | 'expert';
  transactionsCount?: number;
  transactionsUpdatedAt?: Date;
  transactionsMigratedAt?: Date;
  onboardingCompletedAt?: Date;
  onboardingVersion?: string;
  lastMutation?: MutationSource & { at?: Date };
}

// Combines the financial profile interface with Mongoose Document properties.
// Exposes timestamps, unique document identification, and lifecycle methods.
// Represents the strongly-typed document returned by database queries.
export interface IFinancialProfileDocument extends IFinancialProfile, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Configures the Mongoose schema mapping for the financial profile collection.
// Enforces validation rules, default parameters, and subdocument arrays.
// Handles multi-tenant organization scoping and AI cache invalidation metadata.
const financialProfileSchema = new Schema<IFinancialProfileDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    age: { type: Number, required: true },
    annual_income: { type: Number, required: true },
    monthly_expenses: { type: Number, required: true },
    savings: { type: Number, default: 0 },
    goals: [{
      name: { type: String, required: true },
      target: { type: Number, required: true },
      current: { type: Number, required: true },
      deadline: { type: String, required: true },
      priority: { type: Number, required: true }
    }],
    
    // ✅ FIX: Properly define the debts subdocument schema
    debts: [{
      name: { type: String, required: true },
      balance: { type: Number, required: true },
      interest_rate: { type: Number, required: true },
      minimum_payment: { type: Number, required: true },
      type: { type: String, required: true }
    }],

    transactions: [{
      amount: { type: Number, required: true },
      category: { type: String, required: true },
      description: { type: String, required: true },
      date: { type: Date, required: true },
      type: { 
        type: String, 
        enum: ['income', 'expense', 'investment'],
        required: true 
      }
    }],

    // New: transaction metadata used for cache invalidation and migration tracking.
    // Transactions are stored in the dedicated Transaction collection; this embedded array is legacy-only.
    transactionsCount: { type: Number, default: 0 },
    transactionsUpdatedAt: { type: Date, default: Date.now },
    transactionsMigratedAt: { type: Date },
    onboardingCompletedAt: { type: Date },
    onboardingVersion: { type: String },
    lastMutation: {
      origin: {
        type: String,
        enum: ["manual", "csv_import", "receipt_ocr", "journal", "task_completion", "ai_plan", "connector"],
      },
      request_id: { type: String },
      task_id: { type: String },
      agent_output_id: { type: String },
      receipt_id: { type: String },
      journal_entry_id: { type: String },
      action_link_id: { type: String },
      actor_type: { type: String, enum: ["user", "system", "agent"] },
      source_ref: { type: String },
      note: { type: String },
      at: { type: Date },
    },
    risk_tolerance: { 
      type: String, 
      enum: ['conservative', 'moderate', 'aggressive'],
      default: 'moderate'
    },
    investment_experience: { 
      type: String,
      enum: ['beginner', 'intermediate', 'expert'],
      default: 'beginner'
    }
  },
  { timestamps: true }
);

// Enforces a compound unique index on organization and user identifiers.
// Guarantees one unique financial profile document per user per organization.
// Optimizes profile resolution lookups during authenticated API requests.
financialProfileSchema.index({ orgId: 1, userId: 1 }, { unique: true });

// Instantiates and registers the compiled Mongoose financial profile model.
// Provides ODM query interfaces for accessing and mutating profile records.
// Exported as default for consumption by controllers and analytical services.
const FinancialProfileModel = model<IFinancialProfileDocument>("FinancialProfile", financialProfileSchema);
export default FinancialProfileModel;
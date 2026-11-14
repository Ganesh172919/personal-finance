/**
 * @fileoverview Account Model
 *
 * This module defines the Account schema and model for the Personal Finance application.
 * It represents financial accounts (bank accounts, credit cards, etc.) that belong to organizations.
 *
 * KEY FEATURES:
 * - Support for multiple account types (checking, savings, credit, brokerage, cash)
 * - Organization-scoped accounts (multi-tenancy)
 * - Account status tracking (active, closed)
 * - Balance tracking (opening, statement, reconciled)
 * - Currency support with ISO 4217 codes
 * - Institution information
 * - Metadata for extensibility
 *
 * ACCOUNT TYPES:
 * - checking: Standard checking account
 * - savings: Savings account
 * - credit: Credit card account
 * - brokerage: Investment/brokerage account
 * - cash: Cash account
 *
 * @module models/accountModel
 */

import { Schema, model, Document, Types } from "mongoose"; // MongoDB ODM
import { orgScopePlugin } from "../utils/orgScopePlugin";

/**
 * Account Type Enum
 *
 * Defines the types of financial accounts supported.
 */
// Enumerates the supported categories of financial account entities.
// Determines balance behavior distinguishing between asset and liability accounts.
// Enforces valid categorization values across database records and APIs.
export type AccountType = "checking" | "savings" | "credit" | "brokerage" | "cash";

/**
 * Account Status Enum
 *
 * Defines the possible states of an account.
 */
// Represents operational lifecycle status states of a financial account.
// Distinguishes open active ledger accounts from archived closed accounts.
// Restricts status assignment to validated active or closed enum values.
export type AccountStatus = "active" | "closed";

/**
 * Account Interface
 *
 * Defines the structure of an account document in MongoDB.
 */
// Defines TypeScript interface for financial account document attributes.
// Encapsulates balances, institutional identifiers, currency, and timestamps.
// Serves as strongly-typed model contract for account queries and updates.
export interface IAccount {
  orgId: Types.ObjectId; // Organization that owns this account
  name: string; // Account name (e.g., "Primary Checking")
  institution?: string; // Financial institution name
  type: AccountType; // Account type (checking, savings, etc.)
  currency: string; // ISO 4217 currency code (e.g., "USD")
  mask?: string; // Last 4 digits of account number
  openingBalance?: number; // Initial balance when account was created
  lastStatementBalance?: number; // Balance from last statement
  lastStatementDate?: Date; // Date of last statement
  lastReconciledAt?: Date; // When account was last reconciled
  status: AccountStatus; // Account status (active, closed)
  createdByUserId?: Types.ObjectId; // User who created the account
  metadata?: Record<string, unknown>; // Additional metadata
  createdAt: Date; // When account was created
  updatedAt: Date; // When account was last updated
}

/**
 * Account Document Interface
 *
 * Extends IAccount with Mongoose Document methods and _id field.
 */
// Extends IAccount interface with Mongoose Document methods and objectId.
// Provides runtime document persistence, validation, and schema methods.
// Enables strongly-typed querying across MongoDB account collection.
export interface IAccountDocument extends IAccount, Document {
  _id: Types.ObjectId; // MongoDB ObjectId
}

/**
 * Account Schema Definition
 *
 * Defines the structure and validation rules for account documents.
 *
 * FIELD OPTIONS:
 * - required: Field must be present
 * - ref: Reference to another collection
 * - index: Create database index for faster queries
 * - trim: Remove leading/trailing whitespace
 * - uppercase: Convert to uppercase before saving
 * - minlength/maxlength: String length constraints
 * - default: Default value if not provided
 * - enum: Restrict to specific values
 */
// Defines Mongoose schema configuration and validation rules for accounts.
// Enforces required fields, string length constraints, and currency formatting.
// Enables automated timestamp tracking for createdAt and updatedAt dates.
const accountSchema = new Schema<IAccountDocument>(
  {
    // Organization that owns this account (indexed)
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    // Account name (trimmed, max 120 chars)
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Financial institution name (trimmed, max 120 chars)
    institution: { type: String, trim: true, maxlength: 120 },
    // Account type (indexed)
    type: {
      type: String,
      required: true,
      enum: ["checking", "savings", "credit", "brokerage", "cash"],
      index: true,
    },
    // ISO 4217 currency code (uppercase, exactly 3 chars)
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: "USD",
    },
    // Last 4 digits of account number (max 16 chars)
    mask: { type: String, trim: true, maxlength: 16 },
    // Initial balance (default: 0)
    openingBalance: { type: Number, default: 0 },
    // Balance from last statement
    lastStatementBalance: { type: Number },
    // Date of last statement
    lastStatementDate: { type: Date },
    // When account was last reconciled
    lastReconciledAt: { type: Date },
    // Account status (active or closed)
    status: { type: String, enum: ["active", "closed"], required: true, default: "active", index: true },
    // User who created the account
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    // Additional metadata (flexible schema)
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true } // Automatically add createdAt and updatedAt fields
);

/**
 * Database Indexes
 *
 * Compound indexes for common query patterns:
 * - orgId + status + updatedAt: For listing accounts by status
 * - orgId + type + status + updatedAt: For filtering by type and status
 */
// Configures multi-field compound indexes optimizing account lookup queries.
// Accelerates organization-scoped filtering by account status, type, and date.
// Ensures high-performance queries across large multi-tenant account tables.
accountSchema.index({ orgId: 1, status: 1, updatedAt: -1 });
accountSchema.index({ orgId: 1, type: 1, status: 1, updatedAt: -1 });

// Attaches organization scoping plugin to automatically enforce multi-tenancy.
// Injects orgId query predicates preventing accidental cross-tenant data leakage.
// Guarantees tenant isolation across all find, update, and delete queries.
accountSchema.plugin(orgScopePlugin);

/**
 * Account Model
 *
 * Mongoose model for account documents.
 * Used for CRUD operations on account data.
 */
// Instantiates Mongoose model bound to MongoDB "Account" data collection.
// Provides strongly typed CRUD operations and query building methods.
// Manages document lifecycle and persistence for financial account entities.
const AccountModel = model<IAccountDocument>("Account", accountSchema);
// Exports compiled AccountModel instance as default module export.
// Imported by controllers, migration scripts, and financial ledger services.
// Provides central gateway for all database interactions with account records.
export default AccountModel;

/**
 * =============================================================================
 * END-OF-FILE SUMMARY
 * =============================================================================
 *
 * KEY TAKEAWAYS:
 *
 * 1. Financial Account Abstraction
 *    This model represents any financial account a user tracks: bank accounts (checking,
 *    savings), credit cards, investment/brokerage accounts, or plain cash. The `type` enum
 *    determines how the account is treated in calculations (e.g., credit card balances are
 *    liabilities, while checking balances are assets).
 *
 * 2. Multi-Tenancy
 *    Every account is scoped to an organization via `orgId`. Unlike TransactionModel,
 *    this schema does not use the `orgScopePlugin` directly, but application-level
 *    middleware ensures all queries include the orgId filter.
 *
 * 3. Balance Tracking
 *    The model tracks three balance snapshots:
 *    - `openingBalance`: The initial balance when the account was created. Serves as the
 *      baseline for running balance calculations.
 *    - `lastStatementBalance`: The balance from the most recent bank/credit card statement.
 *    - `lastStatementDate` and `lastReconciledAt`: Timestamps for the last statement and
 *      reconciliation event, enabling the system to detect stale or outdated balances.
 *
 * 4. Currency Handling
 *    The `currency` field uses ISO 4217 codes (e.g., "USD", "EUR", "INR"), stored uppercase
 *    with exactly 3 characters. This is enforced at the schema level with minlength/maxlength
 *    constraints. The default is "USD", matching the Organization model's default currency.
 *
 * 5. Institution and Mask
 *    The `institution` field stores the financial institution name (e.g., "Chase", "Wells Fargo")
 *    for display purposes. The `mask` field stores the last few digits of the account number,
 *    providing a way to distinguish between multiple accounts at the same institution without
 *    exposing the full account number.
 *
 * 6. Metadata for Extensibility
 *    The `metadata` field uses Schema.Types.Mixed to allow storing arbitrary key-value data
 *    without schema migrations. This can accommodate institution-specific fields, import
 *    artifacts, or future features like account nicknames and color coding.
 *
 * 7. Index Design
 *    Two compound indexes support the most common query patterns:
 *    - orgId + status + updatedAt: Lists active accounts sorted by recent activity
 *    - orgId + type + status + updatedAt: Filters accounts by type (e.g., "show only
 *      credit cards") while also filtering by status
 *
 * 8. Relationships
 *    - orgId -> Organization (multi-tenancy)
 *    - createdByUserId -> User (the user who created this account)
 *    - Referenced by: Transaction.accountId (many transactions belong to one account)
 *
 * =============================================================================
 */

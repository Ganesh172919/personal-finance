/**
 * @fileoverview Organization Model
 *
 * This module defines the Organization schema and model for the Personal Finance application.
 * It is the foundational multi-tenancy entity -- every financial record (accounts, transactions,
 * chat sessions, etc.) is scoped to an organization via its `orgId` field. This ensures strict
 * data isolation between different users or teams sharing the same database.
 *
 * KEY FEATURES:
 * - Multi-tenancy: Every other domain model references Organization via orgId
 * - Two organization types: "personal" (single user) and "team" (collaborative)
 * - URL-friendly slug for routing and display (unique, auto-lowercased)
 * - Regional settings: currency (ISO 4217), locale (BCP 47), and timezone (IANA)
 * - Ownership tracking via createdByUserId (the user who created the org)
 * - Automatic timestamps for audit trails
 *
 * HOW IT FITS INTO THE SYSTEM:
 * - TransactionModel, AccountModel, ChatSessionModel, and ChatMessageModel all reference orgId
 * - The `orgScopePlugin` used by other models enforces that queries include orgId
 * - User registration typically creates a default "personal" organization
 * - "team" organizations support future multi-user collaboration features
 *
 * @module models/organizationModel
 */

import { Schema, model, Document, Types } from "mongoose"; // MongoDB ODM

/**
 * Organization Type Enum
 *
 * "personal" - Single-user organization created automatically on signup.
 * "team"     - Multi-user organization for collaborative finance management.
 */
export type OrganizationType = "personal" | "team";

/**
 * Organization Interface
 *
 * Defines the structure of an organization document in MongoDB.
 */
export interface IOrganization {
  name: string; // Human-readable organization name (e.g., "My Finances")
  slug: string; // URL-friendly identifier, unique, auto-lowercased (e.g., "my-finances")
  type: OrganizationType; // Organization type: "personal" or "team"
  createdByUserId: Types.ObjectId; // Reference to the User who created this organization
  currency: string; // ISO 4217 currency code (e.g., "USD", "EUR"), uppercase, exactly 3 chars
  locale: string; // BCP 47 locale string (e.g., "en-US") for formatting numbers and dates
  timezone: string; // IANA timezone identifier (e.g., "America/New_York") for date display
  createdAt: Date; // When the organization was created (auto-managed by Mongoose timestamps)
  updatedAt: Date; // When the organization was last modified (auto-managed by Mongoose timestamps)
}

/**
 * Organization Document Interface
 *
 * Extends IOrganization with Mongoose Document methods and _id field.
 * This is the actual document type returned from MongoDB queries.
 */
export interface IOrganizationDocument extends IOrganization, Document {
  _id: Types.ObjectId; // MongoDB ObjectId primary key
}

/**
 * Organization Schema Definition
 *
 * Defines the structure, validation rules, and defaults for organization documents.
 *
 * FIELD OPTIONS USED:
 * - required: Field must be present when creating a document
 * - unique: Creates a unique index; no two documents can share the same value
 * - trim: Removes leading/trailing whitespace before saving
 * - lowercase: Converts value to lowercase before saving
 * - uppercase: Converts value to uppercase before saving
 * - minlength/maxlength: Enforces string length constraints
 * - enum: Restricts value to a fixed set of allowed strings
 * - ref: Declares a Mongoose population reference to another collection
 * - index: Creates a database index for faster queries on this field
 * - default: Provides a fallback value when none is supplied
 */
const organizationSchema = new Schema<IOrganizationDocument>(
  {
    // Human-readable name for the organization (e.g., "Smith Family Finances")
    name: { type: String, required: true, trim: true, maxlength: 120 },

    // URL-friendly slug derived from the name; must be unique across all organizations.
    // Lowercased automatically to normalize lookups (e.g., "smith-family-finances").
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80, unique: true },

    // Determines the organization's collaboration model.
    // "personal" is the default for single-user setups; "team" enables future multi-user features.
    type: { type: String, enum: ["personal", "team"], required: true, default: "personal" },

    // Reference to the User document that created this organization.
    // Indexed to speed up queries like "find all organizations owned by this user."
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // ISO 4217 three-letter currency code (e.g., "USD", "INR", "EUR").
    // Stored uppercase to ensure consistent comparisons and display.
    currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },

    // BCP 47 locale string controlling number/date formatting (e.g., "en-US", "de-DE").
    locale: { type: String, required: true, trim: true, maxlength: 50, default: "en-US" },

    // IANA timezone identifier (e.g., "Asia/Kolkata", "America/New_York").
    // Used to display dates and times in the user's local context.
    timezone: { type: String, required: true, trim: true, maxlength: 80, default: "UTC" },
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt Date fields
);

/**
 * Compound Index: createdByUserId + createdAt (descending)
 *
 * Optimizes queries that fetch a user's organizations sorted by creation date
 * (most recent first). Common in account-switching UIs and admin dashboards.
 */
organizationSchema.index({ createdByUserId: 1, createdAt: -1 });

/**
 * Organization Model
 *
 * Mongoose model for organization documents.
 * Used for CRUD operations on organization data and as the multi-tenancy anchor
 * for all other domain models in the system.
 */
const OrganizationModel = model<IOrganizationDocument>("Organization", organizationSchema);
export default OrganizationModel;

/**
 * =============================================================================
 * END-OF-FILE SUMMARY
 * =============================================================================
 *
 * KEY TAKEAWAYS:
 *
 * 1. Multi-Tenancy Anchor
 *    This model is the root of the data isolation hierarchy. Every transaction,
 *    account, chat session, and chat message stores an `orgId` that references
 *    an Organization document. The `orgScopePlugin` used elsewhere enforces
 *    that all queries are scoped to the correct organization.
 *
 * 2. Personal vs. Team
 *    The "personal" type is created by default when a user signs up. The "team"
 *    type is reserved for future collaborative features where multiple users
 *    share a single financial workspace.
 *
 * 3. Regional Defaults
 *    Currency, locale, and timezone all have sensible defaults (USD, en-US, UTC)
 *    so the system works out of the box. These are configurable per organization
 *    and influence how amounts, dates, and times are displayed throughout the UI.
 *
 * 4. Slug-Based Routing
 *    The unique, lowercase `slug` field enables human-friendly URLs (e.g.,
 *    /org/smith-family/settings) without exposing MongoDB ObjectIds.
 *
 * 5. Relationships
 *    - createdByUserId -> User (many organizations can be created by one user)
 *    - Referenced by: Transaction.orgId, Account.orgId, ChatSession.orgId,
 *      ChatMessage.orgId
 * =============================================================================
 */

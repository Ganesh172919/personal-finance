/**
 * @fileoverview Newsletter Preference Model
 *
 * Stores per-user newsletter delivery preferences within an organization.
 * Each user gets one preference document per org, controlling what content
 * sections appear in their daily newsletter, delivery time, and timezone.
 *
 * Key fields:
 *   - isSubscribed: master toggle for newsletter delivery
 *   - deliveryTime: HH:mm string in user's local timezone
 *   - timezone: IANA timezone identifier (e.g. "Asia/Kolkata")
 *   - contentPreferences: granular toggles for each newsletter section
 *   - lastSentAt: tracks when the last newsletter was delivered
 *   - unsubscribeToken: unique UUID for one-click unsubscribe links
 *
 * Indexes:
 *   - (orgId, userId) unique compound index ensures one preference per user per org
 *   - userId and orgId individually indexed for query flexibility
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * NewsletterPreferenceModel
 * ├── 1. Multi-Tenant Identity
 * │   ├── userId: ObjectId (Ref: User)
 * │   ├── orgId: ObjectId (Ref: Organization)
 * │   └── Unique Compound Index: { orgId, userId }
 * ├── 2. Subscription & Scheduling
 * │   ├── isSubscribed: boolean (Master toggle)
 * │   ├── deliveryTime: string (HH:mm in user timezone, default "08:00")
 * │   └── timezone: string (IANA identifier, e.g. "Asia/Kolkata")
 * ├── 3. Granular Content Toggles (contentPreferences)
 * │   ├── spendingSummary (7-day cash outflow)
 * │   ├── budgetAlerts (warning/exceeded limits)
 * │   ├── upcomingBills (next 7 days)
 * │   ├── financialTips (educational tips)
 * │   ├── portfolioNews (investment highlights)
 * │   ├── weeklyHealthScore (financial health trend)
 * │   └── actionableRecommendations (AI action plan)
 * └── 4. Security & Audit
 *     ├── unsubscribeToken: string (UUID for 1-click unsubscribe)
 *     └── lastSentAt: Date (Tracks delivery timestamps)
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +-------------------------------------------------------------+
 *   |                   Client Settings UI                        |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |  NewsletterPreferenceModel.findOneAndUpdate(                |
 *   |    { orgId, userId }, { $set: preferences }, { upsert: true }|
 *   |  )                                                          |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   | Polled by NewsletterScheduler -> Executed by Service        |
 *   +-------------------------------------------------------------+
 * ```
 *
 * @module models/newsletterPreferenceModel
 */

import { Schema, model, Document, Types } from "mongoose";
import crypto from "crypto";

// Defines user delivery preferences and content configuration for recurring newsletters.
// Captures delivery schedule timing, timezone info, unsubscribe tokens, and topical flags.
// Enables personalized digest assembly for financial tips, summaries, and action plans.
export interface INewsletterPreference {
  userId: Types.ObjectId;
  orgId: Types.ObjectId;
  isSubscribed: boolean;
  deliveryTime: string;
  timezone: string;
  contentPreferences: {
    spendingSummary: boolean;
    budgetAlerts: boolean;
    upcomingBills: boolean;
    financialTips: boolean;
    portfolioNews: boolean;
    weeklyHealthScore: boolean;
    actionableRecommendations: boolean;
  };
  lastSentAt?: Date;
  unsubscribeToken: string;
  createdAt: Date;
  updatedAt: Date;
}

// Combines newsletter preference properties with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent preference document returned by user profile settings queries.
export interface INewsletterPreferenceDocument extends INewsletterPreference, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema for the newsletter preference collection.
// Enforces default delivery schedules, automated UUID unsubscribe token generation, and flags.
// Automatically manages document creation and modification timestamps on all write operations.
const newsletterPreferenceSchema = new Schema<INewsletterPreferenceDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    isSubscribed: { type: Boolean, default: true },
    deliveryTime: { type: String, default: "07:00" },
    timezone: { type: String, default: "Asia/Kolkata" },
    contentPreferences: {
      spendingSummary: { type: Boolean, default: true },
      budgetAlerts: { type: Boolean, default: true },
      upcomingBills: { type: Boolean, default: true },
      financialTips: { type: Boolean, default: true },
      portfolioNews: { type: Boolean, default: true },
      weeklyHealthScore: { type: Boolean, default: true },
      actionableRecommendations: { type: Boolean, default: true },
    },
    lastSentAt: { type: Date },
    unsubscribeToken: {
      type: String,
      unique: true,
      default: () => crypto.randomUUID(),
    },
  },
  { timestamps: true }
);

// Enforces a compound unique index on organization and user identifiers.
// Guarantees each user has exactly one newsletter configuration per organization tenant.
// Optimizes lookup efficiency when the scheduler dispatches daily morning newsletters.
newsletterPreferenceSchema.index({ orgId: 1, userId: 1 }, { unique: true });

// Compiles and exports the Mongoose model for newsletter user delivery settings.
// Exposes data access methods to query, update, or unsubscribe user newsletter channels.
// Consumed by automated background cron workers and user profile management endpoints.
const NewsletterPreferenceModel = model<INewsletterPreferenceDocument>(
  "NewsletterPreference",
  newsletterPreferenceSchema
);

export default NewsletterPreferenceModel;

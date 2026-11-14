import { Schema, model, Document, Types } from "mongoose";
import { orgScopePlugin } from "../utils/orgScopePlugin";

// Defines the categorization of domains eligible for personalized follow-through recommendations.
// Encompasses tasks, goals, budgets, reminders, recurring items, debts, and connected accounts.
export type FollowThroughDomain = "task" | "goal" | "budget" | "reminder" | "recurring" | "debt" | "account";

// Represents the explicit action taken by a user in response to a recommendation signal.
// Supports upvoting for positive reinforcement, dismissal, or marking the suggestion complete.
export type FollowThroughAction = "upvote" | "dismiss" | "complete";

// Interface defining the schema of an individual feedback event recorded against a recommendation.
// Captures the target signal, affected domain, user decision, timestamp, and optional rationale.
export interface IFollowThroughFeedbackEvent {
  signalId: string;
  domain: FollowThroughDomain;
  action: FollowThroughAction;
  reason?: string;
  createdAt: Date;
}

// Interface representing user-level behavioral preferences steering recommendation generation.
// Tracks organization and user scopes, domain weighting factors, cadence, and feedback history.
export interface IFollowThroughPreference {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  focusDomains: Record<string, number>;
  riskTolerance: "conservative" | "moderate" | "aggressive";
  preferredCadence: "daily" | "weekly" | "biweekly";
  feedbackHistory: IFollowThroughFeedbackEvent[];
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose document interface combining IFollowThroughPreference with standard Mongoose attributes.
// Provides strong typing for database operations and query result hydration.
export interface IFollowThroughPreferenceDocument extends IFollowThroughPreference, Document {
  _id: Types.ObjectId;
}

// Subdocument Mongoose schema for embedding granular feedback history items within preference records.
// Disables automatic subdocument identifier generation to optimize document storage.
const feedbackEventSchema = new Schema<IFollowThroughFeedbackEvent>(
  {
    signalId: { type: String, required: true },
    domain: {
      type: String,
      enum: ["task", "goal", "budget", "reminder", "recurring", "debt", "account"],
      required: true,
    },
    action: {
      type: String,
      enum: ["upvote", "dismiss", "complete"],
      required: true,
    },
    reason: { type: String, required: false },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

// Mongoose schema definition for user follow-through preference profiles and domain multipliers.
// Configures automatic timestamps, default weight mappings, and tenant isolation indexes.
const followThroughPreferenceSchema = new Schema<IFollowThroughPreferenceDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    focusDomains: {
      type: Map,
      of: Number,
      default: () => ({
        debt: 1.0,
        budget: 1.0,
        goal: 1.0,
        task: 1.0,
        reminder: 1.0,
      }),
    },
    riskTolerance: {
      type: String,
      enum: ["conservative", "moderate", "aggressive"],
      default: "moderate",
    },
    preferredCadence: {
      type: String,
      enum: ["daily", "weekly", "biweekly"],
      default: "weekly",
    },
    feedbackHistory: {
      type: [feedbackEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique per-user preference within org
followThroughPreferenceSchema.index({ orgId: 1, userId: 1 }, { unique: true });

// Mongoose model instance providing CRUD interface for user follow-through preference records.
// Enforces a compound unique index ensuring one preference document per user per organization.
// Tenant guard: unscoped reads/writes throw when ORG_SCOPE_ENFORCE / production (see utils/orgScopePlugin).
followThroughPreferenceSchema.plugin(orgScopePlugin, { guardWrites: true });

export const FollowThroughPreferenceModel = model<IFollowThroughPreferenceDocument>(
  "FollowThroughPreference",
  followThroughPreferenceSchema
);

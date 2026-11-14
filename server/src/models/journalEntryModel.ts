import { Schema, model, Document, Types } from "mongoose";

// Defines confidence scoring metrics for handwritten or scanned journal text recognition.
// Captures overall text recognition confidence alongside line-by-line granular scores.
// Enables downstream AI agents to evaluate whether OCR output meets processing thresholds.
export type JournalConfidence = {
  overall?: number;
  lines?: Array<{ text: string; confidence: number }>;
};

// Defines the structured financial semantics extracted from freeform journal notes.
// Identifies parsed amounts, percentage values, dates, goal candidates, and budget shifts.
// Feeds extracted insights directly into financial planning and transaction engines.
export type JournalParsedIntent = {
  amounts?: Array<{ value: number; currency?: string; raw?: string }>;
  percentages?: number[];
  dates?: string[];
  goal_candidates?: Array<{ name: string; target?: number; currency?: string }>;
  budget_adjustments?: Array<{ description: string; amount?: number; currency?: string }>;
};

// Represents the emotional or psychological tone detected in user journal entries.
// Categorizes sentiments into optimistic, concerned, neutral, or urgent states.
// Used by AI advisory models to adapt tone and contextualize financial guidance.
export type JournalSentiment = "optimistic" | "concerned" | "neutral" | "urgent";

// Defines the attributes of a user financial journal entry document.
// Holds handwriting strokes, OCR transcriptions, vector embeddings, and intent data.
// Links unstructured journaling reflections directly to tenant financial profiles.
export interface IJournalEntry {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  fileId?: Types.ObjectId;
  clientDraftId?: string;
  title?: string;
  tags?: string[];
  embedding?: number[];
  sentiment?: JournalSentiment;
  strokes?: unknown;
  recognizedText: string;
  confidence: JournalConfidence;
  parsedIntent: JournalParsedIntent;
  createdAt: Date;
  updatedAt: Date;
}

// Combines the journal entry properties with Mongoose Document functionality.
// Provides document lifecycle hooks, primary key typing, and ODM query capabilities.
// Represents the strongly-typed document returned by database journal searches.
export interface IJournalEntryDocument extends IJournalEntry, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the financial journal entry collection.
// Enforces validation rules on sentiment enums, string tags, and vector embeddings.
// Automatically records document creation and modification timestamps on all writes.
const journalEntrySchema = new Schema<IJournalEntryDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileId: { type: Schema.Types.ObjectId, required: false, index: true },
    clientDraftId: { type: String, required: false, trim: true },
    title: { type: String, required: false, default: "" },
    tags: { type: [String], default: [] },
    embedding: { type: [Number], default: [] },
    sentiment: {
      type: String,
      enum: ["optimistic", "concerned", "neutral", "urgent"],
      default: "neutral",
    },
    strokes: { type: Schema.Types.Mixed, required: false },
    recognizedText: { type: String, required: false, default: "" },
    confidence: { type: Schema.Types.Mixed, required: true, default: {} },
    parsedIntent: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { timestamps: true }
);

// Configures compound database indexes for chronological queries and draft deduplication.
// Uses a partial filter index on clientDraftId to prevent offline duplicate submissions.
// Indexes tags to provide accelerated thematic filtering across user journal entries.
journalEntrySchema.index({ orgId: 1, userId: 1, createdAt: -1 });
// Offline drafts are deduplicated by clientDraftId. A *sparse* compound index does
// not skip entries without a draft id (orgId/userId are always present), so it
// would allow only one recognized handwriting entry per user. Restrict uniqueness
// to documents that actually carry a draft id.
journalEntrySchema.index({ orgId: 1, userId: 1, clientDraftId: 1 }, {
  name: "org_user_client_draft_unique",
  unique: true,
  partialFilterExpression: { clientDraftId: { $type: "string" } },
});
journalEntrySchema.index({ orgId: 1, userId: 1, tags: 1 });

// Compiles and exports the Mongoose model for financial journal records.
// Provides ODM query interfaces for saving handwriting notes and querying OCR insights.
// Serves as the persistence layer for the interactive financial journal module.
const JournalEntryModel = model<IJournalEntryDocument>("JournalEntry", journalEntrySchema);
export default JournalEntryModel;

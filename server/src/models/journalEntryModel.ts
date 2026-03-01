import { Schema, model, Document, Types } from "mongoose";

export type JournalConfidence = {
  overall?: number;
  lines?: Array<{ text: string; confidence: number }>;
};

export type JournalParsedIntent = {
  amounts?: Array<{ value: number; currency?: string; raw?: string }>;
  percentages?: number[];
  dates?: string[];
  goal_candidates?: Array<{ name: string; target?: number; currency?: string }>;
  budget_adjustments?: Array<{ description: string; amount?: number; currency?: string }>;
};

export interface IJournalEntry {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  fileId: Types.ObjectId;
  strokes?: unknown;
  recognizedText: string;
  confidence: JournalConfidence;
  parsedIntent: JournalParsedIntent;
  createdAt: Date;
  updatedAt: Date;
}

export interface IJournalEntryDocument extends IJournalEntry, Document {
  _id: Types.ObjectId;
}

const journalEntrySchema = new Schema<IJournalEntryDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileId: { type: Schema.Types.ObjectId, required: true, index: true },
    strokes: { type: Schema.Types.Mixed, required: false },
    recognizedText: { type: String, required: false, default: "" },
    confidence: { type: Schema.Types.Mixed, required: true, default: {} },
    parsedIntent: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { timestamps: true }
);

journalEntrySchema.index({ orgId: 1, userId: 1, createdAt: -1 });

const JournalEntryModel = model<IJournalEntryDocument>("JournalEntry", journalEntrySchema);
export default JournalEntryModel;

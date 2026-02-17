import type { Types } from "mongoose";
import JournalEntryModel from "../models/journalEntryModel";

export const getJournalContextForAi = async (params: {
  userId: Types.ObjectId;
  maxEntries?: number;
  maxCharsPerEntry?: number;
  maxAgeDays?: number;
}): Promise<{ summary: string; updatedAt?: string }> => {
  const maxEntries = params.maxEntries ?? 3;
  const maxCharsPerEntry = params.maxCharsPerEntry ?? 500;
  const maxAgeDays = params.maxAgeDays ?? 30;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const docs = await JournalEntryModel.find({
    userId: params.userId,
    createdAt: { $gte: cutoff },
    recognizedText: { $exists: true, $ne: "" },
  })
    .sort({ updatedAt: -1 })
    .limit(maxEntries)
    .select({ recognizedText: 1, updatedAt: 1, createdAt: 1 })
    .lean();

  if (!docs.length) {
    return { summary: "", updatedAt: undefined };
  }

  const latestAt: Date | undefined = (docs[0] as any).updatedAt || (docs[0] as any).createdAt;
  const updatedAt = latestAt ? new Date(latestAt).toISOString() : undefined;

  const notes = docs
    .map(doc => String((doc as any).recognizedText || "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map(text => (text.length > maxCharsPerEntry ? `${text.slice(0, maxCharsPerEntry)}…` : text));

  if (!notes.length) {
    return { summary: "", updatedAt };
  }

  const summary =
    "Recent handwritten journal notes (may include goals, budgets, and amounts):\n" +
    notes.map(note => `- ${note}`).join("\n");

  return { summary, updatedAt };
};


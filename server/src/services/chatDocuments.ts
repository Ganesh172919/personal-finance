import mongoose from "mongoose";
import WorkspaceFileModel from "../models/workspaceFileModel";
import { renderPdfFromTextRequest } from "./pdfRequestServer";
import { deleteGridFsFile, openGridFsDownloadStream } from "./gridfs";
import { extractWorkspaceFileText, type ExtractedWorkspaceContent } from "./fileTextExtraction";
import { ensureWorkspaceFileChunks } from "./retrievalService";
import { logger } from "../config/logger";
import FinancialProfileModel from "../models/financialProfileModel";
import TaskModel from "../models/taskModel";

/** Explicit creation intent is checked by the caller before reading saved data. */
export async function buildSavedActivityDocument(params: {
  orgId: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; request: string; currency: string;
}): Promise<string | null> {
  if (!/\b(?:my|saved)\b[\s\S]*\b(?:goals?|tasks?|finances|financial activity|budget)\b/i.test(params.request)) return null;
  const includeFinances = /\b(?:finances|financial activity|budget)\b/i.test(params.request);
  const includeGoals = includeFinances || /\bgoals?\b/i.test(params.request);
  const includeTasks = includeFinances || /\btasks?\b/i.test(params.request);
  const [profile, tasks] = await Promise.all([
    includeGoals || includeFinances ? FinancialProfileModel.findOne({ orgId: params.orgId, userId: params.userId }).lean() : null,
    includeTasks ? TaskModel.find({ orgId: params.orgId, userId: params.userId, status: "open" })
      .sort({ dueDate: 1, updatedAt: -1 }).limit(8).lean() : [],
  ]);
  const literal = (value: unknown) => String(value || "").replace(/[\r\n\f#]/g, " ").trim().slice(0, 240);
  const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${params.currency} ${value.toFixed(2)}` : "Not saved";
  const lines = ["# Saved platform activity", `Snapshot: ${new Date().toISOString().slice(0, 10)} (UTC).`,
    "Source: your saved records in the current workspace. This is a bounded snapshot, not a complete activity history."];
  if (includeFinances) lines.push("# Profile figures", `Annual income: ${money(profile?.annual_income)}`,
    `Monthly expenses: ${money(profile?.monthly_expenses)}`, `Savings: ${money(profile?.savings)}`);
  if (includeGoals) {
    const goals = (profile?.goals || []).slice(0, 20);
    lines.push("# Saved goals", ...(goals.length ? goals.map(goal =>
      `- ${literal(goal.name)}: ${money(goal.current)} saved toward ${money(goal.target)}. Deadline: ${literal(goal.deadline) || "Not saved"}.`
    ) : ["No saved goals are available."]));
  }
  if (includeTasks) lines.push("# Open tasks", ...(tasks.length ? tasks.map(task =>
    `- ${literal(task.title)} (${task.priority} priority). Due: ${task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "Not saved"}. ${literal(task.why)}`
  ) : ["No open tasks are available."]));
  lines.push("# Review", "Review the source records before sharing. Completed tasks are excluded. No transactions or transfers were made.");
  return lines.join("\n").replace(/\n(?=# )/g, "\n\n");
}

/** Only an explicit creation request in the user's message can write a file. */
export function parseChatDocumentRequest(message: string): { title: string; content: string } | null {
  const normalized = message.trim();
  const bodyStart = /(?:^|\n|\s)Content\s*:/i.exec(normalized);
  const instruction = bodyStart ? normalized.slice(0, bodyStart.index).trim() : normalized;
  if (!/^(?:(?:please|can you|could you|would you)\s+)?(?:create|generate|make|write|draft)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:pdf\s+document|pdf|document|report)\b/i.test(instruction)) return null;
  if (/\b(?:docx|word document|spreadsheet|xlsx)\b/i.test(instruction)) return null;
  const rawTitle = /\b(?:titled|named|called)\s+(.+)/i.exec(instruction)?.[1] || "Chat document";
  const title = rawTitle.replace(/[.!?]\s+.*$/s, "").replace(/^["']+|["'.!?]+$/g, "").replace(/[\r\n<>\[\]`*_]/g, " ").trim().slice(0, 120) || "Chat document";
  return { title, content: bodyStart ? normalized.slice(bodyStart.index + bodyStart[0].length).trim() : "" };
}

export async function createChatDocument(params: {
  orgId: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; requestId: string;
  title: string; content: string;
}) {
  const artifact = await renderPdfFromTextRequest({
    ...params, promptText: params.content, filenameStem: params.title, includeRequestMetadata: false,
  });
  const fallbackText = params.content.replace(/\f/g, "\n");
  let extracted: ExtractedWorkspaceContent = {
    text: fallbackText, preview: fallbackText.slice(0, 800), extractionMethod: "chat_text",
    warnings: ["Created from the text supplied in chat. Physical PDF page locations could not be verified."],
  };
  try {
    const stream = openGridFsDownloadStream(artifact.fileId.toString());
    const buffers: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) throw new Error("Generated PDF exceeds extraction limit");
      buffers.push(Buffer.from(chunk));
    }
    const parsed = await extractWorkspaceFileText({
      buffer: Buffer.concat(buffers), mimeType: artifact.contentType, fileName: artifact.filename,
      requestId: params.requestId, userId: params.userId.toString(),
    });
    if (parsed.text.trim()) extracted = parsed;
  } catch {
    // Keep the created file usable when page extraction is temporarily unavailable.
    logger.warn({ requestId: params.requestId }, "Generated PDF saved; physical page verification unavailable");
  }
  let file;
  try {
    file = await WorkspaceFileModel.create({
      orgId: params.orgId, userId: params.userId, fileId: artifact.fileId,
      originalName: artifact.filename, mimeType: artifact.contentType, sizeBytes: artifact.bytes,
      extension: "pdf", kind: "document", status: "processed",
      extractedText: extracted.text, extractedPreview: extracted.preview,
      extractedPageCount: extracted.pageCount, extractionWarnings: extracted.warnings,
    });
  } catch (error) {
    await deleteGridFsFile(artifact.fileId.toString()).catch(() => undefined);
    throw error;
  }
  // A temporary indexing failure must not turn a saved file into a failed
  // creation. Grounding's existing on-demand backfill can repair it later.
  await ensureWorkspaceFileChunks({
    orgId: params.orgId, userId: params.userId, workspaceFileId: file._id,
    fileId: artifact.fileId, originalName: artifact.filename, sourceKind: "document", extractedText: extracted.text, pageCount: extracted.pageCount,
  }).catch(() => logger.warn({ requestId: params.requestId }, "Chat document saved; retrieval indexing will retry on demand"));
  return { workspaceFileId: file._id.toString(), fileId: artifact.fileId.toString(), title: params.title, filename: artifact.filename, mimeType: artifact.contentType, sizeBytes: artifact.bytes };
}

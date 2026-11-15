import mongoose from "mongoose";
import WorkspaceFileModel from "../models/workspaceFileModel";
import { renderRichAuthoredPdf, type AuthoredDocumentFormat, type DocumentKPI, type DocumentTable, type DocumentCallout } from "./richDocumentRenderer";
import { deleteGridFsFile, uploadBufferToGridFs } from "./gridfs";
import { ensureWorkspaceFileChunks } from "./retrievalService";
import { logger } from "../config/logger";
import FinancialProfileModel from "../models/financialProfileModel";
import TaskModel from "../models/taskModel";

/** Explicit creation intent is checked by the caller before reading saved data. */
// Assembles a bounded markdown snapshot document summarizing user financial activity.
// Extracts active financial profile metrics, open goals, and upcoming scheduled tasks.
// Returns a sanitized markdown string or null if the prompt lacked activity intent.
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
// Parses natural language chat prompts to detect explicit document generation intent.
// Extracts document title, body markdown content, and specialized formatting layouts.
// Returns normalized title and format metadata or null if no valid request was identified.
export type ChatDocumentDraft = { title: string; content: string; kind?: "text"; format?: AuthoredDocumentFormat };

export function parseChatDocumentRequest(message: string): ChatDocumentDraft | null {
  const normalized = message.trim();
  const bodyStart = /(?:^|\s)(?:content|with (?:these tasks|the following text|the following content))\s*:/i.exec(normalized);
  const instruction = bodyStart ? normalized.slice(0, bodyStart.index).trim() : normalized;
  const command = /^(?:(?:please|can you|could you|would you)\s+)?(?:create|generate|make|write|draft)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(text\s+file|txt\s+file|pdf\s+document|pdf|document|report)\b/i.exec(instruction);
  if (!command) return null;
  if (/\b(?:docx|word document|spreadsheet|xlsx)\b/i.test(instruction)) return null;

  let format: AuthoredDocumentFormat = "standard";
  const flagMatch = /--format=([a-z_]+)/i.exec(instruction);
  if (flagMatch) {
    const rawFmt = flagMatch[1].toLowerCase();
    if (["executive_brief", "tax_prep_summary", "cash_flow_audit", "debt_payoff_schedule", "net_worth_statement", "standard"].includes(rawFmt)) {
      format = rawFmt as AuthoredDocumentFormat;
    }
  } else if (/\b(?:executive brief|executive advisory|executive summary)\b/i.test(instruction)) {
    format = "executive_brief";
  } else if (/\b(?:tax prep|tax preparation|tax summary|deduction audit)\b/i.test(instruction)) {
    format = "tax_prep_summary";
  } else if (/\b(?:cash flow|burn audit|spending velocity)\b/i.test(instruction)) {
    format = "cash_flow_audit";
  } else if (/\b(?:debt payoff|debt amortization|debt schedule|avalanche)\b/i.test(instruction)) {
    format = "debt_payoff_schedule";
  } else if (/\b(?:net worth|balance sheet|consolidated assets)\b/i.test(instruction)) {
    format = "net_worth_statement";
  }

  const titleInstruction = /\b(?:titled|named|called)\s+(.+)/i.exec(instruction)?.[1]
    || /\b(?:about|on)\s+([^\n.!?]+)/i.exec(instruction.slice(command[0].length))?.[1] || "Chat document";
  // A quoted title ends at its matching quote, not at the next sentence.
  // Keep subsequent instructions out of the saved file name and heading.
  const quotedTitle = /^(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’)/.exec(titleInstruction);
  const rawTitle = quotedTitle ? quotedTitle.slice(1).find((part) => part !== undefined)! : titleInstruction;
  const title = (quotedTitle ? rawTitle : rawTitle.replace(/[.!?]\s+.*$/s, ""))
    .replace(/--format=\S+/g, "").replace(/^["']+|["'.!?]+$/g, "").replace(/[\r\n<>\[\]`*_]/g, " ").trim().slice(0, 120) || "Chat document";
  const content = bodyStart ? normalized.slice(bodyStart.index + bodyStart[0].length).trim() : "";
  if (/^(?:text|txt)\b/i.test(command[1])) return { title, content, kind: "text" };
  return format === "standard" ? { title, content } : { title, content, format };
}

export function chatTextFilename(title: string): string {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "chat_document"}.txt`;
}

// Delegates rich authored PDF generation to the specialized document renderer engine.
// Combines title, structured body markdown, KPIs, data tables, and advisory callouts.
// Persists the resulting PDF to workspace files and returns document metadata.
export async function createChatDocument(params: {
  orgId: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; requestId: string;
  title: string; content: string;
  kind?: ChatDocumentDraft["kind"];
  format?: AuthoredDocumentFormat;
  kpis?: DocumentKPI[];
  tables?: DocumentTable[];
  callouts?: DocumentCallout[];
}) {
  if (params.kind === "text") {
    const { orgId, userId, content, title } = params;
    const filename = chatTextFilename(title);
    const mimeType = "text/plain";
    const buffer = Buffer.from(content, "utf8");
    const fileId = await uploadBufferToGridFs({ userId: userId.toString(), orgId: orgId.toString(),
      purpose: "export", buffer, filename, contentType: mimeType });
    const file = await WorkspaceFileModel.create({ orgId, userId, fileId, originalName: filename,
      mimeType, sizeBytes: buffer.length, extension: "txt", kind: "document", status: "processed",
      extractedText: content, extractedPreview: content.slice(0, 800) }).catch(async error => {
      await deleteGridFsFile(fileId.toString()).catch(() => undefined);
      throw error;
    });
    await ensureWorkspaceFileChunks({ orgId, userId, workspaceFileId: file._id, fileId, originalName: filename,
      sourceKind: "document", extractedText: content }).catch(error => {
      logger.warn({ requestId: params.requestId, err: error }, "Chat text file saved; indexing will retry on demand");
    });
    return { workspaceFileId: file._id.toString(), fileId: fileId.toString(), title, filename, mimeType, sizeBytes: buffer.length };
  }
  return renderRichAuthoredPdf({
    orgId: params.orgId,
    userId: params.userId,
    requestId: params.requestId,
    title: params.title,
    format: params.format || "standard",
    content: params.content,
    kpis: params.kpis,
    tables: params.tables,
    callouts: params.callouts,
  });
}

/**
 * @fileoverview Finance Grounding Service
 *
 * Builds a comprehensive "grounding context" for AI requests by gathering
 * the user's financial data from multiple sources. This context is injected
 * into the AI prompt so the LLM has real data to reason about.
 *
 * WHAT IS "GROUNDING"?
 * Grounding means providing the AI with actual user data (transactions,
 * budgets, goals, tasks, files, memories) so it can give personalized
 * answers instead of generic financial advice.
 *
 * DATA SOURCES:
 * 1. Account balances and budgets
 * 2. Recent transactions
 * 3. Budget envelopes
 * 4. Recurring transaction candidates
 * 5. Active tasks
 * 6. Calendar reminders
 * 7. Workspace files & RAG knowledge chunks
 * 8. Memory records (user facts from past conversations)
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * FinanceGrounding Engine
 * ├── 1. Request Identity & Multi-Tenant Scope
 * │   ├── orgId & userId isolation
 * │   ├── Timeframe & Period Key (YYYY-MM)
 * │   └── User Query string
 * ├── 2. Parallel Core Financial Extraction
 * │   ├── AccountModel: Balances, accounts, assets
 * │   ├── BudgetEnvelopes: Allocations vs actual spend
 * │   ├── TransactionService: Recent transactions (30-90 days)
 * │   ├── RecurringCandidates: Detected recurring subscriptions
 * │   ├── TaskModel: Active user financial todos
 * │   └── CalendarReminderModel: Scheduled bill reminders
 * ├── 3. Memory & Personal Context
 * │   └── MemoryRecordModel: Extracted facts, financial goals, constraints
 * ├── 4. RAG Document Grounding (retrievalService)
 * │   ├── ensureWorkspaceFileChunks (on-demand backfill)
 * │   ├── retrieveRelevantWorkspaceChunks (lexical search)
 * │   └── File snippets and source citation formation
 * └── 5. Grounding Context Packaging
 *     ├── finance_context dictionary for AI Core
 *     ├── evidence items list with citations & confidence scores
 *     └── Token-budget management and clipping
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +-------------------------------------------------------------+
 *   |         Incoming AI Prompt / Chat Query Request             |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |       Parallel Data Fetching via Promise.allSettled         |
 *   +------------------------------+------------------------------+
 *          |          |          |          |          |
 *          v          v          v          v          v
 *     [Accounts]  [Envelopes] [Tasks]   [Reminders] [Memories]
 *          |          |          |          |          |
 *          +----------+----------+----------+----------+
 *                                |
 *                                v
 *   +-------------------------------------------------------------+
 *   |              RAG Document Retrieval Pipeline                |
 *   |  - Check on-demand chunk backfill for workspace files       |
 *   |  - retrieveRelevantWorkspaceChunks(query, limit)            |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |               Evidence Synthesis & Formatting               |
 *   |  - Wrap structured data into Evidence Items                 |
 *   |  - Attach file source citations and page numbers            |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   | Output: GroundingContext injected into AI Core Request      |
 *   +-------------------------------------------------------------+
 * ```
 *
 * EVIDENCE ITEMS:
 * Each piece of data is wrapped as an "evidence item" with a label and
 * snippet. These are attached to the AI response so users can verify
 * what data the AI used for its analysis.
 *
 * @module services/financeGrounding
 */

import mongoose from "mongoose";

import { logger } from "../config/logger";
import AccountModel from "../models/accountModel";
import CalendarReminderModel from "../models/calendarReminderModel";
import MemoryRecordModel from "../models/memoryRecordModel";
import TaskModel from "../models/taskModel";
import WorkspaceFileModel from "../models/workspaceFileModel";
import { detectRecurringCandidates, getBudgetEnvelopes } from "./financeIntelligence";
import { ensureWorkspaceFileChunks, retrieveRelevantWorkspaceChunks } from "./retrievalService";

/** Generate the current period key (YYYY-MM format) */
const currentPeriodKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const isoDate = (value?: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export type AiEvidenceItem = {
  id: string;
  type: "transaction_scope" | "budget" | "recurring" | "task" | "reminder" | "file" | "memory" | "retrieval_chunk";
  label: string;
  snippet: string;
  entity_id?: string;
  page_number?: number;
};

export const buildAiFinanceGrounding = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  selectedWorkspaceFileIds?: string[];
  retrievalQuery?: string;
}) => {
  const periodKey = currentPeriodKey();
  const next14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const selectedFileObjectIds = (params.selectedWorkspaceFileIds || [])
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));

  const [accounts, tasks, reminders, memoryRows, workspaceFiles, recurringCandidates, budgetResult] = await Promise.all([
    AccountModel.find({ orgId: params.orgId, status: "active" })
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean(),
    TaskModel.find({ orgId: params.orgId, userId: params.userId, status: "open" })
      .sort({ dueDate: 1, updatedAt: -1 })
      .limit(8)
      .lean(),
    CalendarReminderModel.find({
      orgId: params.orgId,
      userId: params.userId,
      completed: false,
      date: {
        $gte: new Date().toISOString().slice(0, 10),
        $lte: next14Days.toISOString().slice(0, 10),
      },
    })
      .sort({ date: 1 })
      .limit(8)
      .lean(),
    MemoryRecordModel.find({ orgId: params.orgId, userId: params.userId })
      .sort({ updatedAt: -1, confidence: -1 })
      .limit(8)
      .lean(),
    WorkspaceFileModel.find({
      orgId: params.orgId,
      userId: params.userId,
      ...(params.selectedWorkspaceFileIds?.length ? { _id: { $in: selectedFileObjectIds } } : {}),
    })
      .sort({ updatedAt: -1 })
      .limit(selectedFileObjectIds.length ? selectedFileObjectIds.length : 5)
      .lean(),
    detectRecurringCandidates({ orgId: params.orgId, daysBack: 365, limit: 5, minOccurrences: 3 }).catch(() => ({
      org_id: params.orgId.toString(),
      days_back: 365,
      candidates: [],
    })),
    getBudgetEnvelopes({ orgId: params.orgId, periodKey }).catch(() => null),
  ]);

  // Repair older uploads and failed indexing before retrieval. This is bounded
  // by the file query above and also refreshes chunks after text reprocessing.
  if (params.retrievalQuery) {
    await Promise.all(workspaceFiles.map((file) => ensureWorkspaceFileChunks({
      orgId: params.orgId,
      userId: params.userId,
      workspaceFileId: file._id,
      fileId: file.fileId,
      originalName: file.originalName,
      sourceKind: file.kind,
      extractedText: file.extractedText || "",
      pageCount: file.extractedPageCount,
    }).catch((error) => {
      logger.warn({ error, workspaceFileId: file._id }, "Workspace file retrieval indexing failed");
    })));
  }

  const retrievedChunks = params.retrievalQuery
    ? await retrieveRelevantWorkspaceChunks({
        orgId: params.orgId,
        userId: params.userId,
        query: params.retrievalQuery,
        selectedWorkspaceFileIds: params.selectedWorkspaceFileIds,
        limit: 4,
      }).catch(() => [])
    : [];

  const evidence: AiEvidenceItem[] = [];

  if (budgetResult) {
    evidence.push({
      id: `budget:${periodKey}`,
      type: "budget",
      label: `Budget envelope snapshot for ${periodKey}`,
      snippet: `Planned ${budgetResult.totals.planned}, spent ${budgetResult.totals.spent}, remaining ${budgetResult.totals.remaining}.`,
    });
  }

  evidence.push({
    id: "transactions:scope",
    type: "transaction_scope",
    label: "Recent transaction grounding",
    snippet: "Recent transaction history is available to the assistant for cash flow and spending analysis.",
  });

  recurringCandidates.candidates.slice(0, 3).forEach((candidate) => {
    evidence.push({
      id: `recurring:${candidate.candidate_id}`,
      type: "recurring",
      label: candidate.description_sample || candidate.merchant_name || "Recurring candidate",
      snippet: `${candidate.occurrences} occurrences with ${candidate.confidence.toFixed(2)} confidence.`,
      entity_id: candidate.candidate_id,
    });
  });

  tasks.slice(0, 3).forEach((task) => {
    evidence.push({
      id: `task:${task._id}`,
      type: "task",
      label: task.title,
      snippet: task.why,
      entity_id: String(task._id),
    });
  });

  reminders.slice(0, 3).forEach((reminder) => {
    evidence.push({
      id: `reminder:${reminder._id}`,
      type: "reminder",
      label: reminder.title,
      snippet: `${reminder.date}${reminder.description ? ` • ${reminder.description}` : ""}`,
      entity_id: String(reminder._id),
    });
  });

  workspaceFiles.slice(0, 3).forEach((file) => {
    evidence.push({
      id: `file:${file._id}`,
      type: "file",
      label: file.originalName,
      snippet: String(file.analysis?.summary || file.extractedPreview || file.extractedText || "File available as evidence.").slice(0, 180),
      entity_id: String(file._id),
    });
  });

  memoryRows.slice(0, 3).forEach((memory) => {
    evidence.push({
      id: `memory:${memory._id}`,
      type: "memory",
      label: memory.key,
      snippet: memory.value,
      entity_id: String(memory._id),
    });
  });

  retrievedChunks.forEach((chunk) => {
    evidence.push({
      id: `retrieval:${chunk.id}`,
      type: "retrieval_chunk",
      label: [
        chunk.metadata?.file_name,
        chunk.sectionTitle || `Passage ${chunk.chunkIndex + 1}`,
        chunk.pageNumber ? `page ${chunk.pageNumber}` : undefined,
      ].filter(Boolean).join(" · "),
      snippet: chunk.snippet,
      entity_id: chunk.workspaceFileId,
      page_number: chunk.pageNumber,
    });
  });

  const sourceCoverage = {
    accounts: accounts.length,
    tasks: tasks.length,
    reminders: reminders.length,
    files: workspaceFiles.length,
    memory_records: memoryRows.length,
    budget_envelopes: budgetResult?.envelopes.length || 0,
    recurring_candidates: recurringCandidates.candidates.length,
    retrieval_chunks: retrievedChunks.length,
  };

  const sourceCount = Object.values(sourceCoverage).filter((count) => count > 0).length;
  const confidenceScore = Math.max(0.2, Math.min(0.95, 0.2 + sourceCount * 0.1));

  return {
    finance_context: {
      period_key: periodKey,
      accounts: accounts.map((account: any) => ({
        id: String(account._id),
        name: String(account.name || ""),
        type: String(account.type || ""),
        currency: String(account.currency || "USD"),
        status: String(account.status || "active"),
        opening_balance: Number(account.openingBalance || 0),
        last_statement_balance:
          account.lastStatementBalance === undefined || account.lastStatementBalance === null
            ? null
            : Number(account.lastStatementBalance),
        last_statement_date: isoDate(account.lastStatementDate),
        last_reconciled_at: isoDate(account.lastReconciledAt),
      })),
      budgets: budgetResult
        ? {
            totals: budgetResult.totals,
            top_envelopes: budgetResult.envelopes.slice(0, 8),
          }
        : null,
      recurring: {
        candidates: recurringCandidates.candidates.slice(0, 8),
      },
      tasks: tasks.map((task) => ({
        id: String(task._id),
        title: task.title,
        why: task.why,
        priority: task.priority,
        due_date: isoDate(task.dueDate),
      })),
      reminders: reminders.map((reminder) => ({
        id: String(reminder._id),
        date: reminder.date,
        title: reminder.title,
        description: reminder.description || "",
      })),
      files: workspaceFiles.map((file) => ({
        id: String(file._id),
        original_name: file.originalName,
        kind: file.kind,
        summary: String(file.analysis?.summary || file.extractedPreview || "").slice(0, 240),
      })),
      memory: memoryRows.map((memory) => ({
        key: memory.key,
        value: memory.value,
        confidence: Number(memory.confidence || 0),
        source: memory.source,
      })),
      retrieval: {
        query: params.retrievalQuery || "",
        top_chunks: retrievedChunks.map((chunk) => ({
          id: chunk.id,
          workspace_file_id: chunk.workspaceFileId,
          file_id: chunk.fileId,
          chunk_index: chunk.chunkIndex,
          section_title: chunk.sectionTitle,
          page_number: chunk.pageNumber,
          source_kind: chunk.sourceKind,
          file_name: chunk.metadata?.file_name,
          score: chunk.score,
          text: chunk.text,
          snippet: chunk.snippet,
        })),
      },
      evidence,
      confidence: {
        score: Number(confidenceScore.toFixed(2)),
        label: confidenceScore >= 0.75 ? "high" : confidenceScore >= 0.45 ? "medium" : "low",
        notes: [
          `${sourceCoverage.accounts} active account sources`,
          `${sourceCoverage.files} supporting file sources`,
          `${sourceCoverage.recurring_candidates} recurring spending signals`,
          `${sourceCoverage.retrieval_chunks} retrieved file chunks`,
        ],
        coverage: sourceCoverage,
      },
    },
    evidence,
    confidence: {
      score: Number(confidenceScore.toFixed(2)),
      label: confidenceScore >= 0.75 ? "high" : confidenceScore >= 0.45 ? "medium" : "low",
      notes: [
        `${sourceCoverage.accounts} active account sources`,
        `${sourceCoverage.files} supporting file sources`,
        `${sourceCoverage.recurring_candidates} recurring spending signals`,
        `${sourceCoverage.retrieval_chunks} retrieved file chunks`,
      ],
      coverage: sourceCoverage,
    },
  };
};

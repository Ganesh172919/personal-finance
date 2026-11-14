/**
 * @fileoverview Workspace File Management API
 *
 * Manages user-uploaded files in the workspace. Supports uploading
 * documents, images, spreadsheets, and other file types, then running
 * AI-powered analysis on them to extract insights, summaries, and
 * actionable plans.
 *
 * Key concepts:
 * - **Workspace Files**: Uploaded files stored server-side with metadata
 *   (name, MIME type, size, kind classification). Files go through an
 *   extraction step to pull out text content and previews.
 * - **File Analysis**: An AI-powered endpoint that analyses file content
 *   and returns a summary, natural-language response, and optionally a
 *   structured plan. Results are cached -- subsequent calls for the same
 *   file return `cache_hit: true`.
 * - **File Kind**: Automatic classification of uploaded files into
 *   categories (document, spreadsheet, image, code, data, archive, other)
 *   based on MIME type and extension.
 * - **Multi-file Upload**: The upload endpoint accepts multiple files in
 *   a single request via FormData.
 *
 * All functions delegate to the shared `apiClient` for consistent
 * authentication, error handling, and organisation context.
 */

import type { IWorkflowTraceEntry } from "@/types";
import type { Plan } from "@/types/ai.types";
import type { EvidenceItem } from "@/types/evidence.types";

import { apiClient } from "./core";

/** Classification of a workspace file by its content type. */
// Categorizes workspace file types into high-level functional classifications.
// Distinguishes documents, spreadsheets, images, source code, and archives.
// Guides file viewer rendering and backend extraction pipeline selection.
export type WorkspaceFileKind =
  | "document"
  | "spreadsheet"
  | "image"
  | "code"
  | "data"
  | "archive"
  | "other";

// Defines processing lifecycle states for user-uploaded workspace documents.
// Tracks files from initial upload receipt through extraction and error states.
// Informs UI loading indicators and file status badges in document tables.
export type WorkspaceFileStatus = "uploaded" | "processed" | "error";

/** AI analysis results attached to a workspace file after processing. */
// Encapsulates AI analysis findings generated from examining workspace file content.
// Holds synthesized summaries, responses, evidence citations, and action plans.
// Provides cached intelligence insights attached directly to document records.
export interface WorkspaceFileAnalysis {
  summary: string;
  response: string;
  plan?: Plan;
  evidence?: EvidenceItem[];
  analysisType?: string;
  agentsInvolved?: string[];
  workflowTrace?: IWorkflowTraceEntry[];
  fallbackUsed?: boolean;
  llmCallCount?: number;
  requestId?: string;
  updatedAt?: string;
}

/** Complete metadata record for a file stored in the workspace. */
// Models complete metadata and extracted content for a workspace document.
// Stores file sizes, MIME types, text previews, page counts, and extraction warnings.
// Serves as the primary entity representing documents across workspace lists.
export interface WorkspaceFileRecord {
  id: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extension?: string;
  kind: WorkspaceFileKind;
  status: WorkspaceFileStatus;
  extractedPreview?: string;
  extractedText?: string;
  extractedPageCount?: number;
  extractionWarnings: string[];
  lastAnalyzedAt?: string;
  analysis?: WorkspaceFileAnalysis;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Upload one or more files to the workspace in a single request.
 * Each file is appended to the FormData under the same "files" key.
 */
// Transmits multiple client files to the workspace upload endpoint via multipart FormData.
// Dispatches batch document creation and initiates background text extraction.
// Returns newly generated file records alongside unique server request identifiers.
export async function uploadWorkspaceFiles(files: File[]): Promise<{
  files: WorkspaceFileRecord[];
  request_id?: string;
}> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));

  return apiClient("/files", {
    method: "POST",
    body: form,
  });
}

/** List workspace files with optional pagination and text search. */
// Queries a paginated list of uploaded workspace files with optional text search.
// Supports keyword filtering across original filenames and extracted content.
// Delivers file inventory arrays alongside total page counts for table views.
export async function listWorkspaceFiles(params: { page?: number; limit?: number; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient<{
    files: WorkspaceFileRecord[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    request_id?: string;
  }>(`/files${suffix}`);
}

/** Fetch a single workspace file record by ID. */
// Retrieves a single workspace file metadata record by unique document ID.
// Returns complete file specifications, extracted text snippets, and prior analyses.
// Populates detailed file preview panes and document inspection sidebars.
export async function getWorkspaceFile(id: string) {
  return apiClient<{ file: WorkspaceFileRecord; request_id?: string }>(`/files/${id}`);
}

/**
 * Run AI analysis on a workspace file. Results are cached server-side;
 * subsequent calls for the same file return `cache_hit: true`.
 * An optional `prompt` can customise what the AI focuses on.
 */
// Triggers AI analytical inspection of an uploaded workspace file's text content.
// Accepts an optional natural language focus prompt to steer analysis priorities.
// Leverages server-side result caching to optimize repeated review queries.
export async function analyzeWorkspaceFile(id: string, prompt?: string) {
  return apiClient<{ file: WorkspaceFileRecord; request_id?: string; cache_hit?: boolean }>(`/files/${id}/analyze`, {
    method: "POST",
    body: JSON.stringify(prompt?.trim() ? { prompt: prompt.trim() } : {}),
  });
}

/** Permanently delete a workspace file and its analysis results. */
// Permanently removes a workspace file record and its extracted analysis data.
// Dispatches an HTTP DELETE request to delete underlying GridFS binary chunks.
// Updates workspace storage limits and removes file items from user lists.
export async function deleteWorkspaceFile(id: string) {
  return apiClient<{ file_id: string; request_id?: string }>(`/files/${id}`, {
    method: "DELETE",
  });
}

// Identifies the structural format modality of an extracted knowledge chunk.
// Distinguishes free-form prose text, tabular sheets, OCR text, and structured data.
// Informs chunk embedding strategies and contextual retrieval scoring weights.
export type ChunkModality = "text" | "table" | "image_ocr" | "structured_data";

// Holds recognized named entities extracted from document text chunks during indexing.
// Identifies extracted merchant brand names, monetary values, dates, and currencies.
// Accelerates entity-specific lookup filters during semantic document retrieval.
export interface ChunkEntities {
  merchants?: string[];
  amounts?: number[];
  dates?: string[];
  currencies?: string[];
}

// Represents an individual document passage retrieved during semantic search.
// Captures similarity scores, grounding confidence metrics, citations, and excerpts.
// Equips client answer generation with verified source references and snippet previews.
export interface RetrievedKnowledgeChunk {
  id: string;
  workspaceFileId: string;
  fileId: string;
  chunkIndex: number;
  text: string;
  snippet: string;
  score: number;
  lexicalScore?: number;
  cosineSimilarity?: number;
  groundingConfidence?: number;
  isGrounded?: boolean;
  citation?: string;
  modality: ChunkModality;
  entities?: ChunkEntities;
  sectionTitle?: string;
  pageNumber?: number;
  sourceKind: string;
  metadata?: Record<string, unknown>;
}

/**
 * Perform hybrid semantic + lexical grounded search over workspace document chunks,
 * receipts, spreadsheets, and tabular data.
 */
// Executes hybrid semantic and lexical retrieval queries across workspace documents.
// Filters across file modalities and enforces minimum grounding confidence thresholds.
// Returns ranked text and table chunks powering context-augmented AI responses.
export async function searchWorkspaceChunks(params: {
  query: string;
  modality?: "all" | ChunkModality;
  selectedWorkspaceFileIds?: string[];
  limit?: number;
  minConfidence?: number;
}) {
  return apiClient<{
    chunks: RetrievedKnowledgeChunk[];
    total: number;
    query: string;
    modality: string;
    request_id?: string;
  }>("/files/search", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Represents an individual cited evidence passage within a Document Q&A answer.
// Pinpoints precise source files, physical PDF page numbers, and snippet text.
// Enables clickable citation links directing readers to exact document locations.
export interface DocumentQAPassage {
  id: string;
  workspaceFileId: string;
  fileId: string;
  fileName: string;
  pageNumber?: number;
  chunkIndex: number;
  modality: ChunkModality;
  text: string;
  snippet: string;
  citation: string;
  confidence: number;
  isGrounded: boolean;
  entities?: ChunkEntities;
}

// Encapsulates the comprehensive response payload for a Document Q&A search query.
// Delivers a grounded natural language answer supported by cited passage evidence.
// Supplies physical page attributions and modality breakdown statistics.
export interface DocumentQAResponse {
  success: boolean;
  question: string;
  groundingScore: number;
  isGrounded: boolean;
  passages: DocumentQAPassage[];
  directAnswer: string;
  physicalPages: number[];
  total: number;
  sourceFilesCount: number;
  modalityBreakdown: Record<string, number>;
  request_id?: string;
}

/**
 * Execute semantic Document Q&A across user-uploaded files, tax forms,
 * statements, and scanned OCR receipts with exact physical page attribution.
 */
// Submits a natural language question to execute Document Q&A across workspace files.
// Analyzes uploaded tax documents, statements, and receipts to synthesize answers.
// Returns verified direct answers backed by cited passages and page references.
export async function queryDocumentQA(params: {
  question: string;
  workspaceFileIds?: string[];
  minConfidence?: number;
  limit?: number;
}) {
  return apiClient<DocumentQAResponse>("/files/qa", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
// Enumerates predefined layout templates available for generating PDF reports.
// Covers standard reports, executive briefs, tax prep summaries, and audit sheets.
// Guides backend rendering engines when applying typography and visual styles.
export type AuthoredDocumentFormat =
  | "standard"
  | "executive_brief"
  | "tax_prep_summary"
  | "cash_flow_audit"
  | "debt_payoff_schedule"
  | "net_worth_statement";

// Models a highlighted Key Performance Indicator card displayed within generated PDFs.
// Defines metric title labels, primary numeric values, and descriptive subtext.
// Renders prominent metric summary boxes atop generated financial summaries.
export interface DocumentKPI {
  label: string;
  value: string;
  subtext?: string;
}

// Outlines tabular data structures formatted for inclusion inside authored PDF documents.
// Specifies column header titles, optional section titles, and 2D row cell values.
// Feeds multi-column table generation components within document authoring pipelines.
export interface DocumentTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

// Defines highlighted callout message blocks rendered within custom PDF exports.
// Supports informational notes, alert warnings, and positive success indicators.
// Accentuates critical financial advice, caveats, and disclaimers in generated docs.
export interface DocumentCallout {
  type?: "note" | "warning" | "success";
  text: string;
}

// Defines the parameter payload required to generate a polished custom PDF document.
// Combines report titles, KPI cards, tables, callout blocks, and optional profile data.
// Powers client document authoring forms and automated report generation flows.
export interface CreateAuthoredDocumentParams {
  title: string;
  format?: AuthoredDocumentFormat;
  content?: string;
  kpis?: DocumentKPI[];
  tables?: DocumentTable[];
  callouts?: DocumentCallout[];
  filenameStem?: string;
  disclaimer?: string;
  includeProfileData?: boolean;
}

// Represents metadata results describing a freshly generated authored PDF document.
// Captures generated file names, byte counts, page totals, and workspace file IDs.
// Confirms report compilation and facilitates immediate document downloading.
export interface AuthoredDocumentResult {
  workspaceFileId: string;
  fileId: string;
  title: string;
  filename: string;
  format: AuthoredDocumentFormat;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
}

// Models the API response envelope returned after creating an authored PDF report.
// Bundles the generated document result metadata alongside server tracking IDs.
// Equips calling components with file references to trigger instant download links.
export interface CreateAuthoredDocumentResponse {
  success: boolean;
  document: AuthoredDocumentResult;
  request_id?: string;
}

/**
 * Generate a styled multi-format PDF document with KPI cards, multi-column tables,
 * running headers/footers, and instant workspace indexing.
 */
// Dispatches structured report parameters to compile a customized executive PDF document.
// Generates professional typography, KPI cards, and tables into a finished PDF.
// Automatically indexes the created document into the workspace file collection.
export async function createAuthoredDocument(params: CreateAuthoredDocumentParams) {
  return apiClient<CreateAuthoredDocumentResponse>("/files/authored-document", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * documentQAService.ts - Semantic Document Q&A & Physical Page Grounding Engine
 * ============================================================================
 * 
 * Provides end-to-end question answering over user-uploaded financial documents,
 * tax returns (1040, W-2), brokerage statements, scanned OCR receipts, and invoices.
 * 
 * Core Capabilities:
 * 1. Multi-modal semantic retrieval across text, tables, OCR receipts, and structured data
 * 2. 64-dimensional dense semantic vector similarity + BM25 lexical hybrid ranking
 * 3. Strict physical page attribution invariance (Page cited == Physical Page in PDF)
 * 4. Grounding verification ($G \ge 0.70$) and non-hallucination guard
 * 5. Direct quoted passage extraction and verifiable citations `[fileName:pPage:cChunk]`
 * 
 * MINDMAP FLOW
 * ------------
 * ```
 * DocumentQAService
 * ├── 1. Tenant & File Scope Verification
 * │   ├── Validate orgId and userId multi-tenant boundaries
 * │   ├── Scope to explicit workspaceFileIds or all active workspace files
 * │   └── Sync on-demand knowledge chunks via ensureWorkspaceFileChunks
 * ├── 2. Hybrid Dense + Lexical Candidate Retrieval
 * │   ├── Query intent & modality detection
 * │   ├── Dense 64-D vector cosine similarity (55% weight)
 * │   ├── Lexical exact & term frequency match (45% weight)
 * │   └── Modality & financial entity bonus (+2 to +4)
 * ├── 3. Physical Page & Citation Synthesis
 * │   ├── Extract verified physical pageNumber from form feeds (\f)
 * │   ├── Build verifiable citation: [fileName:p{page}:c{chunk}]
 * │   └── Strict physical page retention (no invented pages)
 * └── 4. Grounded Answer Synthesis & Telemetry
 *     ├── Compute Grounding Confidence G in [0, 1]
 *     ├── Gate Grounded Status: isGrounded = (G >= 0.70)
 *     ├── Synthesize direct quote passage answer with page attribution
 *     └── Safe rejection on low confidence (prevent hallucinated figures)
 * ```
 */

import mongoose from "mongoose";

import WorkspaceFileModel from "../models/workspaceFileModel";
import {
  type ChunkEntities,
  type ChunkModality,
  ensureWorkspaceFileChunks,
  GROUNDING_THRESHOLD,
  retrieveRelevantWorkspaceChunks,
} from "./retrievalService";

// Represents a grounded textual passage retrieved from an uploaded financial document.
// Encapsulates physical page attribution, chunk indexing, modal classification, and citation tokens.
// Carries dense grounding confidence scores to verify factual provenance.
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

// Encapsulates comprehensive question answering results over workspace financial documents.
// Contains top grounding scores, synthesized direct answers, and cited document passages.
// Provides physical page references and modality breakdowns across matched documents.
export interface DocumentQAResult {
  question: string;
  groundingScore: number;
  isGrounded: boolean;
  passages: DocumentQAPassage[];
  directAnswer: string;
  physicalPages: number[];
  total: number;
  sourceFilesCount: number;
  modalityBreakdown: Record<string, number>;
}

// Strips null byte characters and standardizes carriage return newlines into linefeeds.
// Removes leading and trailing whitespace from arbitrary question or text inputs.
// Sanitizes user queries before semantic and lexical retrieval processing.
const normalizeWhitespace = (val: string) => val.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();

/**
 * Executes a semantic Question & Answer query over user workspace documents.
 */
// Performs semantic question answering across workspace documents with physical page grounding.
// Combines dense vector similarity with lexical matching to retrieve relevant passages.
// Generates verifiable citations and guards against hallucinated answers using confidence thresholds.
export async function performDocumentQA(params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  question: string;
  workspaceFileIds?: string[];
  minConfidence?: number;
  limit?: number;
}): Promise<DocumentQAResult> {
  const cleanQuestion = normalizeWhitespace(params.question);
  const limit = Math.max(1, Math.min(10, params.limit || 5));

  // 1. Resolve Workspace Files in scope
  const fileFilter: mongoose.FilterQuery<any> = {
    orgId: params.orgId,
    userId: params.userId,
    status: { $in: ["uploaded", "processed"] },
  };

  if (params.workspaceFileIds && params.workspaceFileIds.length > 0) {
    const validIds = params.workspaceFileIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (validIds.length > 0) {
      fileFilter._id = { $in: validIds };
    } else {
      // Explicit but invalid filter -> return empty
      return {
        question: cleanQuestion,
        groundingScore: 0,
        isGrounded: false,
        passages: [],
        directAnswer: "No matching documents found in your workspace.",
        physicalPages: [],
        total: 0,
        sourceFilesCount: 0,
        modalityBreakdown: {},
      };
    }
  }

  const workspaceFiles = await WorkspaceFileModel.find(fileFilter)
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();

  if (workspaceFiles.length === 0) {
    return {
      question: cleanQuestion,
      groundingScore: 0,
      isGrounded: false,
      passages: [],
      directAnswer: "No documents available for question answering. Please upload a document first.",
      physicalPages: [],
      total: 0,
      sourceFilesCount: 0,
      modalityBreakdown: {},
    };
  }

  const fileMap = new Map<string, any>();
  workspaceFiles.forEach((f) => fileMap.set(String(f._id), f));

  // 2. Ensure chunks are indexed for all files in scope
  await Promise.all(
    workspaceFiles.map((file) =>
      ensureWorkspaceFileChunks({
        orgId: params.orgId,
        userId: params.userId,
        workspaceFileId: file._id,
        fileId: file.fileId,
        originalName: file.originalName,
        sourceKind: file.kind,
        extractedText: file.extractedText || "",
        pageCount: file.extractedPageCount,
      }).catch(() => undefined)
    )
  );

  // 3. Hybrid dense + lexical retrieval
  const targetFileIds = workspaceFiles.map((f) => String(f._id));
  const retrievedChunks = await retrieveRelevantWorkspaceChunks({
    orgId: params.orgId,
    userId: params.userId,
    query: cleanQuestion,
    selectedWorkspaceFileIds: targetFileIds,
    limit,
    minConfidence: params.minConfidence,
  });

  // 4. Map chunks to Passages with physical page verification
  const passages: DocumentQAPassage[] = [];
  const modalityBreakdown: Record<string, number> = {};
  const physicalPagesSet = new Set<number>();

  for (const chunk of retrievedChunks) {
    const file = fileMap.get(chunk.workspaceFileId);
    const fileName = file ? String(file.originalName) : "Document";
    const pageNumber = Number.isInteger(chunk.pageNumber) && Number(chunk.pageNumber) >= 1
      ? Number(chunk.pageNumber) : undefined;
    if (pageNumber !== undefined) physicalPagesSet.add(pageNumber);

    modalityBreakdown[chunk.modality] = (modalityBreakdown[chunk.modality] || 0) + 1;

    const citation = `[${fileName}${pageNumber === undefined ? "" : `:p${pageNumber}`}:c${chunk.chunkIndex}]`;

    passages.push({
      id: chunk.id,
      workspaceFileId: chunk.workspaceFileId,
      fileId: chunk.fileId,
      fileName,
      pageNumber,
      chunkIndex: chunk.chunkIndex,
      modality: chunk.modality,
      text: chunk.text,
      snippet: chunk.snippet,
      citation,
      confidence: chunk.groundingConfidence || 0,
      isGrounded: chunk.isGrounded || false,
      entities: chunk.entities,
    });
  }

  // 5. Compute Grounding Confidence Score
  const topConfidence = passages.length > 0 ? (passages[0]?.confidence || 0) : 0;
  const groundingScore = topConfidence;
  const isGrounded = topConfidence >= GROUNDING_THRESHOLD;

  // 6. Direct Answer Synthesis
  let directAnswer = "";
  if (passages.length === 0 || topConfidence < 0.25) {
    directAnswer =
      "The uploaded document(s) do not contain sufficient evidence to answer this question with high confidence. " +
      "Please verify that your document has selectable or OCR-extracted text, or try a more specific question.";
  } else {
    const topPassage = passages[0]!;
    // Extract key sentence from top passage matching question
    const lines = topPassage.text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const queryTerms = cleanQuestion.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);
    const matchingLines = lines.map((line) => {
      const lower = line.toLowerCase();
      return queryTerms.some((term) => lower.includes(term));
    });
    const isListItem = (line: string) => /^(?:[•–-]\s*|\d+[.)]\s+)/u.test(line);
    // PDF extraction puts each item on its own line. Include the rest of a
    // short, contiguous list when one item matches; the quotation stays verbatim.
    const listStart = lines.findIndex((line, index) => isListItem(line) && matchingLines[index]);
    const list: string[] = [];
    if (listStart >= 0) {
      let first = listStart;
      while (first > 0 && isListItem(lines[first - 1]!)) first--;
      for (const line of lines.slice(first, first + 6)) {
        if (!isListItem(line)) break;
        list.push(line);
      }
    }
    const relevantLines = lines.filter((_, index) => matchingLines[index]);
    const excerpt = list.length > 1 ? list.join("; ") : relevantLines.length > 0
      ? relevantLines.slice(0, 3).join("; ")
      : (lines[0] || topPassage.snippet);

    const location = topPassage.pageNumber === undefined
      ? `the extracted text of ${topPassage.fileName} (physical page not available)`
      : `Page ${topPassage.pageNumber} of ${topPassage.fileName}`;
    directAnswer =
      `According to ${location}: "${excerpt}".`;
  }

  const physicalPages = Array.from(physicalPagesSet).sort((a, b) => a - b);

  return {
    question: cleanQuestion,
    groundingScore,
    isGrounded,
    passages,
    directAnswer,
    physicalPages,
    total: passages.length,
    sourceFilesCount: workspaceFiles.length,
    modalityBreakdown,
  };
}

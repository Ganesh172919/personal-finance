/**
 * unifiedContext.ts - Client API for Unified Ranked Context Retrieval
 * ====================================================================
 * 
 * Interacts with GET /api/v1/search/unified-context and POST /api/v1/search/unified-context.
 */

import { apiClient } from "./core";

// Defines supported data modality domains for hybrid unified context searches.
// Distinguishes agent memory records, indexed document files, and ledger transactions.
// Governs source-filtering parameters across multimodal contextual grounding queries.
export type UnifiedSourceType = "memory" | "file" | "transaction";

// Represents an individually ranked context snippet retrieved across knowledge sources.
// Tracks reciprocal rank fusion scores, original relevance weights, and citations.
// Encapsulates entity-specific metadata such as transaction amounts or page numbers.
export interface UnifiedRetrievedItem {
  id: string;
  sourceType: UnifiedSourceType;
  title: string;
  snippet: string;
  score: number;
  rrfScore: number;
  rank: number;
  sourceScore: number;
  citation?: string;
  metadata: {
    key?: string;
    confidence?: number;
    source?: string;
    workspaceFileId?: string;
    pageNumber?: number;
    modality?: string;
    amount?: number;
    currency?: string;
    category?: string;
    merchantName?: string;
    date?: string;
    transactionType?: string;
  };
}

// Encapsulates the complete response payload from a unified context search query.
// Unpacks category hit distributions, ranked snippet lists, and synthetic prompts.
// Feeds LLM prompt injection workflows with pre-formatted grounded context strings.
export interface UnifiedContextResponse {
  status: "success" | "error";
  request_id?: string;
  query: string;
  total: number;
  breakdown: {
    memory: number;
    file: number;
    transaction: number;
  };
  results: UnifiedRetrievedItem[];
  groundedContextPrompt: string;
}

// Defines search parameters for executing hybrid relevance queries across subsystems.
// Encapsulates the natural language search string, target source modalities, and limits.
// Specifies minimum relevance score thresholds to discard low-confidence matches.
export interface UnifiedContextParams {
  query: string;
  sources?: UnifiedSourceType[];
  limit?: number;
  minScore?: number;
}

// Executes a GET search retrieving ranked contextual snippets matching a query string.
// Formulates query parameters for sources, record limits, and score cutoff thresholds.
// Dispatches an authenticated GET request returning unified contextual information.
export async function getUnifiedContext(params: UnifiedContextParams): Promise<UnifiedContextResponse> {
  const qs = new URLSearchParams();
  qs.set("q", params.query);
  if (params.sources && params.sources.length) {
    qs.set("sources", params.sources.join(","));
  }
  if (params.limit !== undefined) {
    qs.set("limit", String(params.limit));
  }
  if (params.minScore !== undefined) {
    qs.set("minScore", String(params.minScore));
  }

  return apiClient<UnifiedContextResponse>(`/search/unified-context?${qs.toString()}`);
}

// Executes a POST request for complex or long query string contextual retrievals.
// Serializes search parameters and target source modality filters into the request body.
// Dispatches an authenticated POST request returning grounded context items and prompts.
export async function searchUnifiedContextPost(params: UnifiedContextParams): Promise<UnifiedContextResponse> {
  return apiClient<UnifiedContextResponse>("/search/unified-context", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

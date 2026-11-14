/**
 * @fileoverview Zod validation schemas for workspace file management endpoints.
 *
 * Exported schemas:
 *   listWorkspaceFilesQuerySchema   - Validates file list query (extends pagination with optional search, max 120 chars)
 *   analyzeWorkspaceFileBodySchema  - Validates file analysis request (optional prompt, 1-2000 chars)
 *
 * Used by: fileRoutes (GET /, POST /:id/analyze)
 *
 * Key validation rules:
 *   - Inherits pagination from common (page, limit)
 *   - Search: optional, trimmed, max 120 characters
 *   - Prompt: optional, 1-2000 characters when provided
 *   - Both schemas use .strict() to reject unknown fields
 */
import { z } from "zod";

import { paginationQuerySchema } from "./common";

// Validates pagination and search filters for querying workspace files.
// Extends standard pagination controls with optional keyword search parameters.
// Enforces strict schema validation to reject unrecognized query fields.
export const listWorkspaceFilesQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().max(120).optional(),
  })
  .strict();

// Validates request parameters for executing AI document analysis on a file.
// Accepts an optional custom prompt instruction string up to 2000 characters.
// Rejects unknown request attributes using strict object schema validation.
export const analyzeWorkspaceFileBodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

// Validates request payloads for generating rendered PDF views of workspace files.
// Permits an optional custom document title string up to 160 characters.
// Enforces strict parameter validation to ensure clean PDF layout generation.
export const renderWorkspaceFilePdfBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

// Validates request bodies converting arbitrary raw text into authored PDF documents.
// Enforces non-empty prompt text bounded within a maximum of 20,000 characters.
// Accommodates optional custom document titles and output filenames.
export const renderPdfFromTextBodySchema = z
  .object({
    prompt_text: z.string().trim().min(1).max(20000),
    title: z.string().trim().min(1).max(160).optional(),
    file_name: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

// Validates hybrid vector and lexical search queries over workspace knowledge chunks.
// Filters across content modalities including text, tables, and OCR extracts.
// Supports file scoping arrays, result limits, and minimum confidence cutoffs.
export const searchWorkspaceChunksBodySchema = z
  .object({
    query: z.string().trim().min(1).max(300),
    modality: z.enum(["all", "text", "table", "image_ocr", "structured_data"]).optional(),
    selectedWorkspaceFileIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
    limit: z.number().int().min(1).max(20).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
  })
  .strict();

// Validates request payloads querying the workspace document Q&A engine.
// Enforces non-empty question strings and allows scoping to specific file IDs.
// Configures confidence thresholds and limits to return grounded citations.
export const documentQABodySchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    workspaceFileIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();
// Validates request payloads for creating professionally formatted financial PDF documents.
// Restricts document formats to supported templates like executive briefs and audits.
// Validates embedded KPI cards, tabular schedules, visual callouts, and disclaimers.
export const createAuthoredDocumentBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    format: z
      .enum([
        'standard',
        'executive_brief',
        'tax_prep_summary',
        'cash_flow_audit',
        'debt_payoff_schedule',
        'net_worth_statement',
      ])
      .optional(),
    content: z.string().trim().max(50000).optional(),
    kpis: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(100),
          value: z.string().trim().min(1).max(100),
          subtext: z.string().trim().max(160).optional(),
        })
      )
      .max(8)
      .optional(),
    tables: z
      .array(
        z.object({
          title: z.string().trim().max(160).optional(),
          headers: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
          rows: z.array(z.array(z.string().trim().max(200)).min(1).max(8)).max(50),
        })
      )
      .max(6)
      .optional(),
    callouts: z
      .array(
        z.object({
          type: z.enum(['note', 'warning', 'success']).optional(),
          text: z.string().trim().min(1).max(500),
        })
      )
      .max(6)
      .optional(),
    filenameStem: z.string().trim().max(100).optional(),
    disclaimer: z.string().trim().max(1000).optional(),
    includeProfileData: z.boolean().optional(),
  })
  .strict();


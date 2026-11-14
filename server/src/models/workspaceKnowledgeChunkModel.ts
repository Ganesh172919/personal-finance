/**
 * workspaceKnowledgeChunkModel.ts - Mongoose Schema for RAG Knowledge Chunks
 * ===========================================================================
 * 
 * Defines the data structure and indexing strategy for text chunks derived from
 * uploaded workspace files, used for retrieval-augmented generation (RAG).
 * 
 * MINDMAP FLOW
 * ------------
 * ```
 * WorkspaceKnowledgeChunkModel
 * ├── 1. Tenant & Ownership Keys
 * │   ├── orgId: ObjectId (Ref: Organization) -> Multi-tenant boundary
 * │   └── userId: ObjectId (Ref: User) -> Owner isolation
 * ├── 2. Source Document Pointers
 * │   ├── workspaceFileId: ObjectId (Ref: WorkspaceFile)
 * │   ├── fileId: ObjectId (GridFS file backing reference)
 * │   └── chunkIndex: number (Ordinal index within document)
 * ├── 3. Content & Linguistic Attributes
 * │   ├── text: string (Window of 1800 chars with 260 ch overlap)
 * │   ├── tokenCountEstimate: number (Estimated tokens)
 * │   ├── sectionTitle?: string (Extracted section header)
 * │   ├── pageNumber?: number (Preserved physical page from \f)
 * │   └── sourceKind: string (e.g., "document", "csv", "receipt")
 * └── 4. Performance Indexes
 *     ├── Unique Compound: { orgId, userId, workspaceFileId, chunkIndex }
 *     └── Retrieval Index: { orgId, userId, updatedAt: -1 }
 * ```
 * 
 * ASCII FLOW
 * ----------
 * ```
 *   +-------------------------------------------------------------+
 *   |                 Uploaded Workspace Document                 |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |               Bounded Window Chunking Engine                |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |            MongoDB: WorkspaceKnowledgeChunk Document        |
 *   |  - orgId & userId for multi-tenant isolation                |
 *   |  - workspaceFileId & chunkIndex (Unique)                    |
 *   |  - text snippet + sectionTitle + pageNumber                 |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   | Indexed for Fast Lexical Search & Dynamic Grounding         |
 *   +-------------------------------------------------------------+
 * ```
 */

import { Document, Schema, Types, model } from "mongoose";

// Defines content modality classifications for RAG document knowledge chunks.
// Distinguishes prose text, tabular datasets, OCR image transcripts, and structured data.
// Enables modality-aware retrieval filtering and specialized embedding generation.
export type ChunkModality = "text" | "table" | "image_ocr" | "structured_data";

// Defines the domain attributes for partitioned document chunks used in RAG semantic search.
// Captures chunk text windows, token counts, section headers, page numbers, and embeddings.
// Represents the fundamental atomic unit of knowledge retrieved during context augmentation.
export interface IWorkspaceKnowledgeChunk {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  workspaceFileId: Types.ObjectId;
  fileId: Types.ObjectId;
  chunkIndex: number;
  text: string;
  tokenCountEstimate: number;
  sectionTitle?: string;
  pageNumber?: number;
  sourceKind: string;
  modality?: ChunkModality;
  embedding?: number[];
  entities?: {
    merchants?: string[];
    amounts?: number[];
    dates?: string[];
    currencies?: string[];
  };
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Merges knowledge chunk domain attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent knowledge chunk document returned by vector and lexical searches.
export interface IWorkspaceKnowledgeChunkDocument extends IWorkspaceKnowledgeChunk, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the RAG knowledge chunk collection.
// Enforces length constraints on text snippets, valid modalities, and embedding vectors.
// Automatically manages creation and modification timestamps on all write operations.
const workspaceKnowledgeChunkSchema = new Schema<IWorkspaceKnowledgeChunkDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    workspaceFileId: {
      type: Schema.Types.ObjectId,
      ref: "WorkspaceFile",
      required: true,
      index: true,
    },
    fileId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    text: {
      type: String,
      required: true,
      maxlength: 12000,
    },
    tokenCountEstimate: {
      type: Number,
      required: true,
      min: 0,
    },
    sectionTitle: {
      type: String,
      maxlength: 200,
    },
    pageNumber: {
      type: Number,
      min: 1,
    },
    sourceKind: {
      type: String,
      required: true,
      maxlength: 40,
      default: "document",
    },
    modality: {
      type: String,
      enum: ["text", "table", "image_ocr", "structured_data"],
      default: "text",
      index: true,
    },
    embedding: {
      type: [Number],
      default: undefined,
    },
    entities: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Configures compound database indexes for multi-tenant lexical search and RAG retrieval.
// Enforces uniqueness across file IDs and chunk indices to prevent duplicate partitions.
// Optimizes retrieval queries filtered by tenant ownership, modality, and update recency.
workspaceKnowledgeChunkSchema.index({ orgId: 1, userId: 1, workspaceFileId: 1, chunkIndex: 1 }, { unique: true });
workspaceKnowledgeChunkSchema.index({ orgId: 1, userId: 1, updatedAt: -1 });
workspaceKnowledgeChunkSchema.index({ orgId: 1, userId: 1, sourceKind: 1, updatedAt: -1 });
workspaceKnowledgeChunkSchema.index({ orgId: 1, userId: 1, modality: 1, updatedAt: -1 });

// Compiles and exports the Mongoose model for RAG document knowledge chunks.
// Exposes data access methods to insert, query, update, or purge chunked file knowledge.
// Serves as the high-throughput persistence store for context retrieval pipelines.
const WorkspaceKnowledgeChunkModel = model<IWorkspaceKnowledgeChunkDocument>(
  "WorkspaceKnowledgeChunk",
  workspaceKnowledgeChunkSchema
);

export default WorkspaceKnowledgeChunkModel;

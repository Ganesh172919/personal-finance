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
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkspaceKnowledgeChunkDocument extends IWorkspaceKnowledgeChunk, Document {
  _id: Types.ObjectId;
}

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
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

workspaceKnowledgeChunkSchema.index({ orgId: 1, userId: 1, workspaceFileId: 1, chunkIndex: 1 }, { unique: true });
workspaceKnowledgeChunkSchema.index({ orgId: 1, userId: 1, updatedAt: -1 });
workspaceKnowledgeChunkSchema.index({ orgId: 1, userId: 1, sourceKind: 1, updatedAt: -1 });

const WorkspaceKnowledgeChunkModel = model<IWorkspaceKnowledgeChunkDocument>(
  "WorkspaceKnowledgeChunk",
  workspaceKnowledgeChunkSchema
);

export default WorkspaceKnowledgeChunkModel;

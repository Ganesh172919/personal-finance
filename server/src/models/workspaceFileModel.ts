/**
 * workspaceFileModel.ts - Workspace File Metadata & Analysis Schema
 * ==================================================================
 *
 * Manages metadata, GridFS backing IDs, extracted text, and AI analysis
 * results for user-uploaded documents and spreadsheets.
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * WorkspaceFileModel
 * ├── 1. Tenant & Ownership
 * │   ├── orgId: ObjectId (Ref: Organization)
 * │   ├── userId: ObjectId (Ref: User)
 * │   └── fileId: ObjectId (MongoDB GridFS file ID)
 * ├── 2. File Properties
 * │   ├── originalName: string & filename: string
 * │   ├── mimeType: string & size: number (bytes)
 * │   ├── kind: "document" | "spreadsheet" | "image" | "code" | "data" | "archive" | "other"
 * │   └── status: "uploaded" | "processed" | "error"
 * ├── 3. RAG & Content Extraction
 * │   ├── extractedText?: string (Normalized plain text)
 * │   ├── textExtractionStatus?: "pending" | "completed" | "failed" | "unsupported"
 * │   └── chunkCount?: number (Count of generated WorkspaceKnowledgeChunks)
 * └── 4. AI Analysis Results (latestAnalysis)
 *     ├── summary & response markdown
 *     ├── evidence items list with confidence score
 *     └── workflowTrace & agentsInvolved audit
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +-------------------------------------------------------------+
 *   |                 File Uploaded to Express API                |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |  1. Stream File to MongoDB GridFS -> fileId                 |
 *   |  2. Create WorkspaceFileModel with status: "uploaded"       |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |         Text Extraction Worker (fileTextExtraction)         |
 *   |  - Parse PDF / TXT / CSV / DOCX                             |
 *   |  - Save extractedText on WorkspaceFileModel                 |
 *   +------------------------------+------------------------------+
 *                                  |
 *                                  v
 *   +-------------------------------------------------------------+
 *   |             Trigger RAG Chunk Sync (retrievalService)       |
 *   |  - Generate knowledge chunks in WorkspaceKnowledgeChunkModel|
 *   |  - Update chunkCount on WorkspaceFileModel                  |
 *   +-------------------------------------------------------------+
 * ```
 */

import { Document, Schema, Types, model } from "mongoose";

export type WorkspaceFileKind =
  | "document"
  | "spreadsheet"
  | "image"
  | "code"
  | "data"
  | "archive"
  | "other";

export type WorkspaceFileStatus = "uploaded" | "processed" | "error";

export type WorkspaceFileAnalysis = {
  summary: string;
  response: string;
  plan?: Record<string, unknown>;
  evidence?: Array<{
    id?: string;
    type?: string;
    label?: string;
    snippet?: string;
    entity_id?: string;
    page_number?: number;
  }>;
  confidence?: {
    score?: number;
    label?: string;
    notes?: string[];
    coverage?: Record<string, unknown>;
  };
  analysisType?: string;
  agentsInvolved?: string[];
  workflowTrace?: Array<{
    agent: string;
    startedAt: string;
    endedAt: string;
    status: string;
    error?: string;
  }>;
  fallbackUsed?: boolean;
  llmCallCount?: number;
  requestId?: string;
  updatedAt?: Date;
};

export interface IWorkspaceFile {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  fileId: Types.ObjectId;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extension?: string;
  kind: WorkspaceFileKind;
  status: WorkspaceFileStatus;
  extractedText?: string;
  extractedPreview?: string;
  extractedPageCount?: number;
  extractionWarnings: string[];
  analysis?: WorkspaceFileAnalysis;
  lastAnalyzedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkspaceFileDocument extends IWorkspaceFile, Document {
  _id: Types.ObjectId;
}

const workspaceFileSchema = new Schema<IWorkspaceFileDocument>(
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
    fileId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    originalName: {
      type: String,
      required: true,
      maxlength: 260,
    },
    mimeType: {
      type: String,
      required: true,
      maxlength: 200,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    extension: {
      type: String,
      maxlength: 40,
    },
    kind: {
      type: String,
      enum: ["document", "spreadsheet", "image", "code", "data", "archive", "other"],
      default: "other",
    },
    status: {
      type: String,
      enum: ["uploaded", "processed", "error"],
      default: "uploaded",
    },
    extractedText: {
      type: String,
      default: "",
    },
    extractedPreview: {
      type: String,
      default: "",
    },
    extractedPageCount: {
      type: Number,
      min: 1,
    },
    extractionWarnings: {
      type: [String],
      default: [],
    },
    analysis: {
      summary: String,
      response: String,
      plan: {
        type: Schema.Types.Mixed,
        default: undefined,
      },
      evidence: {
        type: [Schema.Types.Mixed],
        default: [],
      },
      confidence: {
        type: Schema.Types.Mixed,
        default: undefined,
      },
      analysisType: String,
      agentsInvolved: {
        type: [String],
        default: [],
      },
      workflowTrace: {
        type: [Schema.Types.Mixed],
        default: [],
      },
      fallbackUsed: Boolean,
      llmCallCount: Number,
      requestId: String,
      updatedAt: Date,
    },
    lastAnalyzedAt: Date,
  },
  {
    timestamps: true,
  }
);

workspaceFileSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
workspaceFileSchema.index({ orgId: 1, userId: 1, originalName: 1 });

const WorkspaceFileModel = model<IWorkspaceFileDocument>("WorkspaceFile", workspaceFileSchema);

export default WorkspaceFileModel;

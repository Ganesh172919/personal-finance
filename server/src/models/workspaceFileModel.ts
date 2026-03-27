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

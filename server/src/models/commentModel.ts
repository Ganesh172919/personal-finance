import { Schema, model, Document, Types } from "mongoose";

// Defines TypeScript contract for collaborative comments across financial resources.
// Attaches threaded feedback to transactions, budgets, goals, workflows, and insights.
// Supports user mentions, nested parent threads, and soft deletion timestamps.
export interface IComment {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  resourceType: "transaction" | "budget" | "goal" | "workflow" | "insight";
  resourceId: string;
  text: string;
  mentions?: string[];
  parentId?: Types.ObjectId;
  editedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Extends IComment with Mongoose Document properties and ObjectId primary key.
// Enables runtime database querying, persistence, and typed document methods.
// Represents individual collaboration comment documents in MongoDB storage.
export interface ICommentDocument extends IComment, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing financial collaboration comment entries.
// Enforces resource type enumerations, string length limits, and tenant relationships.
// Automatically tracks createdAt and updatedAt timestamps for chronological ordering.
const commentSchema = new Schema<ICommentDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    resourceType: {
      type: String,
      required: true,
      enum: ["transaction", "budget", "goal", "workflow", "insight"],
      index: true,
    },
    resourceId: { type: String, required: true, trim: true, maxlength: 128, index: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    mentions: { type: [String], default: undefined },
    parentId: { type: Schema.Types.ObjectId, ref: "Comment" },
    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

// Compound indexes optimizing threaded comment retrieval and user history lookups.
// Speeds up fetching comments anchored to specific transactions or financial entities.
// Ensures fast timeline loading for team collaboration drawers in user interface.
commentSchema.index({ orgId: 1, resourceType: 1, resourceId: 1, createdAt: -1 });
commentSchema.index({ orgId: 1, userId: 1, createdAt: -1 });

// Instantiates Mongoose model bound to MongoDB "Comment" data collection.
// Provides strongly typed querying, thread creation, editing, and soft-delete logic.
// Consumed by collaboration routers, activity feed workers, and notification systems.
const CommentModel = model<ICommentDocument>("Comment", commentSchema);
// Exports compiled CommentModel instance as default module export.
// Imported by collaboration controllers, discussion handlers, and feed services.
// Serves as central database access gateway for managing entity comment threads.
export default CommentModel;

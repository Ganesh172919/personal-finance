import { Schema, model, Document, Types } from "mongoose";

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

export interface ICommentDocument extends IComment, Document {
  _id: Types.ObjectId;
}

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

commentSchema.index({ orgId: 1, resourceType: 1, resourceId: 1, createdAt: -1 });
commentSchema.index({ orgId: 1, userId: 1, createdAt: -1 });

const CommentModel = model<ICommentDocument>("Comment", commentSchema);
export default CommentModel;

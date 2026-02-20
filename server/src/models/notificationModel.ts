import { Schema, model, Document, Types } from "mongoose";

export type NotificationStatus = "unread" | "read";

export interface INotification {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  status: NotificationStatus;
  title: string;
  message: string;
  readAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationDocument extends INotification, Document {
  _id: Types.ObjectId;
}

const notificationSchema = new Schema<INotificationDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["unread", "read"], required: true, default: "unread", index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    readAt: { type: Date },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ orgId: 1, userId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ orgId: 1, userId: 1, createdAt: -1 });

const NotificationModel = model<INotificationDocument>("Notification", notificationSchema);
export default NotificationModel;


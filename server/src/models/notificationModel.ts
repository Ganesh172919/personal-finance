import { Schema, model, Document, Types } from "mongoose";

// Defines read state classification values for user notifications.
// Distinguishes between unread notices awaiting attention and consumed alerts.
// Used across badge count computations and notification center read-state updates.
export type NotificationStatus = "unread" | "read";

// Defines the domain attributes for an in-app user notification message.
// Stores tenant references, alert titles, message bodies, read timestamps, and metadata.
// Supports automated delivery of system warnings, task updates, and financial insights.
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

// Combines notification attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent notification document returned by notification feed queries.
export interface INotificationDocument extends INotification, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema for the notification collection.
// Enforces length constraints on titles, messages, and read status enums.
// Automatically tracks notification creation and update timestamps across writes.
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

// Configures compound database indexes for user notification feed resolution.
// Accelerates queries filtering by read state and sorted chronologically descending.
// Provides rapid lookup performance for real-time unread badge counts in the client.
notificationSchema.index({ orgId: 1, userId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ orgId: 1, userId: 1, createdAt: -1 });

// Compiles and exports the Mongoose model for in-app notifications.
// Exposes data access methods to query, create, mark read, or dismiss user alerts.
// Serves as the persistence backbone for real-time alerts across web and mobile clients.
const NotificationModel = model<INotificationDocument>("Notification", notificationSchema);
export default NotificationModel;


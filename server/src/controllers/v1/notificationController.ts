import type { Request, Response } from "express";
import mongoose from "mongoose";

import NotificationModel from "../../models/notificationModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const mapNotification = (row: any) => ({
  id: String(row._id),
  status: String(row.status || "unread"),
  title: String(row.title || ""),
  message: String(row.message || ""),
  read_at: row.readAt || null,
  created_at: row.createdAt || null,
  metadata: row.metadata || {},
});

export const listNotifications = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const statusRaw = String((req.query as any)?.status || "").trim().toLowerCase();
  const status = statusRaw === "read" || statusRaw === "unread" ? statusRaw : undefined;
  const limitRaw = Number((req.query as any)?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

  const query: Record<string, unknown> = { orgId, userId: user._id };
  if (status) {
    query.status = status;
  }

  const notifications = await NotificationModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();

  res.json({
    org_id: orgId.toString(),
    notifications: notifications.map(mapNotification),
    request_id: req.requestId,
  });
};

export const markNotificationRead = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const notificationIdRaw = String((req as any).params?.id || "");
  if (!mongoose.Types.ObjectId.isValid(notificationIdRaw)) {
    throw new HttpError(400, "INVALID_NOTIFICATION_ID", "Invalid notification id");
  }

  const updated = await NotificationModel.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(notificationIdRaw), orgId, userId: user._id },
    { $set: { status: "read", readAt: new Date() } },
    { new: true }
  ).lean();

  if (!updated) {
    throw new HttpError(404, "NOT_FOUND", "Notification not found");
  }

  res.json({
    org_id: orgId.toString(),
    notification: mapNotification(updated),
    request_id: req.requestId,
  });
};


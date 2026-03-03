import type { Request, Response } from "express";
import mongoose from "mongoose";

import CalendarReminderModel from "../../models/calendarReminderModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

export const listReminders = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = req.org?.orgId;
  if (!orgId) throw new HttpError(401, "ORG_REQUIRED", "Organization context required");

  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;

  const filter: Record<string, unknown> = {
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: user._id,
  };

  if (from || to) {
    filter.date = {};
    if (from) (filter.date as any).$gte = from;
    if (to) (filter.date as any).$lte = to;
  }

  const reminders = await CalendarReminderModel.find(filter)
    .sort({ date: 1, createdAt: 1 })
    .limit(200)
    .lean();

  return res.json({
    reminders: reminders.map((r) => ({
      id: String(r._id),
      date: r.date,
      title: r.title,
      description: r.description || "",
      completed: r.completed,
      created_at: r.createdAt?.toISOString(),
    })),
    request_id: req.requestId,
  });
};

export const createReminder = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = req.org?.orgId;
  if (!orgId) throw new HttpError(401, "ORG_REQUIRED", "Organization context required");

  const { date, title, description } = req.body as {
    date: string;
    title: string;
    description?: string;
  };

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "INVALID_DATE", "Date must be in YYYY-MM-DD format");
  }
  if (!title || !title.trim()) {
    throw new HttpError(400, "INVALID_TITLE", "Title is required");
  }

  const reminder = await CalendarReminderModel.create({
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: user._id,
    date,
    title: title.trim(),
    description: description?.trim() || "",
    completed: false,
  });

  return res.status(201).json({
    reminder: {
      id: String(reminder._id),
      date: reminder.date,
      title: reminder.title,
      description: reminder.description || "",
      completed: reminder.completed,
      created_at: reminder.createdAt?.toISOString(),
    },
    request_id: req.requestId,
  });
};

export const toggleReminder = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = req.org?.orgId;
  if (!orgId) throw new HttpError(401, "ORG_REQUIRED", "Organization context required");

  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, "INVALID_ID", "Invalid reminder ID");
  }

  const reminder = await CalendarReminderModel.findOne({
    _id: new mongoose.Types.ObjectId(id),
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: user._id,
  });

  if (!reminder) throw new HttpError(404, "NOT_FOUND", "Reminder not found");

  reminder.completed = !reminder.completed;
  await reminder.save();

  return res.json({
    reminder: {
      id: String(reminder._id),
      date: reminder.date,
      title: reminder.title,
      description: reminder.description || "",
      completed: reminder.completed,
    },
    request_id: req.requestId,
  });
};

export const deleteReminder = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = req.org?.orgId;
  if (!orgId) throw new HttpError(401, "ORG_REQUIRED", "Organization context required");

  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, "INVALID_ID", "Invalid reminder ID");
  }

  const result = await CalendarReminderModel.deleteOne({
    _id: new mongoose.Types.ObjectId(id),
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: user._id,
  });

  if (result.deletedCount === 0) {
    throw new HttpError(404, "NOT_FOUND", "Reminder not found");
  }

  return res.json({ success: true, request_id: req.requestId });
};

/**
 * @fileoverview Calendar Reminder Controller (v1)
 *
 * Manages financial calendar reminders (bill due dates, payment schedules, etc.).
 * Each reminder belongs to a user within an organization.
 *
 * Routes served:
 *   GET    /api/v1/calendar-reminders     - listReminders
 *   POST   /api/v1/calendar-reminders     - createReminder
 *   PATCH  /api/v1/calendar-reminders/:id/toggle - toggleReminder
 *   DELETE /api/v1/calendar-reminders/:id - deleteReminder
 *
 * Key patterns:
 *   - Date stored as YYYY-MM-DD string (not Date object)
 *   - toggleReminder flips the completed boolean
 *   - Date range filtering supported via from/to query params
 *   - All operations scoped to org + authenticated user
 *
 * @module controllers/v1/calendarReminderController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import CalendarReminderModel from "../../models/calendarReminderModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

// Fetches scheduled financial calendar reminders within an optional date range.
// Enforces tenant organization boundaries and caller ownership constraints.
// Delivers reminder items sorted chronologically by calendar date and creation time.
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

// Records a new financial calendar reminder with a specific calendar date target.
// Validates date formatting compliance and title non-emptiness before persistence.
// Returns the newly initialized reminder document accompanied by request tracking.
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

// Flips the completion state indicator on an existing financial calendar reminder.
// Locates the target entity under tenant ownership rules before updating flags.
// Commits modified status flags and returns updated reminder details to the caller.
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

// Permanently removes a scheduled financial reminder item from persistent storage.
// Enforces tenant organization and user authorization checks prior to deletion.
// Confirms successful deletion or returns a not found HTTP error response.
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


// Marks a batch of active calendar reminders as completed in a single mutation.
// Filters target reminders either by explicit identifier lists or date boundaries.
// Returns modified record tallies confirming the volume of completed reminders.
export const batchCompleteReminders = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = req.org?.orgId;
  if (!orgId) throw new HttpError(401, "ORG_REQUIRED", "Organization context required");

  const { from, to, ids } = req.body as {
    from?: string;
    to?: string;
    ids?: string[];
  };

  const filter: Record<string, unknown> = {
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: user._id,
    completed: false,
  };

  if (Array.isArray(ids) && ids.length > 0) {
    filter._id = { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) };
  } else if (from || to) {
    filter.date = {};
    if (from) (filter.date as any).$gte = from;
    if (to) (filter.date as any).$lte = to;
  }

  const result = await CalendarReminderModel.updateMany(filter, { $set: { completed: true } });

  return res.json({
    success: true,
    updated: result.modifiedCount,
    request_id: req.requestId,
  });
};

// Purges completed calendar reminder records matching target identifiers or ranges.
// Restricts batch deletion scope strictly to previously satisfied reminder entries.
// Responds with deletion count tallies confirming the number of purged items.
export const clearCompletedReminders = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = req.org?.orgId;
  if (!orgId) throw new HttpError(401, "ORG_REQUIRED", "Organization context required");

  const { from, to, ids } = req.body as {
    from?: string;
    to?: string;
    ids?: string[];
  };

  const filter: Record<string, unknown> = {
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: user._id,
    completed: true,
  };

  if (Array.isArray(ids) && ids.length > 0) {
    filter._id = { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) };
  } else if (from || to) {
    filter.date = {};
    if (from) (filter.date as any).$gte = from;
    if (to) (filter.date as any).$lte = to;
  }

  const result = await CalendarReminderModel.deleteMany(filter);

  return res.json({
    success: true,
    deleted: result.deletedCount,
    request_id: req.requestId,
  });
};

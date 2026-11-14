import { Schema, model, Document, Types } from "mongoose";

// Defines TypeScript interface for scheduled financial and task calendar reminders.
// Stores ISO date string, task title, completion state, and user ownership keys.
// Facilitates deadline tracking, bill reminders, and financial follow-through.
export interface ICalendarReminder {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  title: string;
  description?: string;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Extends ICalendarReminder with Mongoose Document properties and ObjectId.
// Enables runtime database persistence, schema validation, and typed methods.
// Represents individual calendar reminder documents in MongoDB storage layer.
export interface ICalendarReminderDocument extends ICalendarReminder, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing financial calendar reminder records.
// Enforces ISO date format lengths, title boundaries, and default booleans.
// Automatically tracks record creation and modification timestamps over time.
const calendarReminderSchema = new Schema<ICalendarReminderDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true, trim: true, maxlength: 10 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index optimizing user reminder lookups within specific calendar dates.
// Accelerates retrieval for monthly and weekly financial calendar views.
// Ensures fast response times when querying reminders scoped to an organization.
calendarReminderSchema.index({ orgId: 1, userId: 1, date: 1 });

// Instantiates Mongoose model bound to MongoDB "CalendarReminder" collection.
// Provides strongly typed querying, creation, completion toggles, and deletion.
// Invoked by calendar reminder routers and financial follow-through controllers.
const CalendarReminderModel = model<ICalendarReminderDocument>(
  "CalendarReminder",
  calendarReminderSchema
);
// Exports compiled CalendarReminderModel instance as default module export.
// Imported by calendar controllers, notification dispatchers, and task services.
// Serves as central database access interface for managing reminder entities.
export default CalendarReminderModel;

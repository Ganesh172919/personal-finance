import { Schema, model, Document, Types } from "mongoose";

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

export interface ICalendarReminderDocument extends ICalendarReminder, Document {
  _id: Types.ObjectId;
}

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

calendarReminderSchema.index({ orgId: 1, userId: 1, date: 1 });

const CalendarReminderModel = model<ICalendarReminderDocument>(
  "CalendarReminder",
  calendarReminderSchema
);
export default CalendarReminderModel;

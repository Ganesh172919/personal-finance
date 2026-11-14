import { Schema, model, Document, Types } from "mongoose";

// Defines TypeScript contract representing an internal domain event.
// Captures domain mutations across aggregates like transactions, budgets, and goals.
// Powers asynchronous event processing, autopilot triggers, and event sourcing.
export interface IDomainEvent {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actionLinkId?: string;
  requestId?: string;
  payload: Record<string, unknown>;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Extends IDomainEvent with Mongoose Document properties and ObjectId primary key.
// Enables runtime database querying, persistence methods, and schema validation.
// Represents individual domain event records stored in MongoDB database collection.
export interface IDomainEventDocument extends IDomainEvent, Document {
  _id: Types.ObjectId;
}

// Mongoose schema definition governing domain event persistence and structure.
// Enforces event type string boundaries, aggregate linkages, and payload defaults.
// Automatically manages createdAt and updatedAt timestamps for event sequencing.
const domainEventSchema = new Schema<IDomainEventDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventType: { type: String, required: true, trim: true, maxlength: 120 },
    aggregateType: { type: String, required: true, trim: true, maxlength: 80 },
    aggregateId: { type: String, required: true, trim: true, maxlength: 128 },
    actionLinkId: { type: String, trim: true, maxlength: 128 },
    requestId: { type: String, trim: true, maxlength: 128 },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

// Compound indexes optimizing event dispatching, auditing, and worker polling.
// Accelerates retrieval of unprocessed events ordered chronologically for delivery.
// Speeds up event history queries filtered by tenant organization and user ID.
domainEventSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
domainEventSchema.index({ eventType: 1, createdAt: -1 });
domainEventSchema.index({ processedAt: 1, createdAt: 1 });

// Instantiates Mongoose model bound to MongoDB "DomainEvent" collection.
// Provides strongly typed querying, event publishing, and completion tracking.
// Consumed by event dispatcher workers, webhook publishers, and autopilot agents.
const DomainEventModel = model<IDomainEventDocument>("DomainEvent", domainEventSchema);
// Exports compiled DomainEventModel instance as default module export.
// Imported by event emitter utilities, audit pipelines, and worker queues.
// Serves as central database access gateway for recording platform domain events.
export default DomainEventModel;

import { Schema, model, Document, Types } from "mongoose";

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

export interface IDomainEventDocument extends IDomainEvent, Document {
  _id: Types.ObjectId;
}

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

domainEventSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
domainEventSchema.index({ eventType: 1, createdAt: -1 });
domainEventSchema.index({ processedAt: 1, createdAt: 1 });

const DomainEventModel = model<IDomainEventDocument>("DomainEvent", domainEventSchema);
export default DomainEventModel;

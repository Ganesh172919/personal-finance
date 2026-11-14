import { Schema, model, Document, Types } from "mongoose";

// Defines the permissible state values for an external integration connection.
// Represents lifecycle states including active connectivity, synchronization, or error conditions.
// Used by background sync routines and status reporting endpoints across connectors.
export type IntegrationConnectionStatus = "connected" | "syncing" | "error" | "disconnected";

// Defines the core properties for an external service integration record.
// Holds organization ownership, connector identification, error state, and configuration metadata.
// Serves as the domain model for third-party service link management.
export interface IIntegrationConnection {
  orgId: Types.ObjectId;
  connectorKey: string;
  status: IntegrationConnectionStatus;
  lastSyncAt?: Date;
  lastError?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Combines the integration connection attributes with Mongoose Document properties.
// Provides typed access to primary keys, timestamps, and ODM helper capabilities.
// Represents the actual persisted MongoDB document structure for active integrations.
export interface IIntegrationConnectionDocument extends IIntegrationConnection, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema for external integration connection entities.
// Enforces validation rules on connector identifiers, status enums, and error descriptions.
// Enables automatic timestamp management for creation and update intervals.
const integrationConnectionSchema = new Schema<IIntegrationConnectionDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    connectorKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    status: {
      type: String,
      enum: ["connected", "syncing", "error", "disconnected"],
      required: true,
      default: "disconnected",
    },
    lastSyncAt: { type: Date },
    lastError: { type: String, trim: true, maxlength: 400 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Configures compound database indexes for organization-scoped connector lookups.
// Enforces uniqueness per connector per tenant to prevent duplicate connection links.
// Accelerates filtered status queries and sorting by recent update times.
integrationConnectionSchema.index({ orgId: 1, connectorKey: 1 }, { unique: true });
integrationConnectionSchema.index({ orgId: 1, status: 1, updatedAt: -1 });

// Compiles and exports the Mongoose model for integration connection records.
// Provides data access methods to query, update, or disconnect external connectors.
// Serves as the primary persistence layer for financial integration workflows.
const IntegrationConnectionModel = model<IIntegrationConnectionDocument>(
  "IntegrationConnection",
  integrationConnectionSchema
);
export default IntegrationConnectionModel;

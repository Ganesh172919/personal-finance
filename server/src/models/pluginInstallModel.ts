import { Schema, model, Document, Types } from "mongoose";

// Defines status values representing the active state of an installed plugin.
// Distinguishes between active runtime enablement and tenant-disabled states.
// Controls whether plugin hooks and background workers run within a tenant scope.
export type PluginInstallStatus = "installed" | "disabled";

// Defines the domain attributes for an installed plugin record within an organization.
// Captures installed version, granted permissions, user audit tracking, and configuration.
// Authorizes third-party capabilities and runtime execution inside tenant workflows.
export interface IPluginInstall {
  orgId: Types.ObjectId;
  pluginKey: string;
  version: string;
  status: PluginInstallStatus;
  permissionsGranted: string[];
  installedByUserId?: Types.ObjectId;
  updatedByUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Merges plugin installation domain attributes with standard Mongoose Document methods.
// Exposes database primary keys, lifecycle management methods, and timestamp fields.
// Represents a persistent plugin installation document returned by settings queries.
export interface IPluginInstallDocument extends IPluginInstall, Document {
  _id: Types.ObjectId;
}

// Configures the Mongoose schema mapping for the installed plugin collection.
// Enforces validation rules on plugin keys, installed semver strings, and permissions.
// Automatically manages creation and modification timestamps across plugin changes.
const pluginInstallSchema = new Schema<IPluginInstallDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    pluginKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    version: { type: String, required: true, trim: true, maxlength: 40 },
    status: { type: String, enum: ["installed", "disabled"], required: true, default: "installed", index: true },
    permissionsGranted: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
    installedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: false },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: false },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Configures compound database indexes for organization plugin installation lookups.
// Enforces unique plugin installation per tenant to prevent duplicate plugin bindings.
// Optimizes filtered queries for enabled plugins ordered by recent updates.
pluginInstallSchema.index({ orgId: 1, pluginKey: 1 }, { unique: true });
pluginInstallSchema.index({ orgId: 1, status: 1, updatedAt: -1 });

// Compiles and exports the Mongoose model for organization plugin installations.
// Exposes data access methods to install, configure, disable, or remove plugins.
// Serves as the persistence layer for extensible app integrations in the workspace.
const PluginInstallModel = model<IPluginInstallDocument>("PluginInstall", pluginInstallSchema);
export default PluginInstallModel;

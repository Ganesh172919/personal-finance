import { Schema, model, Document, Types } from "mongoose";

export type PluginInstallStatus = "installed" | "disabled";

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

export interface IPluginInstallDocument extends IPluginInstall, Document {
  _id: Types.ObjectId;
}

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

pluginInstallSchema.index({ orgId: 1, pluginKey: 1 }, { unique: true });
pluginInstallSchema.index({ orgId: 1, status: 1, updatedAt: -1 });

const PluginInstallModel = model<IPluginInstallDocument>("PluginInstall", pluginInstallSchema);
export default PluginInstallModel;

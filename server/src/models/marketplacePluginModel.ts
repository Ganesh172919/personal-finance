import { Schema, model, Document } from "mongoose";

export type MarketplacePluginStatus = "active" | "preview" | "deprecated";
export type MarketplacePricingModel = "free" | "paid";

export interface IMarketplacePlugin {
  pluginKey: string;
  name: string;
  description: string;
  publisher: string;
  status: MarketplacePluginStatus;
  latestVersion: string;
  availableVersions: string[];
  permissions: string[];
  pricingModel: MarketplacePricingModel;
  priceMonthlyUsd?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMarketplacePluginDocument extends IMarketplacePlugin, Document {}

const marketplacePluginSchema = new Schema<IMarketplacePluginDocument>(
  {
    pluginKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 120, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    publisher: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ["active", "preview", "deprecated"], required: true, default: "active" },
    latestVersion: { type: String, required: true, trim: true, maxlength: 40 },
    availableVersions: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      default: [],
      validate: {
        validator: (versions: string[]) => versions.length > 0,
        message: "availableVersions must include at least one version",
      },
    },
    permissions: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
    pricingModel: { type: String, enum: ["free", "paid"], required: true, default: "free" },
    priceMonthlyUsd: { type: Number, min: 0 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

marketplacePluginSchema.index({ status: 1, updatedAt: -1 });

const MarketplacePluginModel = model<IMarketplacePluginDocument>("MarketplacePlugin", marketplacePluginSchema);
export default MarketplacePluginModel;

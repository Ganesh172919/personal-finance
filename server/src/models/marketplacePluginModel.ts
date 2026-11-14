import { Schema, model, Document } from "mongoose";

// Defines status and pricing classifications for ecosystem marketplace plugins.
// Distinguishes between active, preview, or deprecated plugins, as well as free and paid models.
// Used for marketplace directory listing, entitlement verification, and catalog moderation.
export type MarketplacePluginStatus = "active" | "preview" | "deprecated";
export type MarketplacePricingModel = "free" | "paid";

// Defines the catalog metadata schema for extensible marketplace plugins.
// Captures plugin keys, version history, publisher identity, security permissions, and pricing.
// Acts as the authoritative specification of third-party capabilities available to tenants.
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

// Extends the marketplace plugin interface with standard Mongoose Document properties.
// Enables typed database manipulation, validation hooks, and schema timestamps.
// Represents a persisted marketplace plugin entry within the MongoDB catalog collection.
export interface IMarketplacePluginDocument extends IMarketplacePlugin, Document {}

// Configures the Mongoose schema for the marketplace plugin registry collection.
// Enforces version array non-emptiness, key formatting, description limits, and price bounds.
// Automatically manages document creation and modification timestamps on all write operations.
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

// Configures a compound database index on plugin lifecycle status and update timestamps.
// Accelerates directory browsing, active plugin filtering, and recently-updated listings.
// Supports high-throughput reads on the public marketplace discovery endpoints.
marketplacePluginSchema.index({ status: 1, updatedAt: -1 });

// Compiles and exports the Mongoose model for marketplace catalog plugins.
// Exposes ODM methods to publish, update, deprecate, and search available extensions.
// Serves as the core data layer for the extensible plugin ecosystem and app store.
const MarketplacePluginModel = model<IMarketplacePluginDocument>("MarketplacePlugin", marketplacePluginSchema);
export default MarketplacePluginModel;

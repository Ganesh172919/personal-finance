import { Schema, model, Document, Types } from "mongoose";

export type OrganizationType = "personal" | "team";

export interface IOrganization {
  name: string;
  slug: string;
  type: OrganizationType;
  createdByUserId: Types.ObjectId;
  currency: string;
  locale: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganizationDocument extends IOrganization, Document {
  _id: Types.ObjectId;
}

const organizationSchema = new Schema<IOrganizationDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80, unique: true },
    type: { type: String, enum: ["personal", "team"], required: true, default: "personal" },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: "USD" },
    locale: { type: String, required: true, trim: true, maxlength: 50, default: "en-US" },
    timezone: { type: String, required: true, trim: true, maxlength: 80, default: "UTC" },
  },
  { timestamps: true }
);

organizationSchema.index({ createdByUserId: 1, createdAt: -1 });

const OrganizationModel = model<IOrganizationDocument>("Organization", organizationSchema);
export default OrganizationModel;

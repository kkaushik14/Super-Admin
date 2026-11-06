import mongoose, { Schema } from "mongoose";
export interface AdminRecord {
  email: string;
  subject: string;
  provider: "google" | "dev-test";
  active: boolean;
  sessionVersion: number;
}
const schema = new Schema<AdminRecord>(
  {
    email: { type: String, required: true },
    subject: { type: String, required: true },
    provider: { type: String, enum: ["google", "dev-test"], required: true },
    active: { type: Boolean, default: true },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);
schema.index({ provider: 1, email: 1 }, { unique: true });
schema.index({ provider: 1, subject: 1 }, { unique: true });
export default (mongoose.models.Admin as mongoose.Model<AdminRecord>) ||
  mongoose.model<AdminRecord>("Admin", schema);

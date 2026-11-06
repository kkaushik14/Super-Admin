import mongoose, { Schema } from "mongoose";
export interface SessionRecord {
  digest: string;
  adminId: string;
  provider: string;
  sessionVersion: number;
  expiresAt: Date;
  credentialVersion: string;
  authenticatedAt: number;
  authenticationClaim: "present" | "missing" | "invalid" | "unknown";
}
const schema = new Schema<SessionRecord>(
  {
    digest: { type: String, required: true, unique: true },
    adminId: { type: String, required: true },
    provider: { type: String, required: true },
    sessionVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    credentialVersion: { type: String, default: "" },
    authenticatedAt: { type: Number, default: 0 },
    authenticationClaim: {
      type: String,
      enum: ["present", "missing", "invalid", "unknown"],
      default: "unknown",
    },
  },
  { versionKey: false },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ adminId: 1 });
export default (mongoose.models
  .AdminSession as mongoose.Model<SessionRecord>) ||
  mongoose.model<SessionRecord>("AdminSession", schema);

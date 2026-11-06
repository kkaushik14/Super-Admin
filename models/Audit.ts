export type Audit = {
  id: string;
  at: string;
  actor: string;
  projectId: string;
  action: string;
  target: string;
  reason: string;
  status: string;
};

import mongoose, { Schema } from "mongoose";
export type AuditRecord = Audit & { activeKey?: string };
const schema = new Schema<AuditRecord>(
  {
    id: { type: String, required: true, unique: true },
    at: { type: String, required: true },
    actor: String,
    projectId: String,
    action: String,
    target: String,
    reason: String,
    status: String,
    activeKey: String,
  },
  { id: false, versionKey: false },
);
schema.index({ at: -1 });
schema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: "string" } } },
);
export default (mongoose.models.Audit as mongoose.Model<AuditRecord>) ||
  mongoose.model<AuditRecord>("Audit", schema);

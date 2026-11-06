import mongoose, { Schema } from "mongoose";
import type { AdminAction } from "../lib/actions/policy.ts";
export interface CommandRecord {
  id: string;
  projectId: string;
  origin: string;
  environment: string;
  actor: string;
  ownerAdminId: string;
  action: AdminAction;
  target: string;
  label: string;
  reason: string;
  expectedRevision: number;
  state:
    "prepared" | "pending" | "unknown" | "succeeded" | "rejected" | "cancelled";
  createdAt: Date;
  attempts: number;
  retryBlocked?: boolean;
  activeKey?: string;
  lease?: string;
  leaseUntil?: Date;
  receipt?: {
    commandId: string;
    action: string;
    target: string;
    status: "succeeded" | "rejected";
    code: string;
    changed: boolean;
    revision: number | null;
    completedAt: string;
  };
}
const schema = new Schema<CommandRecord>(
  {
    id: { type: String, required: true, unique: true },
    projectId: { type: String, required: true },
    origin: { type: String, required: true },
    environment: { type: String, required: true },
    actor: { type: String, required: true },
    ownerAdminId: { type: String, required: true },
    action: { type: String, required: true },
    target: { type: String, required: true },
    label: { type: String, required: true },
    reason: { type: String, required: true },
    expectedRevision: { type: Number, required: true },
    state: {
      type: String,
      required: true,
      enum: [
        "prepared",
        "pending",
        "unknown",
        "succeeded",
        "rejected",
        "cancelled",
      ],
    },
    createdAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    retryBlocked: Boolean,
    activeKey: String,
    lease: String,
    leaseUntil: Date,
    receipt: { type: Schema.Types.Mixed },
  },
  { versionKey: false },
);
schema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: "string" } } },
);
schema.index({ ownerAdminId: 1, createdAt: -1 });
export default (mongoose.models
  .AdminCommand as mongoose.Model<CommandRecord>) ||
  mongoose.model<CommandRecord>("AdminCommand", schema);

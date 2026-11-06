import type { Capability } from "../lib/types.ts";
export type Project = {
  id: string;
  name: string;
  origin: string;
  environment: "production" | "staging" | "local";
  status: "not-connected" | "connected" | "unreachable" | "disconnected";
  capabilities: Capability[];
  lastChecked: string | null;
  version: string | null;
};

import mongoose, { Schema } from "mongoose";
const schema = new Schema<Project>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 80 },
    origin: { type: String, required: true },
    environment: {
      type: String,
      enum: ["production", "staging", "local"],
      required: true,
    },
    status: {
      type: String,
      enum: ["not-connected", "connected", "unreachable", "disconnected"],
      required: true,
    },
    capabilities: [String],
    lastChecked: { type: String, default: null },
    version: { type: String, default: null },
  },
  { id: false, versionKey: false },
);
export default (mongoose.models.Project as mongoose.Model<Project>) ||
  mongoose.model<Project>("Project", schema);

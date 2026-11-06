import type { Capability } from "../lib/types.ts";
export type Project = {
  id: string;
  name: string;
  origin: string;
  environment: "production" | "staging";
  status: "not-connected" | "connected" | "unreachable" | "disconnected";
  capabilities: Capability[];
  lastChecked: string | null;
  version: string | null;
};

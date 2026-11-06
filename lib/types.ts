import type { Project } from "../models/Project.ts";
import type { Audit } from "../models/Audit.ts";
export type { Project, Audit };
export const capabilities = [
  "accounts.read",
  "accounts.suspend",
  "accounts.restore",
  "accounts.revoke",
  "videos.read",
  "videos.hide",
  "videos.restore",
  "jobs.read",
  "jobs.retry",
  "blocklist.refresh",
] as const;
export type Capability = (typeof capabilities)[number];
export type Resource = {
  id: string;
  label: string;
  detail: string;
  status: string;
  revision?: number;
};
export type Snapshot = {
  projects: Project[];
  audit: Audit[];
  preview: boolean;
  actor: string;
  availableActions?: Record<string, string[]>;
};

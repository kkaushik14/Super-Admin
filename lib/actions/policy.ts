import type { Environment } from "../config/environment.ts";
import type { Project } from "../types.ts";
import { actionNames, type AdminAction } from "./contract.ts";
export { actionNames, actionApplies, type AdminAction } from "./contract.ts";
export class ActionError extends Error {}
export type ActionOwner = {
  id: string;
  email: string;
  provider: string;
  subject: string;
  authenticatedAt: number;
};
export function freshAuthentication(value: unknown, now = Date.now()) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= Math.floor(now / 1000) + 30 &&
    Math.floor(now / 1000) - value <= 300
  );
}
// Only call with the profile returned by NextAuth's verified Google OIDC callback.
export function googleAuthenticationTime(profile: unknown, now = Date.now()) {
  const value = (profile as { auth_time?: unknown } | null)?.auth_time;
  return freshAuthentication(value, now) ? (value as number) : 0;
}
export function actionConfiguration(
  p: Project,
  env: Environment = process.env,
  dispatch = true,
) {
  const prefix =
    "SUPERADMIN_PROJECT_" + p.id.toUpperCase().replaceAll("-", "_");
  const secret = env[prefix + "_WRITE_SECRET"] || "",
    keyId = env[prefix + "_WRITE_KEY_ID"] || "",
    ownerId = env[prefix + "_OWNER_ID"] || "";
  const allowed = (env[prefix + "_ACTIONS"] || "")
    .split(",")
    .map((s) => s.trim());
  if (
    (dispatch && env[prefix + "_ACTIONS_ENABLED"] !== "1") ||
    !/^[a-z][a-z0-9-]{1,39}$/.test(keyId) ||
    keyId === env[prefix + "_KEY_ID"] ||
    secret.length < 32 ||
    secret.length > 256 ||
    secret.trim() !== secret ||
    /[\r\n]/.test(secret) ||
    [env[prefix + "_SECRET"], env.SUPERADMIN_AUTH_SECRET].includes(secret) ||
    !/^google:[a-zA-Z0-9_-]{1,190}$/.test(ownerId) ||
    !allowed.length ||
    new Set(allowed).size !== allowed.length ||
    allowed.some((a) => !actionNames.includes(a as AdminAction))
  )
    throw new ActionError("Actions are not configured for this project");
  return { secret, keyId, ownerId, allowed: allowed as AdminAction[] };
}
export function requireActionOwner(
  owner: ActionOwner | null,
  p: Project,
  fresh = true,
  dispatch = true,
) {
  const config = actionConfiguration(p, process.env, dispatch);
  if (
    !owner ||
    owner.provider !== "google" ||
    "google:" + owner.subject !== config.ownerId
  )
    throw new ActionError("Verified Google owner authorization is required");
  if (fresh && !freshAuthentication(owner.authenticatedAt))
    throw new ActionError(
      "Verify your Google account again before confirming this action",
    );
  return config;
}
export function availableActions(p: Project) {
  try {
    const c = actionConfiguration(p);
    return c.allowed.filter(
      (a) => p.status === "connected" && p.capabilities.includes(a),
    );
  } catch {
    return [];
  }
}
export function validateIntent(input: Record<string, unknown>) {
  if (
    !actionNames.includes(input.action as AdminAction) ||
    typeof input.target !== "string" ||
    !/^[a-f0-9]{24}$/.test(input.target) ||
    typeof input.reason !== "string" ||
    input.reason.length > 500 ||
    input.reason.trim().length < 5 ||
    /[\u0000-\u001f\u007f]/.test(input.reason) ||
    !Number.isInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0 ||
    Number(input.expectedRevision) > 2147483646
  )
    throw new ActionError(
      "Select a current record and provide a reason of 5–500 characters",
    );
  return {
    action: input.action as AdminAction,
    target: input.target,
    reason: input.reason.trim(),
    expectedRevision: Number(input.expectedRevision),
  };
}

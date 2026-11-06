import { createHash } from "node:crypto";
import { devLoginEnabled, type Environment } from "../config/environment.ts";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function ownerEmail(env: Environment = process.env) {
  return env.SUPERADMIN_GOOGLE_OWNER_EMAIL?.trim().toLowerCase() || "";
}
export function googleIdentity(
  profile: unknown,
  env: Environment = process.env,
) {
  const p = profile as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    hd?: unknown;
  };
  if (
    !p ||
    typeof p.sub !== "string" ||
    !p.sub ||
    p.sub.length > 255 ||
    typeof p.email !== "string" ||
    p.email_verified !== true ||
    p.email.toLowerCase() !== ownerEmail(env) ||
    !ownerEmail(env)
  )
    return null;
  const pinned = env.SUPERADMIN_GOOGLE_OWNER_SUBJECT;
  if (pinned && p.sub !== pinned) return null;
  // Google must be authoritative for the email, or the owner must pin its immutable subject.
  if (
    !pinned &&
    !p.email.toLowerCase().endsWith("@gmail.com") &&
    !(
      typeof p.hd === "string" &&
      p.email.toLowerCase().endsWith("@" + p.hd.toLowerCase())
    )
  )
    return null;
  return { subject: p.sub, email: p.email.toLowerCase() };
}
export function safeRedirect(url: string, origin: string) {
  try {
    const dest = new URL(url, origin);
    return dest.origin === origin && !dest.pathname.startsWith("/api/")
      ? dest.href
      : origin;
  } catch {
    return origin;
  }
}
export function devCredentialVersion(env: Environment = process.env) {
  return devLoginEnabled(env)
    ? digest(
        (env.SUPERADMIN_DEV_EMAIL || "").toLowerCase() +
          ":" +
          env.SUPERADMIN_DEV_PASSWORD_HASH,
      )
    : "";
}

import { randomBytes } from "node:crypto";
import Admin from "../../models/Admin.ts";
import Session from "../../models/Session.ts";
import { connectToDatabase } from "../db.ts";
import { devLoginEnabled } from "../config/environment.ts";
import {
  digest,
  googleIdentity,
  ownerEmail,
  devCredentialVersion,
} from "./policy.ts";
export async function googleAdmin(profile: unknown) {
  const identity = googleIdentity(profile);
  if (!identity) return null;
  await connectToDatabase();
  let admin = await Admin.findOne({
    provider: "google",
    email: identity.email,
  });
  if (!admin) {
    try {
      admin = await Admin.create({
        ...identity,
        provider: "google",
        active: true,
        sessionVersion: 0,
      });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      admin = await Admin.findOne({
        provider: "google",
        email: identity.email,
      });
    }
  }
  if (!admin?.active || admin.subject !== identity.subject) return null;
  return admin;
}
export async function devAdmin() {
  if (!devLoginEnabled()) return null;
  await connectToDatabase();
  const email = process.env.SUPERADMIN_DEV_EMAIL!.trim().toLowerCase();
  const admin = await Admin.findOneAndUpdate(
    { provider: "dev-test", email },
    {
      $setOnInsert: {
        subject: "dev:" + digest(email),
        active: true,
        sessionVersion: 0,
      },
    },
    { upsert: true, new: true },
  );
  return admin.active ? admin : null;
}
export async function issueSession(
  adminId: string,
  provider: string,
  authenticatedAt = 0,
  authenticationClaim:
    "present" | "missing" | "invalid" | "unknown" = "unknown",
) {
  await connectToDatabase();
  const admin = await Admin.findById(adminId);
  if (!admin?.active || admin.provider !== provider)
    throw Error("Access denied");
  const token = randomBytes(32).toString("hex");
  await Session.create({
    digest: digest(token),
    adminId,
    provider,
    sessionVersion: admin.sessionVersion,
    expiresAt: new Date(Date.now() + 8 * 3600_000),
    authenticatedAt: provider === "google" ? authenticatedAt : 0,
    authenticationClaim:
      provider === "google" ? authenticationClaim : "unknown",
    credentialVersion: provider === "dev-test" ? devCredentialVersion() : "",
  });
  return token;
}
export async function sessionIdentity(token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  await connectToDatabase();
  const session = await Session.findOne({
    digest: digest(token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) return null;
  const admin = await Admin.findById(session.adminId).lean();
  if (
    !admin?.active ||
    admin.sessionVersion !== session.sessionVersion ||
    admin.provider !== session.provider
  )
    return null;
  if (admin.provider === "google") {
    if (
      admin.email !== ownerEmail() ||
      (process.env.SUPERADMIN_GOOGLE_OWNER_SUBJECT &&
        admin.subject !== process.env.SUPERADMIN_GOOGLE_OWNER_SUBJECT)
    )
      return null;
  } else if (
    !devLoginEnabled() ||
    session.credentialVersion !== devCredentialVersion()
  )
    return null;
  return {
    id: String(admin._id),
    email: admin.email,
    provider: admin.provider,
    subject: admin.subject,
    authenticatedAt: session.authenticatedAt || 0,
    authenticationClaim: session.authenticationClaim || "unknown",
  };
}
export async function revokeSession(token: unknown) {
  if (typeof token !== "string") return;
  await connectToDatabase();
  await Session.deleteOne({ digest: digest(token) });
}

import { createHash, createHmac, randomUUID } from "node:crypto";

export type ReadIdentity = {
  projectId: string;
  environment: "local" | "staging" | "production";
  audience: string;
  keyId: string;
};
/** Signature v2 is independent of the resource API's v1 version. */
export function signedReadHeaders(
  identity: ReadIdentity,
  path: string,
  secret: string,
  time = String(Math.floor(Date.now() / 1000)),
  nonce: string = randomUUID(),
) {
  if (
    !/^[a-z][a-z0-9-]{1,39}$/.test(identity.keyId) ||
    secret.length < 32 ||
    secret.length > 256 ||
    secret.trim() !== secret ||
    !/^\/api\/admin\/v1\/(manifest|accounts|videos|jobs)$/.test(path)
  )
    throw Error("Read-only project credential or resource is not configured");
  const payload = JSON.stringify([
    "reelogram-admin",
    "2",
    "read",
    identity.projectId,
    identity.environment,
    identity.audience,
    identity.keyId,
    "GET",
    path,
    time,
    nonce,
    createHash("sha256").update("").digest("hex"),
  ]);
  return {
    "X-Admin-Version": "2",
    "X-Admin-Scope": "read",
    "X-Admin-Project": identity.projectId,
    "X-Admin-Environment": identity.environment,
    "X-Admin-Audience": identity.audience,
    "X-Admin-Key-Id": identity.keyId,
    "X-Admin-Time": time,
    "X-Admin-Nonce": nonce,
    "X-Admin-Signature": createHmac("sha256", secret)
      .update(payload)
      .digest("hex"),
  };
}

import { createHash, createHmac, randomUUID } from "node:crypto";
import type { ReadIdentity } from "./admin-signature.ts";
export function signedActionHeaders(
  identity: ReadIdentity,
  method: "GET" | "POST",
  path: string,
  body: string,
  secret: string,
  time = String(Math.floor(Date.now() / 1000)),
  nonce = randomUUID(),
) {
  if (
    method === "POST"
      ? path !== "/api/admin/v1/actions"
      : !/^\/api\/admin\/v1\/actions\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          path,
        ) || body !== ""
  )
    throw Error("Unsupported action endpoint");
  const payload = JSON.stringify([
    "reelogram-admin",
    "2",
    "actions",
    identity.projectId,
    identity.environment,
    identity.audience,
    identity.keyId,
    method,
    path,
    time,
    nonce,
    createHash("sha256").update(body).digest("hex"),
  ]);
  return {
    "Content-Type": "application/json",
    "X-Admin-Version": "2",
    "X-Admin-Scope": "actions",
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

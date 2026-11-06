import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { appOrigin, authConfigured } from "../config/environment.ts";
import { sessionIdentity } from "../auth/accounts.ts";
export async function actionSession(request: NextRequest) {
  if (!authConfigured()) return null;
  const token = await getToken({
    req: request,
    secret: process.env.SUPERADMIN_AUTH_SECRET,
    cookieName:
      (appOrigin().startsWith("https:") ? "__Secure-" : "") +
      "superadmin.session-token",
  });
  const owner = await sessionIdentity(token?.sid);
  return owner?.provider === "google" ? owner : null;
}

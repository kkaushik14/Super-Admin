import { getServerSession } from "next-auth";
import { authOptions } from "./auth-opt";
import { appOrigin, authConfigured } from "./config/environment";
export async function actor() {
  if (!authConfigured()) return null;
  const session = await getServerSession(authOptions());
  return session?.user?.email || null;
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    throw Error("Request origin rejected");
}

import { readBody } from "@/lib/request";
import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-opt";
import { authConfigured } from "@/lib/config/environment";
import { rateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  if (!authConfigured())
    return NextResponse.json(
      { error: "Administrator sign-in is not configured" },
      { status: 503 },
    );
  try {
    if (request.method === "POST") await readBody(request.clone(), 16384);
    const { nextauth } = await context.params;
    if (request.method === "POST" && nextauth[0] === "signin")
      await rateLimit("auth:start", 60);
    if (nextauth[0] === "callback") await rateLimit("auth:callback", 120);
    return await NextAuth(authOptions())(request, context);
  } catch {
    return NextResponse.json(
      { error: "Authentication is temporarily unavailable" },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST };

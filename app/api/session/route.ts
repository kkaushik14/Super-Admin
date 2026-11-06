import { readBody } from "@/lib/request";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  actor,
  consumeOtp,
  createSession,
  digest,
  sameOrigin,
  verifyPassword,
} from "@/lib/auth";
import { audit, db, rateLimit } from "@/lib/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const text = await readBody(request);
    if (text.length > 4096) throw Error();
    const { email, password, code } = JSON.parse(text);
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      typeof password !== "string" ||
      password.length > 256 ||
      typeof code !== "string"
    )
      throw Error();
    rateLimit("login:global", 60);
    rateLimit("login:" + digest(email.toLowerCase()));
    const row = db()
      .prepare("SELECT * FROM admins WHERE email=?")
      .get(email.toLowerCase()) as
      { email: string; password: string; totp: string } | undefined;
    if (
      !row ||
      !verifyPassword(password, row.password) ||
      !consumeOtp(row.email, row.totp, code)
    )
      throw Error();
    const token = createSession(row.email);
    audit(row.email, "system", "session.login", "", "", "succeeded");
    const response = NextResponse.json({ ok: true });
    response.cookies.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600,
    });
    return response;
  } catch {
    return NextResponse.json(
      {
        error:
          "Sign-in failed. Check your credentials or wait before trying again.",
      },
      { status: 401 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const c = (await cookies()).get("admin_session")?.value;
    if (c) {
      const who = actor(c);
      db().prepare("DELETE FROM sessions WHERE digest=?").run(digest(c));
      if (who) audit(who, "system", "session.logout", "", "", "succeeded");
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.delete("admin_session");
    return response;
  } catch {
    return NextResponse.json({ error: "Request rejected" }, { status: 403 });
  }
}

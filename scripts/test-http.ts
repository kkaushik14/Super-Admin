import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const require = createRequire(import.meta.url);
const { encode } = require("next-auth/jwt");
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }),
  origin = "http://localhost:3102",
  authSecret = randomBytes(32).toString("hex"),
  password = "isolated-development-password";
process.env.SUPERADMIN_MONGODB_URL = mongo.getUri();
process.env.SUPERADMIN_MONGODB_DB = "superadmin_http_test";
process.env.SUPERADMIN_GOOGLE_OWNER_EMAIL = "owner@gmail.com";
const base = {
  ...process.env,
  SUPERADMIN_APP_URL: origin,
  SUPERADMIN_AUTH_SECRET: authSecret,
  SUPERADMIN_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  SUPERADMIN_GOOGLE_CLIENT_SECRET: "test-client-secret",
  SUPERADMIN_DEV_LOGIN_ENABLED: "1",
  SUPERADMIN_DEV_EMAIL: "test@example.com",
  SUPERADMIN_DEV_PASSWORD_HASH:
    "bcrypt:" + Buffer.from(await bcrypt.hash(password, 12)).toString("base64"),
  SUPERADMIN_ALLOWED_PROJECT_HOSTS: "www.reelogram.in,example.com",
};
let server: ChildProcess | undefined,
  logs = "",
  count = 0;
const check = (a: unknown, b: unknown) => {
  assert.deepEqual(a, b);
  count++;
};
let jar = new Map<string, string>();
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  foreignOrigin?: string,
  form = false,
) {
  const response = await fetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      origin: foreignOrigin || origin,
      "Content-Type": form
        ? "application/x-www-form-urlencoded"
        : "application/json",
      cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
    },
    ...(body
      ? {
          body: form
            ? new URLSearchParams(body as Record<string, string>)
            : JSON.stringify(body),
        }
      : {}),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0],
      i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return response;
}
async function start(development: boolean) {
  logs = "";
  jar = new Map();
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      development ? "dev" : "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3102",
    ],
    {
      env: { ...base, NODE_ENV: development ? "development" : "production" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout!.on("data", (b) => (logs += b));
  server.stderr!.on("data", (b) => (logs += b));
  for (let i = 0; i < 90; i++) {
    try {
      if ((await request("/login")).status === 200) return;
    } catch {}
    if (server.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Test server failed to start: " + logs);
}
async function stop() {
  if (!server) return;
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    if (server!.exitCode !== null) resolve();
    else server!.once("exit", () => resolve());
  });
  server = undefined;
}
async function csrf() {
  return (await (await request("/api/auth/csrf")).json()).csrfToken;
}
try {
  await start(false);
  check((await request("/")).status, 307);
  check((await request("/api/control")).status, 401);
  check((await request("/api/actions")).status, 401);
  check(
    (await request("/api/actions", "POST", { mode: "prepare" })).status,
    401,
  );
  const providers = await (await request("/api/auth/providers")).json();
  check(Object.keys(providers), ["google"]);
  const html = await (await request("/login")).text();
  check(html.includes('name="password"'), false);
  check(html.includes("Authenticator code"), false);
  check(
    (
      await request("/api/session", "POST", {
        email: "test@example.com",
        password,
      })
    ).status,
    404,
  );
  const noCsrf = await request(
    "/api/auth/callback/dev-test",
    "POST",
    { email: "test@example.com", password },
    undefined,
    true,
  );
  assert(
    !noCsrf.headers
      .getSetCookie()
      .some((c) => c.startsWith("superadmin.session-token=")),
  );
  count++;
  await request("/api/auth/callback/google?code=untrusted&state=untrusted");
  check((await request("/api/control")).status, 401);
  // Synthetic Google session tests exercise the real protected HTTP paths; no claim of live OAuth completion.
  const { googleAdmin, issueSession } = await import("../lib/auth/accounts.ts");
  const admin = await googleAdmin({
    sub: "http-owner-subject",
    email: "owner@gmail.com",
    email_verified: true,
  });
  assert(admin);
  const sid = await issueSession(String(admin._id), "google");
  jar.set(
    "superadmin.session-token",
    await encode({ token: { sid }, secret: authSecret, maxAge: 3600 }),
  );
  check((await request("/api/control")).status, 200);
  check(
    (
      await request(
        "/api/control",
        "POST",
        { action: "project.disconnect", projectId: "reelogram" },
        "https://evil.com",
      )
    ).status,
    400,
  );
  check((await (await request("/api/actions")).json()).fresh, false);
  check(
    (
      await request("/api/actions", "POST", {
        mode: "prepare",
        projectId: "reelogram",
        actor: "forged",
      })
    ).status,
    400,
  );
  check(
    (
      await request(
        "/api/actions",
        "POST",
        { mode: "prepare", projectId: "reelogram" },
        "https://evil.com",
      )
    ).status,
    400,
  );
  check(
    (
      await request("/api/actions", "POST", {
        mode: "prepare",
        projectId: "reelogram",
        action: "accounts.suspend",
        target: "0123456789abcdef01234567",
        reason: "Test moderation",
        expectedRevision: 0,
      })
    ).status,
    400,
  );
  const add = {
    action: "project.add",
    projectId: "second-app",
    name: "Second app",
    origin: "https://example.com",
    environment: "staging",
  };
  check((await request("/api/control", "POST", add)).status, 200);
  check((await request("/api/control", "POST", add)).status, 400);
  check(
    (
      await request("/api/control", "POST", {
        action: "accounts.suspend",
        projectId: "reelogram",
        target: "user",
        reason: "test suspension",
      })
    ).status,
    400,
  );
  const snapshot = await (await request("/api/control")).json();
  check(snapshot.projects.length, 2);
  check(
    snapshot.projects.find((p: { id: string }) => p.id === "reelogram").status,
    "not-connected",
  );
  const { default: Admin } = await import("../models/Admin.ts");
  await Admin.updateOne({ _id: admin._id }, { $set: { active: false } });
  check((await request("/api/control")).status, 401);
  check((await request("/api/actions")).status, 401);
  await stop();
  await start(true);
  const devProviders = await (await request("/api/auth/providers")).json();
  check(Object.keys(devProviders).sort(), ["dev-test", "google"]);
  const bad = await request(
    "/api/auth/callback/dev-test",
    "POST",
    {
      csrfToken: await csrf(),
      email: "test@example.com",
      password: "wrong",
      json: "true",
    },
    undefined,
    true,
  );
  assert((await bad.json()).url.includes("CredentialsSignin"));
  count++;
  const login = await request(
    "/api/auth/callback/dev-test",
    "POST",
    {
      csrfToken: await csrf(),
      email: "test@example.com",
      password,
      json: "true",
      callbackUrl: origin,
    },
    undefined,
    true,
  );
  const loginBody = await login.json();
  assert(!loginBody.url.includes("error"), JSON.stringify(loginBody));
  count++;
  check((await request("/api/control")).status, 200);
  check(
    (await request("/api/actions", "POST", { mode: "prepare" })).status,
    401,
  );
  const user = await (await request("/api/auth/session")).json();
  check(user.user.email, "test@example.com");
  assert(jar.get("superadmin.session-token"));
  count++;
  await request(
    "/api/auth/signout",
    "POST",
    { csrfToken: await csrf(), json: "true" },
    undefined,
    true,
  );
  check((await request("/api/control")).status, 401);
  console.log(
    `Passed ${count} HTTP checks: production Google-only access, blocked callbacks, development credentials, MongoDB authorization and logout.`,
  );
  if (process.argv.includes("--review")) {
    console.log(
      "Temporary UI review: http://localhost:3102 — test@example.com / isolated-development-password",
    );
    await new Promise<void>((resolve) => {
      process.once("SIGINT", () => resolve());
      process.once("SIGTERM", () => resolve());
    });
  }
} finally {
  await stop();
  await mongoose.disconnect();
  await mongo.stop();
}

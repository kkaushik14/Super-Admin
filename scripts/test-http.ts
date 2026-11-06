import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.ADMIN_DATA_DIR = mkdtempSync(join(tmpdir(), "super-admin-http-"));
const { db } = await import("../lib/store.ts");
const { hashPassword, otp } = await import("../lib/auth.ts");
const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  password = "isolated-test-password-only";
db()
  .prepare("INSERT INTO admins(email,password,totp) VALUES(?,?,?)")
  .run("test@example.com", hashPassword(password), secret);
const origin = "http://localhost:3102";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3102",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      ADMIN_ORIGIN: origin,
      ADMIN_PREVIEW: "1",
      ADMIN_ALLOWED_PROJECT_HOSTS: "www.reelogram.in,example.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (b) => (logs += b));
server.stderr.on("data", (b) => (logs += b));
let count = 0;
const check = (a: unknown, b: unknown) => {
  assert.equal(a, b);
  count++;
};
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  requestOrigin = origin,
) {
  return fetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      origin: requestOrigin,
      "Content-Type": "application/json",
      cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
try {
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      if ((await request("/login")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("Test server did not start: " + logs);
  check((await request("/")).status, 307);
  check((await request("/api/control")).status, 401);
  check(
    (
      await request("/api/control", "POST", {
        action: "project.disconnect",
        projectId: "reelogram",
      })
    ).status,
    401,
  );
  check(
    (
      await request("/api/session", "POST", {
        email: "test@example.com",
        password: "wrong",
        code: otp(secret),
      })
    ).status,
    401,
  );
  const login = await request("/api/session", "POST", {
    email: "test@example.com",
    password,
    code: otp(secret),
  });
  check(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  assert(login.headers.get("set-cookie")!.includes("HttpOnly"));
  assert(login.headers.get("set-cookie")!.includes("Secure"));
  count += 2;
  check(
    (
      await request("/api/session", "POST", {
        email: "test@example.com",
        password,
        code: otp(secret),
      })
    ).status,
    401,
  );
  check((await request("/api/control", "GET", undefined, cookie)).status, 200);
  check(
    (
      await request(
        "/api/control",
        "POST",
        { action: "project.disconnect", projectId: "reelogram" },
        cookie,
        "https://evil.com",
      )
    ).status,
    400,
  );
  check(
    (
      await request(
        "/api/control",
        "POST",
        {
          action: "accounts.suspend",
          projectId: "reelogram",
          target: "user",
          reason: "test suspension",
        },
        cookie,
      )
    ).status,
    400,
  );
  check(
    (
      await request(
        "/api/control",
        "POST",
        {
          action: "project.add",
          projectId: "internal",
          name: "Internal",
          origin: "https://127.0.0.1",
          environment: "production",
        },
        cookie,
      )
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
  check((await request("/api/control", "POST", add, cookie)).status, 200);
  check((await request("/api/control", "POST", add, cookie)).status, 400);
  check(
    (
      await request(
        "/api/control",
        "POST",
        { action: "project.disconnect", projectId: "second-app" },
        cookie,
      )
    ).status,
    200,
  );
  const snapshot = await (
    await request("/api/control", "GET", undefined, cookie)
  ).json();
  check(snapshot.projects.length, 2);
  check(
    snapshot.projects.find((p: { id: string }) => p.id === "reelogram").status,
    "not-connected",
  );
  check(
    snapshot.projects.find((p: { id: string }) => p.id === "second-app").status,
    "disconnected",
  );
  assert(
    snapshot.audit.some((a: { action: string }) => a.action === "project.add"),
  );
  count++;
  check(
    (await request("/api/session", "DELETE", undefined, cookie)).status,
    200,
  );
  check((await request("/api/control", "GET", undefined, cookie)).status, 401);
  console.log(
    `Passed ${count} production HTTP checks with an isolated database.`,
  );
} finally {
  server.kill("SIGTERM");
  await new Promise<void>((r) => {
    if (server.exitCode !== null) r();
    else server.once("exit", () => r());
  });
  db().close();
  rmSync(process.env.ADMIN_DATA_DIR!, { recursive: true, force: true });
}

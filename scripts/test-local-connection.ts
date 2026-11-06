import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { devLoginEnabled } from "../lib/config/environment.ts";
import { localProjectOrigin } from "../lib/connector.ts";

import { signedReadHeaders } from "../lib/integrations/admin-signature.ts";

// Explicitly targets the two development servers; never a deployed origin.
Object.assign(process.env, { NODE_ENV: "development" });
nextEnv.loadEnvConfig(process.cwd(), true);
const origin = "http://localhost:3100",
  projectOrigin = "http://localhost:3000",
  projectId = "reelogram-local";
assert.equal(process.env.SUPERADMIN_APP_URL, origin);
assert.equal(localProjectOrigin(), projectOrigin);
assert(devLoginEnabled());
assert.equal(process.env.SUPERADMIN_MONGODB_DB, "superadmin_development");
const credentials = JSON.parse(
  await readFile(".data/local-test-account.json", "utf8"),
);
assert.equal(credentials.email, process.env.SUPERADMIN_DEV_EMAIL);
let count = 0;
const check = (actual: unknown, expected: unknown) => {
  assert.deepEqual(actual, expected);
  count++;
};
const jar = new Map<string, string>();
async function request(
  path: string,
  body?: Record<string, string>,
  form = false,
  foreignOrigin?: string,
) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    headers: {
      origin: foreignOrigin || origin,
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      "Content-Type": form
        ? "application/x-www-form-urlencoded"
        : "application/json",
    },
    ...(body
      ? { body: form ? new URLSearchParams(body) : JSON.stringify(body) }
      : {}),
  });
  for (const cookie of r.headers.getSetCookie()) {
    const pair = cookie.split(";")[0],
      i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return r;
}
async function csrf() {
  return (await (await request("/api/auth/csrf")).json()).csrfToken;
}
function signedHeaders(secret: string) {
  return signedReadHeaders(
    {
      projectId,
      environment: "local",
      audience: projectOrigin,
      keyId: process.env.SUPERADMIN_PROJECT_REELOGRAM_LOCAL_KEY_ID!,
    },
    "/api/admin/v1/manifest",
    secret,
  );
}

try {
  check((await request("/api/control")).status, 401);
  check((await fetch(projectOrigin + "/api/admin/v1/manifest")).status, 404);
  check(
    (
      await fetch(projectOrigin + "/api/admin/v1/manifest", {
        headers: signedHeaders("incorrect-key".repeat(4)),
      })
    ).status,
    404,
  );
  const headers = signedHeaders(
    process.env.SUPERADMIN_PROJECT_REELOGRAM_LOCAL_SECRET!,
  );
  const manifest = await fetch(projectOrigin + "/api/admin/v1/manifest", {
    headers,
  });
  check(manifest.status, 200);
  check((await manifest.json()).capabilities, [
    "accounts.read",
    "videos.read",
    "jobs.read",
  ]);
  check(
    (await fetch(projectOrigin + "/api/admin/v1/manifest", { headers })).status,
    404,
  );
  check(
    (
      await fetch(projectOrigin + "/api/admin/v1/actions", {
        method: "POST",
        headers,
      })
    ).status,
    404,
  );
  const login = await request(
    "/api/auth/callback/dev-test",
    {
      ...credentials,
      csrfToken: await csrf(),
      json: "true",
      callbackUrl: origin,
    },
    true,
  );
  const result = await login.json();
  assert(!result.url.includes("error"), "Development sign-in failed");
  count++;
  check((await request("/api/control")).status, 200);
  const before = await (await request("/api/control")).json();
  const productionBefore = before.projects.find(
    (p: { id: string }) => p.id === "reelogram",
  );
  const local = before.projects.find((p: { id: string }) => p.id === projectId);
  if (!local)
    check(
      (
        await request("/api/control", {
          action: "project.add",
          projectId,
          name: "ReeloGram Local",
          origin: projectOrigin,
          environment: "local",
        })
      ).status,
      200,
    );
  else {
    check(local.origin, projectOrigin);
    check(local.environment, "local");
  }
  const connection = await request("/api/control", {
    action: "project.check",
    projectId,
  });
  const connectionResult = await connection.json();
  assert.equal(connection.status, 200, connectionResult.error);
  count++;
  for (const resource of ["accounts", "videos", "jobs"]) {
    const r = await request(
        `/api/control?project=${projectId}&resource=${resource}`,
      ),
      body = await r.json();
    assert.equal(r.status, 200, body.error);
    count++;
    assert(Array.isArray(body.items) && body.items.length <= 100);
    count++;
    for (const item of body.items)
      check(Object.keys(item).sort(), ["detail", "id", "label", "status"]);
    console.log(`${resource}: ${body.items.length} read-only summaries loaded`);
  }
  check(
    (
      await request("/api/control", {
        action: "accounts.suspend",
        projectId,
        target: "test-denied",
        reason: "Verify read-only access",
      })
    ).status,
    400,
  );
  check(
    (
      await request(
        "/api/control",
        { action: "project.check", projectId },
        false,
        "https://example.invalid",
      )
    ).status,
    400,
  );
  const after = await (await request("/api/control")).json();
  check(
    after.projects.find((p: { id: string }) => p.id === "reelogram"),
    productionBefore,
  );
  check(
    after.projects.find((p: { id: string }) => p.id === projectId).status,
    "connected",
  );
  // Verify OAuth initiation, without claiming completion of Google's interactive login.
  const google = await (
    await request(
      "/api/auth/signin/google",
      { csrfToken: await csrf(), json: "true", callbackUrl: origin },
      true,
    )
  ).json();
  const url = new URL(google.url);
  check(url.hostname, "accounts.google.com");
  check(
    url.searchParams.get("redirect_uri"),
    origin + "/api/auth/callback/google",
  );
  for (const key of ["state", "nonce", "code_challenge"]) {
    assert(url.searchParams.get(key));
    count++;
  }
} finally {
  await request(
    "/api/auth/signout",
    { csrfToken: await csrf(), json: "true" },
    true,
  );
}
check((await request("/api/control")).status, 401);
console.log(
  `Passed ${count} local connection checks. Production project unchanged; test session revoked.`,
);

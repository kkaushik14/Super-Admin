import { test } from "node:test";
import assert from "node:assert/strict";
import {
  devLoginEnabled,
  databaseConfiguration,
  appOrigin,
} from "../lib/config/environment.ts";
import { googleIdentity, safeRedirect } from "../lib/auth/policy.ts";
import {
  validateOrigin,
  privateAddress,
  manifest,
  resourceList,
} from "../lib/connector.ts";
import {
  signedReadHeaders,
  type ReadIdentity,
} from "../lib/integrations/admin-signature.ts";
import { readBody } from "../lib/request.ts";
const dev = {
  NODE_ENV: "development",
  SUPERADMIN_APP_URL: "http://localhost:3100",
  SUPERADMIN_DEV_LOGIN_ENABLED: "1",
  SUPERADMIN_DEV_EMAIL: "test@example.com",
  SUPERADMIN_DEV_PASSWORD_HASH:
    "bcrypt:" + Buffer.from("$2b$12$" + "x".repeat(53)).toString("base64"),
};
test("development credentials require all local-only gates", () => {
  assert(devLoginEnabled(dev));
  for (const overrides of [
    { NODE_ENV: "production" },
    { NODE_ENV: "test" },
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { SUPERADMIN_DEV_LOGIN_ENABLED: "0" },
    { SUPERADMIN_APP_URL: "https://admin.example.com" },
    { SUPERADMIN_DEV_PASSWORD_HASH: "" },
  ])
    assert(!devLoginEnabled({ ...dev, ...overrides }));
});
test("Google owner must be verified and match exact allowlist and immutable subject", () => {
  const env = { SUPERADMIN_GOOGLE_OWNER_EMAIL: "owner@gmail.com" };
  const p = { sub: "12345", email: "owner@gmail.com", email_verified: true };
  assert(googleIdentity(p, env));
  for (const override of [
    { email_verified: false },
    { email_verified: "true" },
    { email: "other@gmail.com" },
    { email: "owner@gmail.com.evil.com" },
    { sub: "" },
    { sub: 123 },
  ])
    assert.equal(googleIdentity({ ...p, ...override }, env), null);
  assert.equal(
    googleIdentity(p, { ...env, SUPERADMIN_GOOGLE_OWNER_SUBJECT: "different" }),
    null,
  );
  assert.equal(googleIdentity(p, {}), null);
  assert.equal(
    googleIdentity(
      { ...p, email: "owner@example.com" },
      { SUPERADMIN_GOOGLE_OWNER_EMAIL: "owner@example.com" },
    ),
    null,
  );
  assert(
    googleIdentity(
      { ...p, email: "owner@example.com", hd: "example.com" },
      { SUPERADMIN_GOOGLE_OWNER_EMAIL: "owner@example.com" },
    ),
  );
});
test("database configuration cannot silently reuse ReeloGram", () => {
  assert.throws(() =>
    databaseConfiguration({
      REELOGRAM_MONGODB_URL: "mongodb://localhost/reelogram",
    }),
  );
  assert.throws(() =>
    databaseConfiguration({
      SUPERADMIN_MONGODB_URL: "mongodb://localhost",
      SUPERADMIN_MONGODB_DB: "reelogram",
    }),
  );
  assert.deepEqual(
    databaseConfiguration({
      SUPERADMIN_MONGODB_URL: "mongodb://localhost",
      SUPERADMIN_MONGODB_DB: "superadmin_test",
    }),
    { uri: "mongodb://localhost", dbName: "superadmin_test" },
  );
});
test("origins and redirects cannot be chosen by an untrusted host", () => {
  assert.throws(() => appOrigin({ SUPERADMIN_APP_URL: "http://evil.com" }));
  assert.throws(() => appOrigin({ SUPERADMIN_APP_URL: "https://a.com/path" }));
  assert.equal(
    safeRedirect("https://evil.com", "https://admin.example.com"),
    "https://admin.example.com",
  );
  assert.equal(
    safeRedirect("//evil.com", "https://admin.example.com"),
    "https://admin.example.com",
  );
  assert.equal(
    safeRedirect("/api/auth/signin", "https://admin.example.com"),
    "https://admin.example.com",
  );
  assert.equal(
    safeRedirect("/", "https://admin.example.com"),
    "https://admin.example.com/",
  );
});
test("project enrollment rejects internal and unapproved destinations", () => {
  process.env.SUPERADMIN_ALLOWED_PROJECT_HOSTS = "www.reelogram.in";
  assert.equal(
    validateOrigin("https://www.reelogram.in"),
    "https://www.reelogram.in",
  );
  for (const url of [
    "http://www.reelogram.in",
    "https://www.reelogram.in:444",
    "https://www.reelogram.in/path",
    "https://evil.com",
    "https://127.0.0.1",
    "https://user:pass@www.reelogram.in",
  ])
    assert.throws(() => validateOrigin(url));
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.20.1.1",
    "::1",
  ])
    assert(privateAddress(ip));
  assert(!privateAddress("8.8.8.8"));
});
test("read signatures bind project, environment, audience, key and path", () => {
  const identity: ReadIdentity = {
    projectId: "reelogram",
    environment: "production" as const,
    audience: "https://www.reelogram.in",
    keyId: "key-one",
  };
  const sign = (
    i = identity,
    path = "/api/admin/v1/accounts",
    time = "1793920000",
    nonce = "nonce",
  ) =>
    signedReadHeaders(i, path, "a".repeat(64), time, nonce)[
      "X-Admin-Signature"
    ];
  const good = sign();
  for (const patch of [
    { projectId: "other" },
    { environment: "staging" as const },
    { audience: "https://other.example" },
    { keyId: "key-two" },
  ])
    assert.notEqual(sign({ ...identity, ...patch }), good);
  assert.notEqual(sign(identity, "/api/admin/v1/videos"), good);
  assert.notEqual(sign(identity, "/api/admin/v1/accounts", "1793920001"), good);
  assert.notEqual(
    sign(identity, "/api/admin/v1/accounts", "1793920000", "other"),
    good,
  );
  for (const path of ["/api/admin/v1/actions", "/api/admin/v1/accounts?x=1"])
    assert.throws(() => sign(identity, path));
});
test("manifest and resource validation reject privilege expansion", () => {
  assert.deepEqual(
    manifest(
      { projectId: "reelogram", version: "1", capabilities: ["accounts.read"] },
      "reelogram",
    ).capabilities,
    ["accounts.read"],
  );
  assert.throws(() =>
    manifest(
      { projectId: "other", version: "1", capabilities: [] },
      "reelogram",
    ),
  );
  assert.throws(() =>
    manifest(
      { projectId: "reelogram", version: "1", capabilities: ["shell.execute"] },
      "reelogram",
    ),
  );
  assert.throws(() => resourceList({ items: [{ id: "x" }] }));
});
test("request streaming enforces a bound", async () => {
  await assert.rejects(() =>
    readBody(
      new Request("http://localhost", {
        method: "POST",
        body: "a".repeat(9000),
      }),
    ),
  );
  assert.equal(
    await readBody(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    ),
    "{}",
  );
});

test("local connector is exact-origin, development-only and read-only", async () => {
  const { localProjectOrigin, validateProjectConnection, callProject } =
    await import("../lib/connector.ts");
  const env = {
    NODE_ENV: "development",
    SUPERADMIN_APP_URL: "http://localhost:3100",
    SUPERADMIN_LOCAL_PROJECT_ORIGIN: "http://localhost:3000",
  };
  assert.equal(localProjectOrigin(env), "http://localhost:3000");
  for (const overrides of [
    { NODE_ENV: "production" },
    { NODE_ENV: "test" },
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { SUPERADMIN_APP_URL: "https://admin.example.com" },
    { SUPERADMIN_LOCAL_PROJECT_ORIGIN: "http://169.254.169.254:3000" },
    { SUPERADMIN_LOCAL_PROJECT_ORIGIN: "http://localhost:3000/path" },
  ])
    assert.equal(localProjectOrigin({ ...env, ...overrides }), null);
  const previous = { ...process.env };
  try {
    Object.assign(process.env, env);
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    const p = {
      id: "reelogram-local",
      name: "Local",
      environment: "local" as const,
      origin: env.SUPERADMIN_LOCAL_PROJECT_ORIGIN,
      status: "connected" as const,
      capabilities: [],
      lastChecked: null,
      version: "1",
    };
    assert.equal(validateOrigin(p.origin), p.origin);
    for (const origin of [
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://localhost:3000/path",
      "http://user@localhost:3000",
      "http://localhost:3000?x=1",
    ])
      assert.throws(() => validateOrigin(origin));
    assert.throws(() =>
      validateProjectConnection({ ...p, environment: "production" }),
    );
    assert.throws(() => validateProjectConnection({ ...p, id: "reelogram" }));
    assert.throws(() =>
      validateProjectConnection({ ...p, origin: "https://www.reelogram.in" }),
    );
    await assert.rejects(
      () => callProject(p, "/api/admin/v1/actions", {}),
      /read-only/,
    );
    await assert.rejects(
      () => callProject(p, "/api/admin/v1/accounts?x=1"),
      /read-only/,
    );
    Object.assign(process.env, { NODE_ENV: "production" });
    await assert.rejects(
      () => callProject(p, "/api/admin/v1/manifest"),
      /HTTPS/,
    );
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

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
  signature,
  manifest,
  resourceList,
} from "../lib/connector.ts";
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
test("connection signatures bind all request fields", () => {
  const args = [
    "secret",
    "POST",
    "/api/admin/v1/actions",
    "100",
    "nonce",
    "{}",
  ] as const;
  const good = signature(...args);
  for (let i = 1; i < args.length; i++) {
    const altered = [...args] as string[];
    altered[i] += "x";
    assert.notEqual(
      good,
      signature(
        ...(altered as [string, string, string, string, string, string]),
      ),
    );
  }
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

import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  freshAuthentication,
  googleAuthenticationTime,
  googleAuthenticationEvidence,
  validateIntent,
  actionConfiguration,
} from "../lib/actions/policy.ts";
import { signedActionHeaders } from "../lib/integrations/action-signature.ts";
import { resourceList } from "../lib/connector.ts";
import type { Project } from "../lib/types.ts";
const p = { id: "fixture" } as Project;
const env = {
  SUPERADMIN_PROJECT_FIXTURE_ACTIONS_ENABLED: "1",
  SUPERADMIN_PROJECT_FIXTURE_WRITE_KEY_ID: "write-test",
  SUPERADMIN_PROJECT_FIXTURE_KEY_ID: "read-test",
  SUPERADMIN_PROJECT_FIXTURE_SECRET: "r".repeat(64),
  SUPERADMIN_PROJECT_FIXTURE_WRITE_SECRET: "w".repeat(64),
  SUPERADMIN_PROJECT_FIXTURE_OWNER_ID: "google:subject",
  SUPERADMIN_PROJECT_FIXTURE_ACTIONS: "accounts.suspend,videos.hide",
};
test("fresh Google authentication requires verified auth_time, never token issue or client time", () => {
  const now = 1800000000000;
  assert.equal(freshAuthentication(now / 1000 - 300, now), true);
  for (const value of [
    undefined,
    0,
    "1800000000",
    now / 1000 - 301,
    now / 1000 + 31,
    NaN,
  ])
    assert.equal(freshAuthentication(value, now), false);
  assert.equal(googleAuthenticationTime({ iat: now / 1000 }, now), 0);
  assert.equal(
    googleAuthenticationTime({ auth_time: now / 1000 }, now),
    now / 1000,
  );
});
test("write credentials and allowlist fail closed and remain independent", () => {
  assert.deepEqual(actionConfiguration(p, env).allowed, [
    "accounts.suspend",
    "videos.hide",
  ]);
  for (const patch of [
    { SUPERADMIN_PROJECT_FIXTURE_ACTIONS_ENABLED: "0" },
    { SUPERADMIN_PROJECT_FIXTURE_WRITE_SECRET: "r".repeat(64) },
    { SUPERADMIN_PROJECT_FIXTURE_WRITE_KEY_ID: "read-test" },
    { SUPERADMIN_PROJECT_FIXTURE_ACTIONS: "" },
    { SUPERADMIN_PROJECT_FIXTURE_ACTIONS: "jobs.retry" },
    { SUPERADMIN_PROJECT_FIXTURE_OWNER_ID: "email@example.com" },
    { SUPERADMIN_AUTH_SECRET: "w".repeat(64) },
  ])
    assert.throws(() => actionConfiguration(p, { ...env, ...patch }));
  assert(
    actionConfiguration(
      p,
      { ...env, SUPERADMIN_PROJECT_FIXTURE_ACTIONS_ENABLED: "0" },
      false,
    ),
  );
});
test("intent validation rejects unreviewed records, operators and control text", () => {
  const valid = {
    action: "videos.hide",
    target: "0123456789abcdef01234567",
    reason: "  Confirmed policy violation  ",
    expectedRevision: 0,
  };
  assert.equal(validateIntent(valid).reason, "Confirmed policy violation");
  for (const patch of [
    { expectedRevision: -1 },
    { expectedRevision: "0" },
    { expectedRevision: 2147483647 },
    { target: { $ne: null } },
    { action: "jobs.retry" },
    { reason: "abcd" },
    { reason: "valid\nreason" },
    { reason: "a".repeat(501) },
  ])
    assert.throws(() => validateIntent({ ...valid, ...patch }));
});
test("write signature binds exact bytes, scope, audience, path, method and fresh nonce", () => {
  const body = '{"reason":"Review"}',
    time = "1800000000",
    nonce = "11111111-1111-4111-8111-111111111111",
    identity = {
      projectId: "fixture",
      environment: "production" as const,
      audience: "https://example.com",
      keyId: "write-test",
    };
  const h = signedActionHeaders(
    identity,
    "POST",
    "/api/admin/v1/actions",
    body,
    "w".repeat(64),
    time,
    nonce,
  );
  const payload = JSON.stringify([
    "reelogram-admin",
    "2",
    "actions",
    "fixture",
    "production",
    "https://example.com",
    "write-test",
    "POST",
    "/api/admin/v1/actions",
    time,
    nonce,
    createHash("sha256").update(body).digest("hex"),
  ]);
  assert.equal(
    h["X-Admin-Signature"],
    createHmac("sha256", "w".repeat(64)).update(payload).digest("hex"),
  );
  assert.notEqual(
    h["X-Admin-Signature"],
    signedActionHeaders(
      identity,
      "POST",
      "/api/admin/v1/actions",
      body + " ",
      "w".repeat(64),
      time,
      nonce,
    )["X-Admin-Signature"],
  );
  for (const path of [
    "/api/admin/v1/actions?x=1",
    "https://evil.com",
    "/api/admin/v1/accounts",
  ])
    assert.throws(() =>
      signedActionHeaders(identity, "POST", path, body, "w".repeat(64)),
    );
  assert.notEqual(
    signedActionHeaders(
      identity,
      "POST",
      "/api/admin/v1/actions",
      body,
      "w".repeat(64),
    )["X-Admin-Nonce"],
    signedActionHeaders(
      identity,
      "POST",
      "/api/admin/v1/actions",
      body,
      "w".repeat(64),
    )["X-Admin-Nonce"],
  );
});
test("resource revision is optional for legacy reads and strict when supplied", () => {
  const item = {
    id: "record",
    label: "Name",
    detail: "Detail",
    status: "active",
  };
  assert.equal(resourceList({ items: [item] }).length, 1);
  assert.equal(
    resourceList({ items: [{ ...item, revision: 0 }] })[0].revision,
    0,
  );
  for (const revision of [-1, "1", NaN, 2147483648])
    assert.throws(() => resourceList({ items: [{ ...item, revision }] }));
});

test("Google evidence distinguishes omitted claims from a real stale authentication without renewing time", () => {
  const now = 1800000000000;
  assert.deepEqual(googleAuthenticationEvidence({}, now), {
    time: 0,
    claim: "missing",
  });
  assert.deepEqual(
    googleAuthenticationEvidence({ auth_time: "1800000000" }, now),
    { time: 0, claim: "invalid" },
  );
  assert.deepEqual(
    googleAuthenticationEvidence({ auth_time: now / 1000 - 10000 }, now),
    { time: now / 1000 - 10000, claim: "present" },
  );
  assert.equal(
    freshAuthentication(
      googleAuthenticationTime({ auth_time: now / 1000 - 10000 }, now),
      now,
    ),
    false,
  );
  assert.equal(
    googleAuthenticationEvidence({ auth_time: now / 1000 + 31 }, now).claim,
    "invalid",
  );
});

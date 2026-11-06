import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.ADMIN_DATA_DIR = mkdtempSync(join(tmpdir(), "super-admin-test-"));
process.env.ADMIN_ALLOWED_PROJECT_HOSTS = "www.reelogram.in";
const { db, projects, rateLimit, audit, history, project } =
  await import("../lib/store.ts");
const {
  hashPassword,
  verifyPassword,
  otp,
  consumeOtp,
  createSession,
  actor,
  digest,
  sameOrigin,
} = await import("../lib/auth.ts");
const { validateOrigin, privateAddress, signature, manifest, resourceList } =
  await import("../lib/connector.ts");
const { readBody } = await import("../lib/request.ts");
after(() => {
  db().close();
  rmSync(process.env.ADMIN_DATA_DIR!, { recursive: true, force: true });
});
test("password hashing and authentication reject incorrect passwords", () => {
  const hash = hashPassword("very long unique test password");
  assert(verifyPassword("very long unique test password", hash));
  assert(!verifyPassword("wrong", hash));
});
test("TOTP matches RFC test vector and cannot replay a consumed code", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(otp(secret, 1), "287082");
  db()
    .prepare("INSERT INTO admins(email,password,totp) VALUES(?,?,?)")
    .run("owner@example.com", "unused", secret);
  assert(consumeOtp("owner@example.com", secret, otp(secret)));
  assert(!consumeOtp("owner@example.com", secret, otp(secret)));
  assert(!consumeOtp("owner@example.com", secret, "123"));
});
test("sessions are opaque, hashed, expire and revoke", () => {
  const token = createSession("owner@example.com");
  assert.equal(actor(token), "owner@example.com");
  assert.equal(actor("forged"), null);
  db()
    .prepare("UPDATE sessions SET expires=0 WHERE digest=?")
    .run(digest(token));
  assert.equal(actor(token), null);
  const other = createSession("owner@example.com");
  db().prepare("DELETE FROM sessions WHERE digest=?").run(digest(other));
  assert.equal(actor(other), null);
});
test("project enrollment is allowlisted and rejects internal or malformed endpoints", () => {
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
test("signatures bind method, path, timestamp, nonce and payload", () => {
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
test("manifest rejects different project identity and unknown capabilities", () => {
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
test("origin checks, bounded requests and durable throttling", async () => {
  assert.throws(() =>
    sameOrigin(
      new Request("http://localhost:3100", {
        headers: { origin: "https://evil.com" },
      }),
    ),
  );
  for (let i = 0; i < 8; i++) rateLimit("test");
  assert.throws(() => rateLimit("test"));
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
test("initial project is disconnected and unknown IDs cannot access another project", () => {
  assert.equal(projects()[0].status, "not-connected");
  assert.deepEqual(projects()[0].capabilities, []);
  assert.throws(() => project("missing"));
  audit("owner", "reelogram", "test", "record", "test reason", "succeeded");
  assert.equal(history()[0].projectId, "reelogram");
});

test("unresolved commands cannot be duplicated and terminal outcomes release the target", async () => {
  const { claimAction, finish } = await import("../lib/store.ts");
  const id = claimAction(
    "owner",
    "reelogram",
    "jobs.retry",
    "job-1",
    "retry eligible notification",
  );
  assert.throws(() =>
    claimAction(
      "owner",
      "reelogram",
      "jobs.retry",
      "job-1",
      "retry eligible notification",
    ),
  );
  finish(id, "unknown");
  assert.throws(() =>
    claimAction(
      "owner",
      "reelogram",
      "jobs.retry",
      "job-1",
      "retry eligible notification",
    ),
  );
  finish(id, "succeeded");
  assert(
    claimAction(
      "owner",
      "reelogram",
      "jobs.retry",
      "job-1",
      "retry eligible notification",
    ),
  );
});

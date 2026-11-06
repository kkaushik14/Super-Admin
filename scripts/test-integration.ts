import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.SUPERADMIN_MONGODB_URL = mongo.getUri();
process.env.SUPERADMIN_MONGODB_DB =
  "superadmin_test_" + randomUUID().replaceAll("-", "");
process.env.SUPERADMIN_GOOGLE_OWNER_EMAIL = "owner@gmail.com";
const {
  projects,
  enrollProject,
  project,
  disconnectProject,
  history,
  claimAction,
  finish,
  rateLimit,
} = await import("../lib/store.ts");
const { googleAdmin, issueSession, sessionIdentity, revokeSession } =
  await import("../lib/auth/accounts.ts");
const { default: Admin } = await import("../models/Admin.ts");
let count = 0;
const check = (a: unknown, b: unknown) => {
  assert.deepEqual(a, b);
  count++;
};
try {
  check((await projects())[0].status, "not-connected");
  const p = {
    ...(await project("reelogram")),
    id: "second-project",
    name: "Second application",
  };
  await enrollProject(p, "owner");
  check((await projects()).length, 2);
  await assert.rejects(() => enrollProject(p, "owner"));
  count++;
  check((await history()).filter((a) => a.action === "project.add").length, 1);
  await disconnectProject(p, "owner");
  check((await project("second-project")).status, "disconnected");
  check((await project("reelogram")).status, "not-connected");
  const results = await Promise.allSettled(
    Array.from({ length: 16 }, () =>
      claimAction(
        "owner",
        "reelogram",
        "jobs.retry",
        "one-job",
        "retry a failed notification",
      ),
    ),
  );
  check(results.filter((r) => r.status === "fulfilled").length, 1);
  const id = (
    results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<string>
  ).value;
  await finish(id, "unknown");
  await assert.rejects(() =>
    claimAction(
      "owner",
      "reelogram",
      "jobs.retry",
      "one-job",
      "retry a failed notification",
    ),
  );
  count++;
  await finish(id, "succeeded");
  assert(
    await claimAction(
      "owner",
      "reelogram",
      "jobs.retry",
      "one-job",
      "retry a failed notification",
    ),
  );
  count++;
  const limits = await Promise.allSettled(
    Array.from({ length: 30 }, () => rateLimit("concurrent-account", 8)),
  );
  check(limits.filter((r) => r.status === "fulfilled").length, 8);
  const profile = {
    sub: "owner-subject",
    email: "owner@gmail.com",
    email_verified: true,
  };
  const admin = await googleAdmin(profile);
  assert(admin);
  count++;
  check(await googleAdmin({ ...profile, sub: "replacement-subject" }), null);
  check(await googleAdmin({ ...profile, email: "attacker@gmail.com" }), null);
  const sid = await issueSession(String(admin._id), "google");
  check((await sessionIdentity(sid))?.email, "owner@gmail.com");
  check(await sessionIdentity("forged"), null);
  process.env.SUPERADMIN_GOOGLE_OWNER_EMAIL = "changed@gmail.com";
  check(await sessionIdentity(sid), null);
  process.env.SUPERADMIN_GOOGLE_OWNER_EMAIL = "owner@gmail.com";
  await Admin.updateOne({ _id: admin._id }, { $inc: { sessionVersion: 1 } });
  check(await sessionIdentity(sid), null);
  const next = await issueSession(String(admin._id), "google");
  await revokeSession(next);
  check(await sessionIdentity(next), null);
  await Admin.updateOne({ _id: admin._id }, { $set: { active: false } });
  check(await googleAdmin(profile), null);
  const sourceDir = mkdtempSync(join(tmpdir(), "superadmin-migration-"));
  try {
    mkdirSync(join(sourceDir, ".data"));
    const legacy = new DatabaseSync(join(sourceDir, ".data/admin.sqlite"));
    legacy.exec(
      "CREATE TABLE projects(payload TEXT); CREATE TABLE audit(id TEXT, at TEXT, actor TEXT, projectId TEXT, action TEXT, target TEXT, reason TEXT, status TEXT)",
    );
    legacy.prepare("INSERT INTO projects VALUES(?)").run(
      JSON.stringify({
        ...p,
        id: "reelogram",
        name: "Preserved legacy name",
      }),
    );
    legacy
      .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)")
      .run(
        "legacy-action",
        "2026-11-06T00:00:00.000Z",
        "owner",
        "reelogram",
        "jobs.retry",
        "job-legacy",
        "legacy reason",
        "unknown",
      );
    legacy.close();
    const args = [
      "--experimental-strip-types",
      resolve("scripts/migrate-sqlite.ts"),
    ];
    const options = {
      cwd: sourceDir,
      env: {
        ...process.env,
        SUPERADMIN_MONGODB_DB: "superadmin_migration_test",
      },
      stdio: "pipe" as const,
    };
    execFileSync(process.execPath, args, options);
    execFileSync(process.execPath, args, options);
    const migrated = mongoose.connection
      .getClient()
      .db("superadmin_migration_test");
    check(
      (await migrated.collection("projects").findOne({ id: "reelogram" }))
        ?.name,
      "Preserved legacy name",
    );
    check(await migrated.collection("audits").countDocuments(), 1);
    check(await migrated.collection("admins").countDocuments(), 0);
    assert(
      (await migrated.collection("audits").findOne({ id: "legacy-action" }))
        ?.activeKey,
    );
    count++;
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
  }
  await mongoose.disconnect();
  check((await projects()).length, 2);
  console.log(
    `Passed ${count} MongoDB integration checks: transactions, atomic rate limiting, command concurrency, Google subject pinning and session revocation.`,
  );
} finally {
  await mongoose.disconnect();
  await mongo.stop();
}

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
Object.assign(process.env, { NODE_ENV: "development" });
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
process.env.SUPERADMIN_MONGODB_URL = mongo.getUri();
process.env.SUPERADMIN_MONGODB_DB = "superadmin_commands_test";
process.env.SUPERADMIN_APP_URL = "http://localhost:3102";
const prefix = "SUPERADMIN_PROJECT_FIXTURE_LOCAL";
const readSecret = randomBytes(32).toString("hex"),
  writeSecret = randomBytes(32).toString("hex");
Object.assign(process.env, {
  [prefix + "_KEY_ID"]: "read-test",
  [prefix + "_SECRET"]: readSecret,
  [prefix + "_WRITE_KEY_ID"]: "write-test",
  [prefix + "_WRITE_SECRET"]: writeSecret,
  [prefix + "_OWNER_ID"]: "google:test-owner",
  [prefix + "_ACTIONS_ENABLED"]: "1",
  [prefix + "_ACTIONS"]:
    "accounts.suspend,accounts.restore,videos.hide,videos.restore",
});
const {
  prepareCommand,
  dispatchCommand,
  reconcileCommand,
  cancelCommand,
  ownedCommand,
  validatedReceipt,
} = await import("../lib/actions/service.ts");
const { enrollProject, saveProject, history } = await import("../lib/store.ts");
const { default: Command } = await import("../models/Command.ts");
const { default: Audit } = await import("../models/Audit.ts");
const { googleAdmin, issueSession, sessionIdentity } =
  await import("../lib/auth/accounts.ts");
const records = Array.from({ length: 20 }, (_, i) => ({
  id: i.toString(16).padStart(24, "0"),
  label: "Fixture " + i,
  detail: "Isolated test",
  status: "active",
  revision: 0,
}));
const receipts = new Map<string, unknown>(),
  nonces = new Set<string>();
let loginCookie = "",
  reviewServer: ChildProcess | undefined;
let posts = 0,
  mode = "ok",
  failure: unknown;
const server = createServer(async (req, res) => {
  try {
    if (
      process.argv.includes("--review") &&
      req.url === "/review" &&
      loginCookie
    ) {
      res.writeHead(302, {
        "Set-Cookie": `superadmin.session-token=${loginCookie}; HttpOnly; SameSite=Lax; Path=/`,
        Location: "http://localhost:3103/",
      });
      res.end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const h = (name: string) => String(req.headers["x-admin-" + name] || "");
    const scope = req.url?.includes("/actions") ? "actions" : "read";
    const nonce = h("nonce");
    assert(!nonces.has(nonce));
    nonces.add(nonce);
    assert.equal(h("scope"), scope);
    assert.equal(h("key-id"), scope === "read" ? "read-test" : "write-test");
    const expected = createHmac(
      "sha256",
      scope === "read" ? readSecret : writeSecret,
    )
      .update(
        JSON.stringify([
          "reelogram-admin",
          "2",
          scope,
          "fixture-local",
          "local",
          process.env.SUPERADMIN_LOCAL_PROJECT_ORIGIN,
          h("key-id"),
          req.method,
          req.url,
          h("time"),
          nonce,
          createHash("sha256").update(body).digest("hex"),
        ]),
      )
      .digest("hex");
    assert.equal(h("signature"), expected);
    res.setHeader("Content-Type", "application/json");
    if (scope === "read") {
      res.end(JSON.stringify({ items: records }));
      return;
    }
    if (req.method === "GET") {
      const receipt = receipts.get(req.url!.split("/").at(-1)!);
      res.statusCode = receipt ? 200 : 404;
      res.end(JSON.stringify(receipt || {}));
      return;
    }
    posts++;
    const b = JSON.parse(body);
    assert.equal(b.actor, "google:test-owner");
    assert(b.authorizedAt > 0);
    assert(await Command.exists({ id: b.commandId, state: "pending" }));
    assert(await Audit.exists({ id: b.commandId, status: "pending" }));
    if (mode === "conflict") {
      res.statusCode = 409;
      res.end("{}");
      return;
    }
    if (mode === "drop-before") {
      req.socket.destroy();
      return;
    }
    if (mode === "redirect") {
      res.statusCode = 307;
      res.setHeader("Location", "http://127.0.0.1:1/forbidden");
      res.end("{}");
      return;
    }
    if (mode === "slow") await new Promise((r) => setTimeout(r, 100));
    const record = records.find((r) => r.id === b.target)!;
    const stale = record.revision !== b.expectedRevision;
    const receipt = {
      commandId: b.commandId,
      action: b.action,
      target: b.target,
      status: stale ? "rejected" : "succeeded",
      code: stale ? "stale-revision" : "applied",
      changed: !stale,
      revision: stale ? record.revision : ++record.revision,
      completedAt: new Date().toISOString(),
    };
    if (!stale)
      record.status =
        b.action === "accounts.suspend"
          ? "suspended"
          : b.action === "videos.hide"
            ? "hidden"
            : "active";
    receipts.set(b.commandId, receipt);
    if (mode === "drop-after") {
      req.socket.destroy();
      return;
    }
    res.end(JSON.stringify(receipt));
  } catch (e) {
    failure = e;
    res.statusCode = 500;
    res.end("{}");
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;
process.env.SUPERADMIN_LOCAL_PROJECT_ORIGIN = "http://localhost:" + port;
const p = {
  id: "fixture-local",
  name: "Isolated adapter",
  origin: process.env.SUPERADMIN_LOCAL_PROJECT_ORIGIN,
  environment: "local" as const,
  status: "connected" as const,
  capabilities: [
    "accounts.read",
    "videos.read",
    "accounts.suspend",
    "accounts.restore",
    "videos.hide",
    "videos.restore",
  ] as import("../lib/types.ts").Capability[],
  lastChecked: null,
  version: "1",
};
const owner = {
  id: "owner-id",
  email: "owner@gmail.com",
  subject: "test-owner",
  provider: "google",
  authenticatedAt: Math.floor(Date.now() / 1000),
};
let checks = 0;
const equal = (a: unknown, b: unknown) => {
  assert.deepEqual(a, b);
  checks++;
};
const rejects = async (fn: () => Promise<unknown>) => {
  await assert.rejects(fn);
  checks++;
};
const prepare = (i: number) =>
  prepareCommand(owner, p, {
    action: "accounts.suspend",
    target: records[i].id,
    expectedRevision: records[i].revision,
    reason: "Confirmed test moderation",
  });
try {
  await enrollProject(p, owner.email);
  const c = await prepare(0);
  equal(posts, 0);
  await rejects(() => prepare(0));
  await rejects(() =>
    dispatchCommand({ ...owner, provider: "dev-test" }, c.id),
  );
  await rejects(() => dispatchCommand({ ...owner, subject: "other" }, c.id));
  await rejects(() => ownedCommand(c.id, { ...owner, id: "other" }));
  await rejects(() =>
    dispatchCommand(
      { ...owner, authenticatedAt: owner.authenticatedAt - 301 },
      c.id,
    ),
  );
  equal(posts, 0);
  mode = "slow";
  const results = await Promise.allSettled([
    dispatchCommand(owner, c.id),
    dispatchCommand(owner, c.id),
  ]);
  equal(results.filter((r) => r.status === "fulfilled").length, 1);
  equal(posts, 1);
  equal((await ownedCommand(c.id, owner)).state, "succeeded");
  await dispatchCommand(owner, c.id);
  equal(posts, 1);
  mode = "drop-after";
  const lost = await prepare(1);
  equal((await dispatchCommand(owner, lost.id)).state, "unknown");
  await rejects(() => prepare(1));
  const restarted = await promisify(execFile)(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `import {reconcileCommand} from './lib/actions/service.ts';import mongoose from 'mongoose';try {console.log((await reconcileCommand(JSON.parse(process.argv[1]),process.argv[2])).state);} finally {await mongoose.disconnect();}`,
      JSON.stringify(owner),
      lost.id,
    ],
    { env: process.env },
  );
  equal(restarted.stdout.trim(), "succeeded");
  equal(posts, 2);
  mode = "drop-before";
  const retry = await prepare(2);
  equal((await dispatchCommand(owner, retry.id)).state, "unknown");
  equal((await reconcileCommand(owner, retry.id)).state, "unknown");
  mode = "ok";
  equal((await dispatchCommand(owner, retry.id, true)).state, "succeeded");
  equal((await ownedCommand(retry.id, owner)).attempts, 2);
  equal(records[2].revision, 1);
  const stale = await prepare(3);
  records[3].revision++;
  equal(
    (await dispatchCommand(owner, stale.id)).receipt?.code,
    "stale-revision",
  );
  equal(records[3].revision, 1);
  for (const action of [
    "accounts.restore",
    "videos.hide",
    "videos.restore",
  ] as const) {
    const item = action === "accounts.restore" ? records[0] : records[12];
    const command = await prepareCommand(owner, p, {
      action,
      target: item.id,
      expectedRevision: item.revision,
      reason: "Verified reversible fixture action",
    });
    equal((await dispatchCommand(owner, command.id)).state, "succeeded");
    equal(item.status, action === "videos.hide" ? "hidden" : "active");
  }
  const cancelled = await prepare(4);
  equal((await cancelCommand(owner, cancelled.id)).state, "cancelled");
  const before = posts;
  await dispatchCommand(owner, cancelled.id);
  equal(posts, before);
  const disabled = await prepare(5);
  process.env[prefix + "_ACTIONS_ENABLED"] = "0";
  await rejects(() => dispatchCommand(owner, disabled.id));
  await rejects(() => prepare(6));
  process.env[prefix + "_ACTIONS_ENABLED"] = "1";
  mode = "conflict";
  equal((await dispatchCommand(owner, disabled.id)).retryBlocked, true);
  await rejects(() => dispatchCommand(owner, disabled.id, true));
  await rejects(() => cancelCommand(owner, disabled.id));
  await rejects(() => prepare(5));
  mode = "drop-before";
  const bounded = await prepare(6);
  await dispatchCommand(owner, bounded.id);
  await dispatchCommand(owner, bounded.id, true);
  await dispatchCommand(owner, bounded.id, true);
  await rejects(() => dispatchCommand(owner, bounded.id, true));
  equal((await ownedCommand(bounded.id, owner)).attempts, 3);
  mode = "redirect";
  const redirected = await prepare(7);
  equal((await dispatchCommand(owner, redirected.id)).state, "unknown");
  const expired = await prepare(8);
  await Command.updateOne(
    { id: expired.id },
    { $set: { createdAt: new Date(Date.now() - 601000) } },
  );
  await rejects(() => dispatchCommand(owner, expired.id));
  const altered = await prepare(9);
  await saveProject({ ...p, origin: "https://changed.example.com" });
  await rejects(() => dispatchCommand(owner, altered.id));
  await saveProject(p);
  const fault = await prepare(10);
  const create = Audit.create;
  Audit.create = (() => {
    throw Error("Injected audit failure");
  }) as typeof Audit.create;
  const sent = posts;
  await rejects(() => dispatchCommand(owner, fault.id));
  equal(posts, sent);
  equal((await ownedCommand(fault.id, owner)).state, "prepared");
  Audit.create = create;
  const lease = await prepare(11);
  await Command.updateOne(
    { id: lease.id },
    {
      $set: {
        state: "pending",
        lease: "fixture",
        leaseUntil: new Date(Date.now() + 30000),
      },
    },
  );
  await rejects(() => reconcileCommand(owner, lease.id));
  await Command.updateOne(
    { id: lease.id },
    { $set: { leaseUntil: new Date(Date.now() - 1) } },
  );
  equal((await reconcileCommand(owner, lease.id)).state, "unknown");
  process.env[prefix + "_ACTIONS_ENABLED"] = "0";
  equal((await reconcileCommand(owner, redirected.id)).state, "unknown");
  process.env[prefix + "_ACTIONS_ENABLED"] = "1";
  const receipt = receipts.get(c.id) as Record<string, unknown>;
  for (const patch of [
    { commandId: retry.id },
    { action: "videos.hide" },
    { target: records[1].id },
    { changed: false },
    { revision: -1 },
    { status: "accepted" },
  ]) {
    assert.throws(() => validatedReceipt({ ...receipt, ...patch }, c));
    checks++;
  }
  process.env.SUPERADMIN_GOOGLE_OWNER_EMAIL = "owner@gmail.com";
  const admin = await googleAdmin({
    sub: "test-owner",
    email: owner.email,
    email_verified: true,
  });
  assert(admin);
  const sid = await issueSession(
    String(admin._id),
    "google",
    owner.authenticatedAt,
  );
  equal((await sessionIdentity(sid))?.authenticatedAt, owner.authenticatedAt);
  const legacy = await issueSession(String(admin._id), "google");
  equal((await sessionIdentity(legacy))?.authenticatedAt, 0);
  assert((await history()).some((a) => a.action === "command.unconfirmed"));
  checks++;
  if (failure) throw failure;
  console.log(
    `Passed ${checks} command checks: signed independent HTTP adapter, durable intents, authentication, races, lost responses, reconciliation after restart, retry bounds and transaction rollback.`,
  );
  if (process.argv.includes("--review")) {
    mode = "ok";
    const secret = randomBytes(32).toString("hex");
    const { encode } = createRequire(import.meta.url)("next-auth/jwt");
    loginCookie = await encode({ token: { sid }, secret, maxAge: 3600 });
    reviewServer = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3103",
      ],
      {
        env: {
          ...process.env,
          SUPERADMIN_APP_URL: "http://localhost:3103",
          SUPERADMIN_AUTH_SECRET: secret,
          SUPERADMIN_GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
          SUPERADMIN_GOOGLE_CLIENT_SECRET: "fixture-secret",
        },
        stdio: ["ignore", "ignore", "ignore"],
      },
    );
    console.log(
      `Isolated command UI: http://localhost:${port}/review (synthetic Google session; fixture records only)`,
    );
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  reviewServer?.kill("SIGTERM");
  await new Promise<void>((r) => server.close(() => r()));
  await mongoose.disconnect();
  await mongo.stop();
}

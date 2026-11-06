import type { ClientSession, Connection } from "mongoose";
import { randomUUID } from "node:crypto";
import Command, { type CommandRecord } from "../../models/Command.ts";
import Audit from "../../models/Audit.ts";
import { connectToDatabase } from "../db.ts";
import { audit, project } from "../store.ts";
import { digest } from "../auth/policy.ts";
import { callProject, resourceList } from "../connector.ts";
import { actionRequest } from "./transport.ts";
import {
  ActionError,
  actionApplies,
  requireActionOwner,
  validateIntent,
  type ActionOwner,
} from "./policy.ts";
import type { Project } from "../types.ts";
async function durableTransaction(
  db: Connection,
  work: (session: ClientSession) => Promise<void>,
) {
  const session = await db.startSession();
  try {
    return await session.withTransaction(() => work(session), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 5000,
      timeoutMS: 20000,
    });
  } finally {
    await session.endSession();
  }
}
export const terminal = (state: string) =>
  ["succeeded", "rejected", "cancelled"].includes(state);
export function commandSummary(c: CommandRecord) {
  return {
    id: c.id,
    projectId: c.projectId,
    action: c.action,
    target: c.target,
    label: c.label,
    reason: c.reason,
    expectedRevision: c.expectedRevision,
    state: c.state,
    attempts: c.attempts,
    retryBlocked: c.retryBlocked || false,
    createdAt: new Date(c.createdAt).toISOString(),
    receipt: c.receipt,
  };
}
async function database() {
  const db = await connectToDatabase();
  await Command.init();
  return db;
}
export async function ownerCommands(owner: ActionOwner) {
  await database();
  const scope = { ownerAdminId: owner.id, actor: "google:" + owner.subject };
  const [unresolved, recent] = await Promise.all([
    Command.find({
      ...scope,
      state: { $in: ["prepared", "pending", "unknown"] },
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean(),
    Command.find({
      ...scope,
      state: { $in: ["succeeded", "rejected", "cancelled"] },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
  ]);
  return [...unresolved, ...recent].map(commandSummary);
}
export async function ownedCommand(id: string, owner: ActionOwner) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      id,
    )
  )
    throw new ActionError("Invalid command");
  await database();
  const c = await Command.findOne({ id, ownerAdminId: owner.id }).lean();
  if (!c || c.actor !== "google:" + owner.subject)
    throw new ActionError("Command not found");
  return c;
}
export async function prepareCommand(
  owner: ActionOwner,
  p: Project,
  input: Record<string, unknown>,
) {
  const config = requireActionOwner(owner, p, false);
  const intent = validateIntent(input);
  if (
    p.status !== "connected" ||
    !config.allowed.includes(intent.action) ||
    !p.capabilities.includes(intent.action)
  )
    throw new ActionError("Action is not available for this project");
  const items = resourceList(
    await callProject(p, "/api/admin/v1/" + intent.action.split(".")[0]),
  );
  const item = items.find((i) => i.id === intent.target);
  if (
    !item ||
    item.revision !== intent.expectedRevision ||
    !actionApplies(intent.action, item)
  )
    throw new ActionError(
      "This record changed or is no longer actionable. Refresh and review it again",
    );
  const db = await database();
  const c: CommandRecord = {
    ...intent,
    id: randomUUID(),
    projectId: p.id,
    origin: p.origin,
    environment: p.environment,
    actor: "google:" + owner.subject,
    ownerAdminId: owner.id,
    label: item.label,
    createdAt: new Date(),
    state: "prepared",
    attempts: 0,
    activeKey: digest(
      JSON.stringify([p.id, intent.action.split(".")[0], intent.target]),
    ),
  };
  try {
    await durableTransaction(db, async (session) => {
      await Command.create([c], { session });
      await audit(
        owner.email,
        p.id,
        c.action,
        c.target,
        c.reason,
        "prepared",
        c.id,
        session,
      );
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      throw new ActionError(
        "An unresolved command exists for this record. Review it in Audit history",
      );
    throw new ActionError("Unable to persist this command");
  }
  return commandSummary(c);
}
export function validatedReceipt(
  data: unknown,
  c: Pick<CommandRecord, "id" | "action" | "target">,
): NonNullable<CommandRecord["receipt"]> {
  const r = data as NonNullable<CommandRecord["receipt"]>;
  if (
    !r ||
    r.commandId !== c.id ||
    r.action !== c.action ||
    r.target !== c.target ||
    (r.status === "succeeded"
      ? !["applied", "already-in-state"].includes(r.code)
      : r.status !== "rejected" ||
        ![
          "stale-revision",
          "target-not-found",
          "deletion-in-progress",
        ].includes(r.code)) ||
    typeof r.changed !== "boolean" ||
    (r.status === "rejected" && r.changed) ||
    (r.code === "already-in-state" && r.changed) ||
    (r.code === "applied" && !r.changed) ||
    (r.revision === null
      ? r.code !== "target-not-found"
      : !Number.isInteger(r.revision) ||
        r.revision < 0 ||
        r.revision > 2147483647) ||
    typeof r.completedAt !== "string" ||
    !Number.isFinite(Date.parse(r.completedAt))
  )
    throw new ActionError("Unconfirmed command receipt");
  return {
    commandId: r.commandId,
    action: r.action,
    target: r.target,
    status: r.status,
    code: r.code,
    changed: r.changed,
    revision: r.revision,
    completedAt: r.completedAt,
  };
}
async function connection(
  c: CommandRecord,
  owner: ActionOwner,
  fresh: boolean,
  dispatch: boolean,
) {
  const p = await project(c.projectId);
  requireActionOwner(owner, p, fresh, dispatch);
  if (
    p.origin !== c.origin ||
    p.environment !== c.environment ||
    p.status !== "connected"
  )
    throw new ActionError(
      "Project connection changed; command remains unresolved",
    );
  if (
    dispatch &&
    (!p.capabilities.includes(c.action) ||
      !requireActionOwner(owner, p, fresh, dispatch).allowed.includes(c.action))
  )
    throw new ActionError("Action is no longer available");
  return p;
}
async function complete(
  c: CommandRecord,
  receipt: NonNullable<CommandRecord["receipt"]>,
  owner: ActionOwner,
) {
  const db = await database();
  await durableTransaction(db, async (session) => {
    const result = await Command.updateOne(
      { id: c.id, state: { $in: ["pending", "unknown"] } },
      {
        $set: { state: receipt.status, receipt },
        $unset: { activeKey: 1, lease: 1, leaseUntil: 1 },
      },
      { session },
    );
    if (result.modifiedCount) {
      await Audit.updateOne(
        { id: c.id },
        { $set: { status: receipt.status } },
        { session },
      );
      await audit(
        owner.email,
        c.projectId,
        "command.receipt",
        c.id,
        receipt.code,
        receipt.status,
        undefined,
        session,
      );
    }
  });
  return commandSummary(await ownedCommand(c.id, owner));
}
async function uncertain(
  c: CommandRecord,
  owner: ActionOwner,
  lease?: string,
  retryBlocked = false,
) {
  const db = await database();
  await durableTransaction(db, async (session) => {
    const changed = await Command.updateOne(
      {
        id: c.id,
        state: "pending",
        ...(lease
          ? { lease }
          : {
              $or: [
                { leaseUntil: { $exists: false } },
                { leaseUntil: { $lte: new Date() } },
              ],
            }),
      },
      {
        $set: {
          state: "unknown",
          ...(retryBlocked ? { retryBlocked: true } : {}),
        },
        $unset: { lease: 1, leaseUntil: 1 },
      },
      { session },
    );
    if (changed.modifiedCount)
      await Audit.updateOne(
        { id: c.id },
        { $set: { status: "unknown" } },
        { session },
      );
    await audit(
      owner.email,
      c.projectId,
      "command.unconfirmed",
      c.id,
      "No verified terminal receipt; reconcile before retrying",
      "unknown",
      undefined,
      session,
    );
  });
  return commandSummary(await ownedCommand(c.id, owner));
}
export async function reconcileCommand(owner: ActionOwner, id: string) {
  const c = await ownedCommand(id, owner);
  if (terminal(c.state) || c.state === "prepared") return commandSummary(c);
  if (c.leaseUntil && c.leaseUntil.getTime() > Date.now())
    throw new ActionError("Command is still being checked. Try again shortly");
  const p = await connection(c, owner, false, false);
  await audit(
    owner.email,
    c.projectId,
    "command.reconcile",
    c.id,
    "Request existing receipt",
    "pending",
  );
  try {
    const r = await actionRequest(p, "GET", "/api/admin/v1/actions/" + c.id);
    if (r.status === 200)
      return await complete(c, validatedReceipt(r.data, c), owner);
  } catch {}
  return uncertain(c, owner);
}
export async function cancelCommand(owner: ActionOwner, id: string) {
  const c = await ownedCommand(id, owner),
    db = await database();
  await durableTransaction(db, async (session) => {
    const r = await Command.updateOne(
      { id: c.id, state: "prepared" },
      { $set: { state: "cancelled" }, $unset: { activeKey: 1 } },
      { session },
    );
    if (!r.modifiedCount)
      throw new ActionError("Only an undispatched command can be cancelled");
    await Audit.updateOne(
      { id: c.id },
      { $set: { status: "cancelled" } },
      { session },
    );
  });
  return commandSummary(await ownedCommand(id, owner));
}
export async function dispatchCommand(
  owner: ActionOwner,
  id: string,
  retry = false,
) {
  let c = await ownedCommand(id, owner);
  if (terminal(c.state)) return commandSummary(c);
  const p = await connection(c, owner, true, true);
  if (c.state !== "prepared") {
    if (!retry)
      throw new ActionError("Reconcile the existing command before retrying");
    const reconciled = await reconcileCommand(owner, id);
    if (terminal(reconciled.state)) return reconciled;
    c = await ownedCommand(id, owner);
  } else if (retry)
    throw new ActionError("This command has not been dispatched");
  if (c.retryBlocked)
    throw new ActionError(
      "Command identity conflict. Reconcile and investigate; retry is blocked",
    );
  requireActionOwner(owner, p, true, true);
  if (c.attempts >= 3)
    throw new ActionError(
      "Retry limit reached. Reconcile this command; do not create a replacement",
    );
  if (
    c.state === "prepared" &&
    Date.now() - c.createdAt.getTime() > 10 * 60_000
  )
    throw new ActionError(
      "Confirmation expired. Cancel this draft and review the current record again",
    );
  const lease = randomUUID(),
    db = await database();
  await durableTransaction(db, async (session) => {
    const r = await Command.updateOne(
      {
        id: c.id,
        state: c.state,
        attempts: c.attempts,
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: { $lte: new Date() } },
        ],
      },
      {
        $set: {
          state: "pending",
          lease,
          leaseUntil: new Date(Date.now() + 30_000),
        },
        $inc: { attempts: 1 },
      },
      { session },
    );
    if (!r.modifiedCount)
      throw new ActionError("This command is already being dispatched");
    await Audit.updateOne(
      { id: c.id },
      { $set: { status: "pending" } },
      { session },
    );
    await audit(
      owner.email,
      c.projectId,
      retry ? "command.retry" : "command.dispatch",
      c.id,
      "Confirmed intent persisted before dispatch",
      "pending",
      undefined,
      session,
    );
  });
  // The saved intent is immutable. Only the verified Google authentication time changes on retries.
  const payload = JSON.stringify({
    commandId: c.id,
    action: c.action,
    target: c.target,
    reason: c.reason,
    actor: c.actor,
    expectedRevision: c.expectedRevision,
    authorizedAt: owner.authenticatedAt,
  });
  try {
    requireActionOwner(owner, p, true, true);
    const r = await actionRequest(p, "POST", "/api/admin/v1/actions", payload);
    if (r.status === 200)
      return await complete(c, validatedReceipt(r.data, c), owner);
    if (r.status === 409) return await uncertain(c, owner, lease, true);
  } catch {}
  return uncertain(c, owner, lease);
}

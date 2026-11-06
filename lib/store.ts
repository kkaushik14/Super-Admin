import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import { connectToDatabase } from "./db.ts";
import ProjectModel, { type Project } from "../models/Project.ts";
import AuditModel from "../models/Audit.ts";
import type { Audit } from "../models/Audit.ts";
import { digest } from "./auth/policy.ts";
export { rateLimit } from "./security/rate-limit.ts";
export async function projects(): Promise<Project[]> {
  await connectToDatabase();
  return ProjectModel.find({}, { _id: 0 }).sort({ id: 1 }).lean();
}
export async function project(id: string) {
  await connectToDatabase();
  const p = await ProjectModel.findOne({ id }, { _id: 0 }).lean();
  if (!p) throw Error("Project not found");
  return p;
}
export async function saveProject(p: Project, session?: ClientSession) {
  await connectToDatabase();
  await ProjectModel.updateOne(
    { id: p.id },
    { $set: p },
    { session, runValidators: true },
  );
}
export async function audit(
  actor: string,
  projectId: string,
  action: string,
  target: string,
  reason: string,
  status: string,
  id: string = randomUUID(),
  session?: ClientSession,
) {
  await connectToDatabase();
  await AuditModel.create(
    [
      {
        id,
        at: new Date().toISOString(),
        actor,
        projectId,
        action,
        target,
        reason,
        status,
      },
    ],
    { session },
  );
  return id;
}
export async function finish(id: string, status: string) {
  await connectToDatabase();
  await AuditModel.updateOne(
    { id },
    {
      $set: { status },
      ...(["pending", "accepted", "unknown"].includes(status)
        ? {}
        : { $unset: { activeKey: 1 } }),
    },
  );
}
export async function history(): Promise<Audit[]> {
  await connectToDatabase();
  return AuditModel.find({}, { _id: 0, activeKey: 0 })
    .sort({ at: -1 })
    .limit(200)
    .lean();
}
export async function claimAction(
  actor: string,
  projectId: string,
  action: string,
  target: string,
  reason: string,
) {
  await connectToDatabase();
  const id = randomUUID();
  try {
    await AuditModel.create({
      id,
      at: new Date().toISOString(),
      actor,
      projectId,
      action,
      target,
      reason,
      status: "pending",
      activeKey: digest(JSON.stringify([projectId, action, target])),
    });
    return id;
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      throw Error(
        "An unresolved action exists for this target. Reconcile it before submitting again.",
      );
    throw Error("Unable to record action");
  }
}
export async function enrollProject(p: Project, actor: string) {
  const conn = await connectToDatabase();
  try {
    await conn.transaction(async (session) => {
      await ProjectModel.create([p], { session });
      await audit(
        actor,
        p.id,
        "project.add",
        p.id,
        "Project enrolled",
        "succeeded",
        undefined,
        session,
      );
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      throw Error("Project ID already exists");
    throw Error("Project enrollment could not be saved");
  }
}
export async function disconnectProject(p: Project, actor: string) {
  const conn = await connectToDatabase();
  await conn.transaction(async (session) => {
    await saveProject(
      { ...p, status: "disconnected", capabilities: [], version: null },
      session,
    );
    await audit(
      actor,
      p.id,
      "project.disconnect",
      p.id,
      "Connection disabled",
      "succeeded",
      undefined,
      session,
    );
  });
}

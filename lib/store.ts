import { randomUUID } from "node:crypto";
import type { Project, Audit } from "./types.ts";
import { db } from "./db.ts";
export { db } from "./db.ts";
export function projects(): Project[] {
  return (
    db().prepare("SELECT payload FROM projects ORDER BY id").all() as {
      payload: string;
    }[]
  ).map((r) => JSON.parse(r.payload));
}
export function project(id: string) {
  const p = projects().find((p) => p.id === id);
  if (!p) throw Error("Project not found");
  return p;
}
export function saveProject(p: Project) {
  db()
    .prepare(
      "INSERT INTO projects VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    )
    .run(p.id, JSON.stringify(p));
}
export function audit(
  actor: string,
  projectId: string,
  action: string,
  target: string,
  reason: string,
  status: string,
  id = randomUUID(),
) {
  db()
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)")
    .run(
      id,
      new Date().toISOString(),
      actor,
      projectId,
      action,
      target,
      reason,
      status,
    );
  return id;
}
export function finish(id: string, status: string) {
  db().prepare("UPDATE audit SET status=? WHERE id=?").run(status, id);
}
export function history(): Audit[] {
  return db()
    .prepare("SELECT * FROM audit ORDER BY at DESC LIMIT 200")
    .all() as Audit[];
}
export function rateLimit(key: string, maximum = 8) {
  const now = Date.now();
  db().prepare("DELETE FROM attempts WHERE expires < ?").run(now);
  const r = db()
    .prepare(
      "INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .get(key, now + 15 * 60_000) as { count: number };
  if (r.count > maximum)
    throw Error("Too many attempts. Try again in 15 minutes.");
}

export function claimAction(
  actor: string,
  projectId: string,
  action: string,
  target: string,
  reason: string,
) {
  db().exec("BEGIN IMMEDIATE");
  try {
    const unresolved = db()
      .prepare(
        "SELECT id FROM audit WHERE projectId=? AND action=? AND target=? AND status IN ('pending','accepted','unknown') LIMIT 1",
      )
      .get(projectId, action, target);
    if (unresolved)
      throw Error(
        "An unresolved action exists for this target. Reconcile it with the project before submitting again.",
      );
    const id = audit(actor, projectId, action, target, reason, "pending");
    db().exec("COMMIT");
    return id;
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

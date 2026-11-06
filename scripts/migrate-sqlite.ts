import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import mongoose from "mongoose";
import { connectToDatabase } from "../lib/db.ts";
import ProjectModel, { type Project } from "../models/Project.ts";
import AuditModel, { type AuditRecord } from "../models/Audit.ts";
import { digest } from "../lib/auth/policy.ts";
import { createRequire } from "node:module";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const source = new DatabaseSync(resolve(".data/admin.sqlite"), {
  readOnly: true,
});
try {
  const projects = (
    source.prepare("SELECT payload FROM projects").all() as {
      payload: string;
    }[]
  ).map((r) => JSON.parse(r.payload) as Project);
  const audits = source.prepare("SELECT * FROM audit").all() as AuditRecord[];
  const conn = await connectToDatabase(false);
  await conn.transaction(async (session) => {
    for (const project of projects)
      await ProjectModel.updateOne(
        { id: project.id },
        { $setOnInsert: project },
        { upsert: true, session, runValidators: true },
      );
    for (const audit of audits) {
      const data = {
        ...audit,
        ...(["pending", "accepted", "unknown"].includes(audit.status) &&
        !audit.action.startsWith("project.")
          ? {
              activeKey: digest(
                JSON.stringify([audit.projectId, audit.action, audit.target]),
              ),
            }
          : {}),
      };
      await AuditModel.updateOne(
        { id: audit.id },
        { $setOnInsert: data },
        { upsert: true, session, runValidators: true },
      );
    }
  });
  console.log(
    `Import completed: ${projects.length} project records and ${audits.length} audit records considered. Existing destination records and the SQLite source were preserved. No accounts or sessions were copied.`,
  );
} finally {
  source.close();
  await mongoose.disconnect();
}

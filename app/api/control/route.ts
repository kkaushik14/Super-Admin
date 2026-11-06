import { readBody } from "@/lib/request";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { actor, preview, sameOrigin } from "@/lib/auth";
import {
  audit,
  claimAction,
  db,
  finish,
  history,
  project,
  projects,
  rateLimit,
  saveProject,
} from "@/lib/store";
import {
  callProject,
  manifest,
  resourceList,
  validateOrigin,
} from "@/lib/connector";
import { capabilities, type Capability, type Project } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function identity() {
  return actor((await cookies()).get("admin_session")?.value);
}
export async function GET(request: Request) {
  const who = await identity();
  if (!who && !preview())
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const u = new URL(request.url),
      id = u.searchParams.get("project"),
      resource = u.searchParams.get("resource");
    if (id && resource) {
      if (!who) throw Error("Connect and sign in to inspect project data");
      if (!["accounts", "videos", "jobs"].includes(resource))
        throw Error("Unknown resource");
      const p = project(id);
      if (
        p.status !== "connected" ||
        !p.capabilities.includes((resource + ".read") as Capability)
      )
        throw Error("This capability is not connected");
      return NextResponse.json({
        items: resourceList(await callProject(p, "/api/admin/v1/" + resource)),
      });
    }
    return NextResponse.json({
      projects: projects(),
      audit: history(),
      preview: !who,
      actor: who || "Local preview",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to load project" },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  const who = await identity();
  if (!who)
    return NextResponse.json(
      { error: "Administrator sign-in is required for changes" },
      { status: 401 },
    );
  let command: string | undefined;
  try {
    sameOrigin(request);
    rateLimit("control:" + who, 100);
    const raw = await readBody(request);
    if (raw.length > 8192) throw Error("Request too large");
    const b = JSON.parse(raw);
    if (
      typeof b.action !== "string" ||
      typeof b.projectId !== "string" ||
      !/^[a-z][a-z0-9-]{1,39}$/.test(b.projectId)
    )
      throw Error("Invalid request");
    if (b.action === "project.add") {
      if (
        typeof b.name !== "string" ||
        !b.name.trim() ||
        b.name.length > 80 ||
        typeof b.origin !== "string" ||
        !["production", "staging"].includes(b.environment)
      )
        throw Error("Check project details");
      if (projects().some((p) => p.id === b.projectId))
        throw Error("Project ID already exists");
      const p: Project = {
        id: b.projectId,
        name: b.name.trim(),
        origin: validateOrigin(b.origin),
        environment: b.environment,
        status: "not-connected",
        capabilities: [],
        lastChecked: null,
        version: null,
      };
      db().exec("BEGIN IMMEDIATE");
      try {
        saveProject(p);
        audit(who, p.id, b.action, p.id, "Project enrolled", "succeeded");
        db().exec("COMMIT");
      } catch (e) {
        db().exec("ROLLBACK");
        throw e;
      }
      return NextResponse.json({ ok: true });
    }
    const p = project(b.projectId);
    if (b.action === "project.check") {
      command = audit(who, p.id, b.action, p.id, "Connection check", "pending");
      try {
        const m = manifest(
          await callProject(p, "/api/admin/v1/manifest"),
          p.id,
        );
        saveProject({
          ...p,
          ...m,
          status: "connected",
          lastChecked: new Date().toISOString(),
        });
        finish(command, "succeeded");
      } catch (e) {
        saveProject({
          ...p,
          status: "unreachable",
          lastChecked: new Date().toISOString(),
        });
        finish(command, "failed");
        command = undefined;
        throw e;
      }
      return NextResponse.json({ ok: true });
    }
    if (b.action === "project.disconnect") {
      db().exec("BEGIN IMMEDIATE");
      try {
        saveProject({
          ...p,
          status: "disconnected",
          capabilities: [],
          version: null,
        });
        audit(who, p.id, b.action, p.id, "Connection disabled", "succeeded");
        db().exec("COMMIT");
      } catch (e) {
        db().exec("ROLLBACK");
        throw e;
      }
      return NextResponse.json({ ok: true });
    }
    if (
      !capabilities.includes(b.action) ||
      b.action.endsWith(".read") ||
      p.status !== "connected" ||
      !p.capabilities.includes(b.action)
    )
      throw Error("Action is not available for this project");
    if (
      typeof b.target !== "string" ||
      !b.target ||
      b.target.length > 120 ||
      typeof b.reason !== "string" ||
      b.reason.trim().length < 10 ||
      b.reason.length > 500
    )
      throw Error(
        "Select a target and provide a reason of at least 10 characters",
      );
    command = claimAction(who, p.id, b.action, b.target, b.reason.trim());
    const result = (await callProject(
      p,
      "/api/admin/v1/actions",
      {
        action: b.action,
        target: b.target,
        reason: b.reason.trim(),
        actor: who,
        commandId: command,
      },
      command,
    )) as { commandId?: string; status?: string };
    if (
      result?.commandId !== command ||
      !["succeeded", "accepted", "rejected"].includes(result.status || "")
    )
      throw Error("Unconfirmed project result");
    finish(command, result.status!);
    return NextResponse.json({ ok: true, status: result.status });
  } catch (e) {
    if (command) finish(command, "unknown");
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Action failed. Review audit history before retrying.",
      },
      { status: 400 },
    );
  }
}

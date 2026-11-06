import { readBody } from "@/lib/request";
import { NextResponse } from "next/server";
import { actor, sameOrigin } from "@/lib/auth";
import {
  audit,
  claimAction,
  enrollProject,
  disconnectProject,
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
  return actor();
}
export async function GET(request: Request) {
  const who = await identity();
  if (!who)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const u = new URL(request.url),
      id = u.searchParams.get("project"),
      resource = u.searchParams.get("resource");
    if (id && resource) {
      if (!who) throw Error("Connect and sign in to inspect project data");
      if (!["accounts", "videos", "jobs"].includes(resource))
        throw Error("Unknown resource");
      const p = await project(id);
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
      projects: await projects(),
      audit: await history(),
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
    await rateLimit("control:" + who, 100);
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
      if ((await projects()).some((p) => p.id === b.projectId))
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
      await enrollProject(p, who);
      return NextResponse.json({ ok: true });
    }
    const p = await project(b.projectId);
    if (b.action === "project.check") {
      command = await audit(
        who,
        p.id,
        b.action,
        p.id,
        "Connection check",
        "pending",
      );
      try {
        const m = manifest(
          await callProject(p, "/api/admin/v1/manifest"),
          p.id,
        );
        await saveProject({
          ...p,
          ...m,
          status: "connected",
          lastChecked: new Date().toISOString(),
        });
        await finish(command, "succeeded");
      } catch (e) {
        await saveProject({
          ...p,
          status: "unreachable",
          lastChecked: new Date().toISOString(),
        });
        await finish(command, "failed");
        command = undefined;
        throw e;
      }
      return NextResponse.json({ ok: true });
    }
    if (b.action === "project.disconnect") {
      await disconnectProject(p, who);
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
    command = await claimAction(who, p.id, b.action, b.target, b.reason.trim());
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
    await finish(command, result.status!);
    return NextResponse.json({ ok: true, status: result.status });
  } catch (e) {
    if (command) await finish(command, "unknown");
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

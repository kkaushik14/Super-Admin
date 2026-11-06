import { availableActions } from "@/lib/actions/policy";
import { readBody } from "@/lib/request";
import { NextResponse } from "next/server";
import { actor, sameOrigin } from "@/lib/auth";
import {
  audit,
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
  validateProjectConnection,
} from "@/lib/connector";
import { type Capability, type Project } from "@/lib/types";
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
      availableActions: Object.fromEntries(
        (await projects()).map((p) => [p.id, availableActions(p)]),
      ),
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
        !["production", "staging", "local"].includes(b.environment)
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
      validateProjectConnection(p);
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
    throw Error(
      "Use the confirmed command workflow for administrative actions",
    );
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

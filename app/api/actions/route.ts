import { NextRequest, NextResponse } from "next/server";
import { actionSession } from "@/lib/actions/session";
import { ActionError, freshAuthentication } from "@/lib/actions/policy";
import {
  commandSummary,
  ownedCommand,
  ownerCommands,
  prepareCommand,
  dispatchCommand,
  reconcileCommand,
  cancelCommand,
} from "@/lib/actions/service";
import { sameOrigin } from "@/lib/auth";
import { readBody } from "@/lib/request";
import { audit, project, rateLimit } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  let owner;
  try {
    owner = await actionSession(request);
  } catch {
    return NextResponse.json(
      { error: "Authorization is temporarily unavailable" },
      { status: 503 },
    );
  }
  if (!owner)
    return NextResponse.json(
      { error: "Verified Google owner sign-in required" },
      { status: 401 },
    );
  try {
    const id = new URL(request.url).searchParams.get("id");
    return NextResponse.json({
      fresh: freshAuthentication(owner.authenticatedAt),
      ...(id
        ? { command: commandSummary(await ownedCommand(id, owner)) }
        : { commands: await ownerCommands(owner) }),
    });
  } catch {
    return NextResponse.json({ error: "Command not found" }, { status: 404 });
  }
}
export async function POST(request: NextRequest) {
  let owner;
  try {
    owner = await actionSession(request);
  } catch {
    return NextResponse.json(
      { error: "Authorization is temporarily unavailable" },
      { status: 503 },
    );
  }
  if (!owner) {
    console.warn("Action access denied: no verified Google session");
    return NextResponse.json(
      { error: "Verified Google owner sign-in required" },
      { status: 401 },
    );
  }
  try {
    try {
      sameOrigin(request);
    } catch {
      throw new ActionError("Request origin rejected");
    }
    await rateLimit("actions:" + owner.id, 30, 60000);
    const b = JSON.parse(await readBody(request));
    if (!b || typeof b !== "object" || Array.isArray(b))
      throw new ActionError("Invalid command request");
    const keys =
      b.mode === "prepare"
        ? [
            "mode",
            "projectId",
            "action",
            "target",
            "reason",
            "expectedRevision",
          ]
        : ["mode", "id", "confirmed"];
    if (Object.keys(b).some((k) => !keys.includes(k)))
      throw new ActionError("Unexpected command fields");
    let command;
    if (b.mode === "prepare") {
      if (
        typeof b.projectId !== "string" ||
        !/^[a-z][a-z0-9-]{1,39}$/.test(b.projectId)
      )
        throw new ActionError("Invalid project");
      command = await prepareCommand(owner, await project(b.projectId), b);
    } else {
      if (typeof b.id !== "string") throw new ActionError("Invalid command");
      if (b.mode === "dispatch" || b.mode === "retry") {
        if (b.confirmed !== true)
          throw new ActionError("Explicit confirmation is required");
        command = await dispatchCommand(owner, b.id, b.mode === "retry");
      } else if (b.mode === "reconcile")
        command = await reconcileCommand(owner, b.id);
      else if (b.mode === "cancel") command = await cancelCommand(owner, b.id);
      else throw new ActionError("Unknown command operation");
    }
    return NextResponse.json({
      command,
      fresh: freshAuthentication(owner.authenticatedAt),
    });
  } catch (e) {
    const error =
      e instanceof ActionError
        ? e.message
        : "Unable to process command. Check its saved status before retrying";
    try {
      await audit(
        owner.email,
        "system",
        "command.denied",
        "request",
        "Command request rejected",
        "denied",
      );
    } catch {
      return NextResponse.json(
        {
          error:
            "Administration audit is unavailable; check the saved command before retrying",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error }, { status: 400 });
  }
}

import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { capabilities, type Project, type Resource } from "./types.ts";
export function validateOrigin(raw: string) {
  const u = new URL(raw);
  const allowed = (process.env.ADMIN_ALLOWED_PROJECT_HOSTS || "")
    .split(",")
    .map((s) => s.trim());
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    isIP(u.hostname) ||
    !allowed.includes(u.hostname)
  )
    throw Error("Use an explicitly allowed HTTPS project host");
  return u.origin;
}
export function privateAddress(ip: string) {
  return (
    ip.includes(":") ||
    /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(18|19)\.|22[4-9]\.|23\d\.|24\d\.|25\d\.)/.test(
      ip,
    )
  );
}
export function signature(
  secret: string,
  method: string,
  path: string,
  time: string,
  nonce: string,
  body: string,
) {
  return createHmac("sha256", secret)
    .update([method, path, time, nonce, body].join("\n"))
    .digest("hex");
}
export async function callProject(
  p: Project,
  path: string,
  body?: unknown,
  id: string = randomUUID(),
): Promise<unknown> {
  const origin = validateOrigin(p.origin);
  const addresses = await lookup(new URL(origin).hostname, {
    all: true,
    family: 4,
  });
  if (!addresses.length || addresses.some((a) => privateAddress(a.address)))
    throw Error("Project host must resolve to a public address");
  const secret =
    process.env[
      "ADMIN_PROJECT_" + p.id.toUpperCase().replaceAll("-", "_") + "_SECRET"
    ];
  if (!secret || secret.length < 32)
    throw Error("Project credential is not configured");
  const method = body === undefined ? "GET" : "POST",
    payload = body === undefined ? "" : JSON.stringify(body),
    time = String(Math.floor(Date.now() / 1000)),
    nonce = randomUUID();
  return await new Promise((resolve, reject) => {
    const address = addresses[0].address;
    const req = httpsRequest(
      origin + path,
      {
        method,
        family: 4,
        lookup: (_host, _options, callback) => callback(null, address, 4),
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Project": p.id,
          "X-Admin-Time": time,
          "X-Admin-Nonce": nonce,
          "X-Admin-Signature": signature(
            secret,
            method,
            path,
            time,
            nonce,
            payload,
          ),
          "Idempotency-Key": id,
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error("Project did not accept the request"));
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 256 * 1024) {
            req.destroy(Error("Project response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch {
            reject(Error("Invalid project response"));
          }
        });
      },
    );
    const timeout = setTimeout(
      () =>
        req.destroy(Error("Project request timed out; outcome may be unknown")),
      8000,
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
    req.end(payload || undefined);
  });
}
export function manifest(value: unknown, id: string) {
  const x = value as {
    projectId?: string;
    version?: string;
    capabilities?: unknown[];
  };
  if (
    !x ||
    x.projectId !== id ||
    x.version !== "1" ||
    !Array.isArray(x.capabilities) ||
    x.capabilities.some((c) => !capabilities.includes(c as never))
  )
    throw Error("Project integration is incompatible");
  return {
    version: x.version,
    capabilities: x.capabilities as Project["capabilities"],
  };
}
export function resourceList(value: unknown): Resource[] {
  const x = value as { items?: Resource[] };
  if (
    !x ||
    !Array.isArray(x.items) ||
    x.items.length > 100 ||
    x.items.some(
      (r) =>
        !r ||
        ["id", "label", "detail", "status"].some(
          (k) =>
            typeof r[k as keyof Resource] !== "string" ||
            r[k as keyof Resource].length > 2000,
        ),
    )
  )
    throw Error("Invalid project resource response");
  return x.items;
}

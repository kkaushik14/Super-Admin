import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { appOrigin, type Environment } from "./config/environment.ts";
import { randomUUID } from "node:crypto";
import { signedReadHeaders } from "./integrations/admin-signature.ts";
import { isIP } from "node:net";
import { capabilities, type Project, type Resource } from "./types.ts";
export function localProjectOrigin(env: Environment = process.env) {
  try {
    const u = new URL(env.SUPERADMIN_LOCAL_PROJECT_ORIGIN || "");
    if (
      env.NODE_ENV === "development" &&
      !env.VERCEL &&
      !env.VERCEL_ENV &&
      ["localhost", "127.0.0.1"].includes(new URL(appOrigin(env)).hostname) &&
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(u.hostname) &&
      !!u.port &&
      !u.username &&
      !u.password &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash
    )
      return u.origin;
  } catch {}
  return null;
}
export function validateOrigin(raw: string) {
  const u = new URL(raw);
  if (
    u.origin === localProjectOrigin() &&
    !u.username &&
    !u.password &&
    u.pathname === "/" &&
    !u.search &&
    !u.hash
  )
    return u.origin;
  const allowed = (process.env.SUPERADMIN_ALLOWED_PROJECT_HOSTS || "")
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
export function validateProjectConnection(
  p: Pick<Project, "id" | "origin" | "environment">,
) {
  const origin = validateOrigin(p.origin);
  const local = origin === localProjectOrigin();
  if (
    local
      ? p.environment !== "local" || !p.id.endsWith("-local")
      : p.environment === "local"
  )
    throw Error(
      "Local connections require a local environment and a separate -local project ID",
    );
  return { origin, local };
}
export function privateAddress(ip: string) {
  return (
    ip.includes(":") ||
    /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(18|19)\.|22[4-9]\.|23\d\.|24\d\.|25\d\.)/.test(
      ip,
    )
  );
}
export async function callProject(
  p: Project,
  path: string,
  body?: unknown,
  _id: string = randomUUID(),
): Promise<unknown> {
  void _id;
  const { origin, local } = validateProjectConnection(p);
  if (
    body !== undefined ||
    !/^\/api\/admin\/v1\/(manifest|accounts|videos|jobs)$/.test(path)
  )
    throw Error("Project connections only support read-only resources");
  const addresses = local
    ? [{ address: "127.0.0.1" }]
    : await lookup(new URL(origin).hostname, {
        all: true,
        family: 4,
      });
  if (
    !addresses.length ||
    (!local && addresses.some((a) => privateAddress(a.address)))
  )
    throw Error("Project host must resolve to a public address");
  const prefix =
    "SUPERADMIN_PROJECT_" + p.id.toUpperCase().replaceAll("-", "_");
  const secret = process.env[prefix + "_SECRET"] || "";
  const keyId = process.env[prefix + "_KEY_ID"] || "";
  if (secret === process.env.SUPERADMIN_AUTH_SECRET)
    throw Error("Use an independent project credential");
  const headers = signedReadHeaders(
    {
      projectId: p.id,
      environment: p.environment,
      audience: origin,
      keyId,
    },
    path,
    secret,
  );
  return await new Promise((resolve, reject) => {
    const address = addresses[0].address;
    const req = (local ? httpRequest : httpsRequest)(
      origin + path,
      {
        method: "GET",
        family: 4,
        lookup: (_host, _options, callback) => callback(null, address, 4),
        headers,
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
    req.end();
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
        (r.revision !== undefined &&
          (!Number.isInteger(r.revision) ||
            r.revision < 0 ||
            r.revision > 2147483647)) ||
        ["id", "label", "detail", "status"].some(
          (k) =>
            typeof r[k as keyof Resource] !== "string" ||
            r[k as "id" | "label" | "detail" | "status"].length > 2000,
        ),
    )
  )
    throw Error("Invalid project resource response");
  return x.items;
}

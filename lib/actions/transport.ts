import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { validateProjectConnection, privateAddress } from "../connector.ts";
import { signedActionHeaders } from "../integrations/action-signature.ts";
import { actionConfiguration } from "./policy.ts";
import type { Project } from "../types.ts";
export async function actionRequest(
  p: Project,
  method: "GET" | "POST",
  path: string,
  body = "",
): Promise<{ status: number; data: unknown }> {
  const { origin, local } = validateProjectConnection(p);
  const c = actionConfiguration(p, process.env, method === "POST");
  if (Buffer.byteLength(body) > 8192)
    throw Error("Action request is too large");
  const addresses = local
    ? [{ address: "127.0.0.1" }]
    : await lookup(new URL(origin).hostname, { all: true, family: 4 });
  if (
    !addresses.length ||
    (!local && addresses.some((a) => privateAddress(a.address)))
  )
    throw Error("Project host must resolve to a public address");
  const headers = signedActionHeaders(
    {
      projectId: p.id,
      environment: p.environment,
      audience: origin,
      keyId: c.keyId,
    },
    method,
    path,
    body,
    c.secret,
  );
  return new Promise((resolve, reject) => {
    const req = (local ? httpRequest : httpsRequest)(
      origin + path,
      {
        method,
        family: 4,
        lookup: (_h, _o, cb) => cb(null, addresses[0].address, 4),
        headers,
      },
      (res) => {
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (b: Buffer) => {
          bytes += b.length;
          if (bytes > 256 * 1024)
            req.destroy(Error("Action response is too large"));
          else chunks.push(b);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode || 503,
              data:
                res.statusCode === 200
                  ? JSON.parse(Buffer.concat(chunks).toString())
                  : null,
            });
          } catch {
            reject(Error("Invalid action response"));
          }
        });
      },
    );
    const timeout = setTimeout(
      () =>
        req.destroy(
          Error("Action response timed out; reconcile before retrying"),
        ),
      8000,
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
    req.end(body || undefined);
  });
}

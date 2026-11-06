import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { db } from "./store.ts";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer) {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return bits
    .match(/.{1,5}/g)!
    .map((b) => alphabet[parseInt(b.padEnd(5, "0"), 2)])
    .join("");
}
export function otp(secret: string, step = Math.floor(Date.now() / 30000)) {
  const bits = [...secret]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    (bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash[19] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}
export function consumeOtp(email: string, secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const step = Math.floor(Date.now() / 30000);
  for (const t of [step, step - 1, step + 1])
    if (timingSafeEqual(Buffer.from(otp(secret, t)), Buffer.from(code))) {
      return (
        Number(
          db()
            .prepare(
              "UPDATE admins SET lastStep=? WHERE email=? AND lastStep < ?",
            )
            .run(t, email, t).changes,
        ) === 1
      );
    }
  return false;
}
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export function createSession(email: string) {
  const token = randomBytes(32).toString("hex");
  db().prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
  db()
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(digest(token), email, Date.now() + 8 * 3600_000);
  return token;
}
export function preview() {
  return (
    process.env.NODE_ENV === "development" && process.env.ADMIN_PREVIEW === "1"
  );
}
export function actor(cookie: string | undefined) {
  if (!cookie) return null;
  const row = db()
    .prepare("SELECT email FROM sessions WHERE digest=? AND expires>?")
    .get(digest(cookie), Date.now()) as { email: string } | undefined;
  return row?.email || null;
}
export function sameOrigin(request: Request) {
  const configured = new URL(
    process.env.ADMIN_ORIGIN || "http://localhost:3100",
  ).origin;
  if (request.headers.get("origin") !== configured)
    throw Error("Request origin rejected");
}

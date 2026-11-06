import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { db } from "../lib/store.ts";
import { base32, hashPassword } from "../lib/auth.ts";
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const email = (await rl.question("Administrator email: "))
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error("Invalid email");
  const password = randomBytes(24).toString("base64url"),
    secret = base32(randomBytes(20));
  db()
    .prepare("INSERT INTO admins(email,password,totp) VALUES(?,?,?)")
    .run(email, hashPassword(password), secret);
  console.log(
    "\nStore this generated password in your password manager:\n" +
      password +
      "\n\nAdd this setup key to your authenticator:\n" +
      secret +
      "\n\nAuthenticator URI:\n" +
      `otpauth://totp/Super%20Admin:${encodeURIComponent(email)}?secret=${secret}&issuer=Super%20Admin` +
      "\n\nDisable ADMIN_PREVIEW after setup. Credentials are shown only here.",
  );
} finally {
  rl.close();
}

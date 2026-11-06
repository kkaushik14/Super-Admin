import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
// Local helper only: no database access and no production administrator creation.
const password = randomBytes(24).toString("base64url");
console.log(
  "Save this temporary development password in your password manager:\n" +
    password +
    "\n\nSet SUPERADMIN_DEV_PASSWORD_HASH to:\n" +
    ("bcrypt:" +
      Buffer.from(await bcrypt.hash(password, 12)).toString("base64")) +
    "\n\nSet SUPERADMIN_DEV_EMAIL and enable SUPERADMIN_DEV_LOGIN_ENABLED=1 for local testing only.",
);

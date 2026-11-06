import { connectToDatabase } from "../db.ts";
import Counter from "../../models/RateLimit.ts";
import { digest } from "../auth/policy.ts";
export async function rateLimit(
  identity: string,
  maximum = 8,
  windowMs = 900000,
  now = Date.now(),
) {
  await connectToDatabase();
  const window = Math.floor(now / windowMs),
    key = digest(identity + ":" + window);
  let row;
  try {
    row = await Counter.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) },
      },
      { upsert: true, new: true },
    );
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    row = await Counter.findOneAndUpdate(
      { key },
      { $inc: { count: 1 } },
      { new: true },
    );
  }
  if (!row || row.count > maximum)
    throw Error("Too many attempts. Please wait before trying again.");
}

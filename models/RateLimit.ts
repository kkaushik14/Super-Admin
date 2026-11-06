import mongoose, { Schema } from "mongoose";
export interface Counter {
  key: string;
  count: number;
  expiresAt: Date;
}
const schema = new Schema<Counter>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default (mongoose.models.RateLimit as mongoose.Model<Counter>) ||
  mongoose.model<Counter>("RateLimit", schema);

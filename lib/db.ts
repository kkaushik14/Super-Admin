import mongoose from "mongoose";
import Command from "../models/Command.ts";
import { databaseConfiguration } from "./config/environment.ts";
import Project from "../models/Project.ts";
import Audit from "../models/Audit.ts";
import Admin from "../models/Admin.ts";
import Session from "../models/Session.ts";
import RateLimit from "../models/RateLimit.ts";
const globalDatabase = globalThis as typeof globalThis & {
  superAdminMongo?: {
    promise: Promise<typeof mongoose> | null;
    ready: Promise<void> | null;
  };
};
const cached =
  globalDatabase.superAdminMongo ??
  (globalDatabase.superAdminMongo = { promise: null, ready: null });
export async function connectToDatabase(seed = true) {
  if (mongoose.connection.readyState === 0) {
    cached.promise = null;
    cached.ready = null;
  }
  if (mongoose.connection.readyState !== 1) {
    if (!cached.promise) {
      const { uri, dbName } = databaseConfiguration();
      cached.promise = mongoose
        .connect(uri, {
          dbName,
          bufferCommands: false,
          autoCreate: false,
          autoIndex: false,
          maxPoolSize: 5,
          minPoolSize: 0,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 10000,
        })
        .catch(() => {
          cached.promise = null;
          cached.ready = null;
          throw Error("Administration database is unavailable");
        });
    }
    await cached.promise;
  }
  if (!cached.ready)
    cached.ready = (async () => {
      // Initialize only after connection, in order. Mongoose's automatic model
      // initialization caches rejected promises and can race fresh databases.
      for (const model of [
        Project,
        Command,
        Audit,
        Admin,
        Session,
        RateLimit,
      ]) {
        await model.createCollection();
        await model.createIndexes();
      }
      if (!seed) return;
      try {
        await Project.updateOne(
          { id: "reelogram" },
          {
            $setOnInsert: {
              id: "reelogram",
              name: "ReeloGram",
              origin: "https://www.reelogram.in",
              environment: "production",
              status: "not-connected",
              capabilities: [],
              lastChecked: null,
              version: null,
            },
          },
          { upsert: true },
        );
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
      }
    })().catch((error: unknown) => {
      const code = (error as { code?: unknown })?.code;
      console.error(
        "Administration database initialization failed",
        typeof code === "number" ? code : "unavailable",
      );
      cached.ready = null;
      throw Error("Administration database initialization failed");
    });
  await cached.ready;
  return mongoose.connection;
}

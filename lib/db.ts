import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import type { Project } from "./types.ts";
let database: DatabaseSync;
export function db() {
  if (database) return database;
  const dir = resolve(process.env.ADMIN_DATA_DIR || ".data");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  database = new DatabaseSync(resolve(dir, "admin.sqlite"));
  chmodSync(resolve(dir, "admin.sqlite"), 0o600);
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, projectId TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS admins(email TEXT PRIMARY KEY, password TEXT NOT NULL, totp TEXT NOT NULL, lastStep INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
  const initial: Project = {
    id: "reelogram",
    name: "ReeloGram",
    origin: "https://www.reelogram.in",
    environment: "production",
    status: "not-connected",
    capabilities: [],
    lastChecked: null,
    version: null,
  };
  database
    .prepare("INSERT OR IGNORE INTO projects VALUES(?,?)")
    .run(initial.id, JSON.stringify(initial));
  return database;
}

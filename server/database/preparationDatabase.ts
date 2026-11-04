import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getWorkspaceContext } from "../context/workspaceContext";

const connections = new Map<string, Database.Database>();
export function getPreparationDatabase() {
  const file = path.join(
    getWorkspaceContext().dataDirectory,
    "preparations.sqlite",
  );
  const existing = connections.get(file);
  if (existing?.open) return existing;
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  if (Number(db.pragma("user_version", { simple: true })) > 1) {
    db.close();
    throw new Error(
      "备课数据库版本高于当前程序，未修改已有数据，请使用对应程序版本。",
    );
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS preparations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS preparations_owner ON preparations(owner_id);
    CREATE TABLE IF NOT EXISTS preparation_documents (id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL REFERENCES preparations(id), owner_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS preparation_revisions (document_id TEXT NOT NULL REFERENCES preparation_documents(id), revision INTEGER NOT NULL, owner_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(document_id,revision));
    CREATE TABLE IF NOT EXISTS preparation_sources (id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL REFERENCES preparations(id), owner_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS preparation_assets (id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL REFERENCES preparations(id), owner_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS preparation_proposals (id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL REFERENCES preparations(id), owner_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS preparation_tasks (id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL REFERENCES preparations(id), owner_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS preparation_operations (owner_id TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(owner_id,id));
    CREATE TABLE IF NOT EXISTS preparation_settings (owner_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner_id,name));
    CREATE TABLE IF NOT EXISTS preparation_sessions (owner_id TEXT NOT NULL, session_id TEXT NOT NULL, preparation_id TEXT NOT NULL REFERENCES preparations(id), data TEXT NOT NULL, PRIMARY KEY(owner_id,session_id));
    CREATE INDEX IF NOT EXISTS preparation_documents_parent ON preparation_documents(owner_id,preparation_id);
    CREATE INDEX IF NOT EXISTS preparation_tasks_parent ON preparation_tasks(owner_id,preparation_id);
    PRAGMA user_version = 1;
  `);
  connections.set(file, db);
  return db;
}
export function closePreparationDatabase() {
  for (const db of connections.values()) if (db.open) db.close();
  connections.clear();
}

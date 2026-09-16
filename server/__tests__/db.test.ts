import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect, beforeEach } from 'vitest';
import { SCHEMA } from '../lib/db';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return db;
}

describe('schema', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => { db = makeDb(); });

  it('creates all three tables', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(t => t.name);
    expect(tables).toContain('packages');
    expect(tables).toContain('beacons');
    expect(tables).toContain('heartbeats');
  });

  it('inserts and retrieves a package', () => {
    db.prepare("INSERT INTO packages (name, status) VALUES (?, ?)").run('test-pkg', 'published');
    const pkg = db.prepare("SELECT status FROM packages WHERE name = ?").get('test-pkg') as { status: string };
    expect(pkg.status).toBe('published');
  });

  it('defaults package status to pending', () => {
    db.prepare("INSERT INTO packages (name) VALUES (?)").run('default-pkg');
    const pkg = db.prepare("SELECT status FROM packages WHERE name = ?").get('default-pkg') as { status: string };
    expect(pkg.status).toBe('pending');
  });

  it('enforces unique package names', () => {
    db.prepare("INSERT INTO packages (name) VALUES (?)").run('dup');
    expect(() => db.prepare("INSERT INTO packages (name) VALUES (?)").run('dup')).toThrow();
  });

  it('inserts and retrieves a beacon', () => {
    db.prepare("INSERT INTO beacons (beacon_id, pkg_name, hostname) VALUES (?, ?, ?)").run('uuid-1', 'my-pkg', 'victim-host');
    const b = db.prepare("SELECT pkg_name, hostname FROM beacons WHERE beacon_id = ?").get('uuid-1') as { pkg_name: string; hostname: string };
    expect(b.pkg_name).toBe('my-pkg');
    expect(b.hostname).toBe('victim-host');
  });

  it('beacon_id must be unique', () => {
    db.prepare("INSERT INTO beacons (beacon_id, pkg_name) VALUES (?, ?)").run('same-id', 'pkg');
    expect(() => db.prepare("INSERT INTO beacons (beacon_id, pkg_name) VALUES (?, ?)").run('same-id', 'pkg2')).toThrow();
  });

  it('records heartbeats referencing a beacon', () => {
    db.prepare("INSERT INTO beacons (beacon_id, pkg_name) VALUES (?, ?)").run('uuid-2', 'pkg');
    const { id } = db.prepare("SELECT id FROM beacons WHERE beacon_id = ?").get('uuid-2') as { id: number };
    db.prepare("INSERT INTO heartbeats (beacon_id) VALUES (?)").run(id);
    const hbs = db.prepare("SELECT * FROM heartbeats WHERE beacon_id = ?").all(id) as unknown[];
    expect(hbs.length).toBe(1);
  });
});

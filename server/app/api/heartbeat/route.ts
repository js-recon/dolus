import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.beacon_id) return NextResponse.json({ error: 'beacon_id required' }, { status: 400 });

  const beacon = db.prepare('SELECT id FROM beacons WHERE beacon_id = ?').get(body.beacon_id) as { id: number } | undefined;
  if (!beacon) return NextResponse.json({ error: 'unknown beacon' }, { status: 404 });

  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE beacons SET last_seen = ? WHERE id = ?').run(now, beacon.id);
  db.prepare('INSERT INTO heartbeats (beacon_id, ts) VALUES (?, ?)').run(beacon.id, now);

  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beacon = db.prepare('SELECT * FROM beacons WHERE id = ?').get(id);
  if (!beacon) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const heartbeats = db.prepare('SELECT ts FROM heartbeats WHERE beacon_id = ? ORDER BY ts DESC LIMIT 20').all((beacon as { id: number }).id);
  return NextResponse.json({ ...beacon as object, heartbeats });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beacon = db.prepare('SELECT id FROM beacons WHERE id = ?').get(id);
  if (!beacon) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { action?: string };
  const now = Math.floor(Date.now() / 1000);

  if (body.action === 'shell') {
    db.prepare('UPDATE beacons SET shell_requested = 1 WHERE id = ?').run(id);
  } else if (body.action === 'shell_clear') {
    db.prepare('UPDATE beacons SET shell_requested = 0 WHERE id = ?').run(id);
  } else {
    // default: destroy
    db.prepare('UPDATE beacons SET kill = 1, destroyed_at = ? WHERE id = ?').run(now, id);
  }
  return NextResponse.json({ ok: true });
}

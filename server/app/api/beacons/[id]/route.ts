import { NextResponse } from 'next/server';
import db from '@/lib/db';

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const beacon = db.prepare('SELECT * FROM beacons WHERE id = ?').get(params.id);
  if (!beacon) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const heartbeats = db.prepare('SELECT ts FROM heartbeats WHERE beacon_id = ? ORDER BY ts DESC LIMIT 20').all((beacon as { id: number }).id);
  return NextResponse.json({ ...beacon as object, heartbeats });
}

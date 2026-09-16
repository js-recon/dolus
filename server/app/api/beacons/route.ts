import { NextResponse } from 'next/server';
import db from '@/lib/db';

export function GET() {
  const beacons = db.prepare('SELECT * FROM beacons ORDER BY last_seen DESC').all();
  return NextResponse.json(beacons);
}

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '@/lib/db';

export function GET() {
  const powEnabled = (db.prepare("SELECT value FROM settings WHERE key = 'pow_enabled'").get() as { value: string } | undefined)?.value === '1';

  // Clean up expired challenges
  db.prepare('DELETE FROM pow_challenges WHERE created_at < unixepoch() - 900').run();

  if (!powEnabled) {
    return NextResponse.json({ enabled: false });
  }

  const difficulty = parseInt(
    (db.prepare("SELECT value FROM settings WHERE key = 'pow_difficulty'").get() as { value: string } | undefined)?.value ?? '5',
    10
  ) || 5;

  const nonce = crypto.randomUUID();
  db.prepare('INSERT INTO pow_challenges (nonce) VALUES (?)').run(nonce);

  return NextResponse.json({ enabled: true, nonce, difficulty });
}

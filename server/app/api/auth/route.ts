import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyPassword, createSessionToken } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: 'username and password required' }, { status: 400 });
  }
  if (body.username !== 'dolus') {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = 'password_hash'").get() as { value: string } | undefined;
  if (!row || !verifyPassword(body.password, row.value)) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }
  return NextResponse.json({ token: createSessionToken() });
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { publishPackage } from '@/lib/publish';

export function GET() {
  const packages = db.prepare('SELECT * FROM packages ORDER BY created_at DESC').all();
  return NextResponse.json(packages);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const names: string[] = Array.isArray(body.names)
    ? body.names
    : body.name
    ? [body.name]
    : [];

  if (names.length === 0) {
    return NextResponse.json({ error: 'name or names required' }, { status: 400 });
  }

  const results = [];
  for (const name of names) {
    if (db.prepare('SELECT id FROM packages WHERE name = ?').get(name)) {
      results.push({ name, status: 'exists' });
      continue;
    }
    db.prepare("INSERT INTO packages (name, status) VALUES (?, 'pending')").run(name);
    const { success, output } = publishPackage(name);
    const status = success ? 'published' : 'failed';
    db.prepare('UPDATE packages SET status = ? WHERE name = ?').run(status, name);
    results.push({ name, status, output });
  }

  return NextResponse.json({ results });
}

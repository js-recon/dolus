import { NextResponse } from 'next/server';
import db, { type Account } from '@/lib/db';
import { publishPackage } from '@/lib/publish';

export function GET() {
  const packages = db.prepare(`
    SELECT p.*, a.registry_url, a.c2_url
    FROM packages p LEFT JOIN accounts a ON p.account_id = a.id
    ORDER BY p.created_at DESC
  `).all();
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

  // Resolve account: by account_id in body, or fall back to env vars
  let registryUrl: string;
  let token: string | null;
  let c2Url: string;
  let accountId: number | null = null;

  if (body.account_id) {
    const acct = db.prepare('SELECT * FROM accounts WHERE id = ?').get(body.account_id) as Account | undefined;
    if (!acct) return NextResponse.json({ error: 'account not found' }, { status: 400 });
    registryUrl = acct.registry_url;
    token = acct.token;
    c2Url = acct.c2_url;
    accountId = acct.id;
  } else {
    registryUrl = process.env.REGISTRY_URL ?? '';
    token = process.env.REGISTRY_AUTH_TOKEN ?? null;
    c2Url = process.env.C2_URL ?? 'http://localhost:3000';
    if (!registryUrl) return NextResponse.json({ error: 'REGISTRY_URL not set and no account_id provided' }, { status: 400 });
  }

  const results = [];
  for (const name of names) {
    if (db.prepare('SELECT id FROM packages WHERE name = ?').get(name)) {
      results.push({ name, status: 'exists' });
      continue;
    }
    db.prepare("INSERT INTO packages (name, status, account_id) VALUES (?, 'pending', ?)").run(name, accountId);
    const { success, output } = publishPackage(name, registryUrl, token, c2Url);
    const status = success ? 'published' : 'failed';
    db.prepare('UPDATE packages SET status = ? WHERE name = ?').run(status, name);
    results.push({ name, status, output });
  }

  return NextResponse.json({ results });
}

import { NextResponse } from 'next/server';
import db, { type Account } from '@/lib/db';
import { publishCampaign } from '@/lib/publish';

export function GET() {
  const campaigns = db.prepare(`
    SELECT c.*, a.name AS account_name,
      (SELECT COUNT(*) FROM packages p WHERE p.campaign_id = c.id) AS package_count
    FROM campaigns c
    LEFT JOIN accounts a ON c.account_id = a.id
    ORDER BY c.created_at DESC
  `).all();
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, account_id, depth = 1 } = body;

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });

  const acct = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id) as Account | undefined;
  if (!acct) return NextResponse.json({ error: 'account not found' }, { status: 400 });

  // Check if campaign name already exists
  if (db.prepare('SELECT id FROM campaigns WHERE name = ?').get(name)) {
    return NextResponse.json({ error: 'campaign name already exists' }, { status: 400 });
  }

  const beaconSecret = (db.prepare("SELECT value FROM settings WHERE key = 'beacon_secret'").get() as { value: string } | undefined)?.value ?? '';

  const result = publishCampaign(name, account_id, Math.min(Math.max(depth, 0), 3), beaconSecret);
  return NextResponse.json(result);
}

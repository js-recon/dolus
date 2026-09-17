import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { unpublishPackage } from '@/lib/publish';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.prepare(
    'SELECT p.name, a.registry_url, a.token FROM packages p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.id = ?'
  ).get(id) as { name: string; registry_url: string | null; token: string | null } | undefined;

  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (row.registry_url) unpublishPackage(row.name, row.registry_url, row.token ?? null);
  db.prepare('DELETE FROM packages WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}

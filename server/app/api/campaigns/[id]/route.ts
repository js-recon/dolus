import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { deleteCampaign } from '@/lib/publish';

export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const packages = db.prepare('SELECT * FROM packages WHERE campaign_id = ? ORDER BY id').all(id);
    return NextResponse.json({ ...campaign as object, packages });
  });
}

export function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => {
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(id);
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const result = deleteCampaign(Number(id));
    return NextResponse.json(result);
  });
}

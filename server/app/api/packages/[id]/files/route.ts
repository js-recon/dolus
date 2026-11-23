import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { fetchPackageFiles } from '@/lib/publish';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  if (!jar.get('dolus_session')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pkg = db.prepare(`
    SELECT p.name, p.version, p.status, p.publish_files, a.registry_url
    FROM packages p LEFT JOIN accounts a ON p.account_id = a.id
    WHERE p.id = ?
  `).get(id) as { name: string; version: string; status: string; publish_files: string | null; registry_url: string | null } | undefined;

  if (!pkg) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Try stored files first (pre-obfuscation source)
  if (pkg.publish_files) {
    return NextResponse.json({ source: 'stored', files: JSON.parse(pkg.publish_files) });
  }

  // Fall back to fetching from registry for published packages
  if (pkg.status === 'published' && pkg.registry_url) {
    const files = fetchPackageFiles(pkg.name, pkg.registry_url, pkg.version);
    if (files) return NextResponse.json({ source: 'registry', files });
  }

  return NextResponse.json({ source: 'none', files: null });
}

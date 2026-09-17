import db from '@/lib/db';
import { type Beacon } from '@/lib/db';
import { notFound } from 'next/navigation';
import WebShellClient from './shell-client';

export const dynamic = 'force-dynamic';

export default async function ShellPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beacon = db.prepare('SELECT * FROM beacons WHERE id = ?').get(id) as Beacon | undefined;
  if (!beacon) notFound();

  const idleTimeoutRow = db.prepare("SELECT value FROM settings WHERE key = 'shell_idle_timeout'").get() as { value: string } | undefined;
  const idleTimeout = parseInt(idleTimeoutRow?.value || '180', 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href={`/beacons/${beacon.id}`} className="text-xs text-gray-400 hover:text-white">← {beacon.hostname || beacon.beacon_id}</a>
        <span className="text-xs text-gray-600">/</span>
        <span className="text-xs text-gray-400">shell</span>
      </div>
      <WebShellClient beaconId={beacon.id} beaconUuid={beacon.beacon_id} idleTimeout={idleTimeout} />
    </div>
  );
}

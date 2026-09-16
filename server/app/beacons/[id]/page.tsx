import db, { type Beacon } from '@/lib/db';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-800 p-4">
      <div className="text-xs text-gray-400 mb-3">{title}</div>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-4 text-sm py-0.5">
      <span className="text-gray-400 w-28 shrink-0">{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}

export default async function BeaconDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beacon = db.prepare('SELECT * FROM beacons WHERE id = ?').get(id) as Beacon | undefined;
  if (!beacon) notFound();

  const heartbeats = db.prepare('SELECT ts FROM heartbeats WHERE beacon_id = ? ORDER BY ts DESC LIMIT 20').all(beacon.id) as { ts: number }[];
  const now = Math.floor(Date.now() / 1000);
  const alive = beacon.last_seen > now - 120;

  let ifaces: Record<string, { address: string; family: string; internal: boolean }[]> = {};
  let dirTree: { name: string; type: string; path: string }[] = [];
  let envVars: Record<string, string> = {};
  try { ifaces = JSON.parse(beacon.interfaces || '{}'); } catch (_) {}
  try { dirTree = JSON.parse(beacon.dir_tree || '[]'); } catch (_) {}
  try { envVars = JSON.parse(beacon.env_vars || '{}'); } catch (_) {}

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${alive ? 'bg-green-400' : 'bg-red-600'}`} />
        <h1 className="text-lg font-bold">{beacon.hostname || beacon.beacon_id}</h1>
        <span className="text-gray-400 text-sm">{beacon.pkg_name}</span>
      </div>

      <Section title="SYSTEM">
        <KV label="hostname" value={beacon.hostname} />
        <KV label="username" value={beacon.username} />
        <KV label="platform" value={beacon.platform} />
        <KV label="arch" value={beacon.arch} />
        <KV label="os release" value={beacon.os_release} />
        <KV label="cwd" value={beacon.cwd} />
        <KV label="first seen" value={new Date(beacon.created_at * 1000).toLocaleString()} />
        <KV label="last seen" value={new Date(beacon.last_seen * 1000).toLocaleString()} />
      </Section>

      {Object.keys(ifaces).length > 0 && (
        <Section title="NETWORK INTERFACES">
          <div className="space-y-2 text-sm">
            {Object.entries(ifaces).map(([name, addrs]) => (
              <div key={name}>
                <span className="text-gray-400">{name}</span>
                {addrs.map((a, i) => (
                  <div key={i} className="ml-4 text-xs text-gray-300">
                    {a.address} ({a.family}){a.internal ? ' [lo]' : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      {Object.keys(envVars).length > 0 && (
        <Section title="ENV VARS">
          <div className="text-sm space-y-0.5">
            {Object.entries(envVars).map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="text-gray-400 w-20 shrink-0">{k}</span>
                <span className="text-xs break-all">{v}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {dirTree.length > 0 && (
        <Section title={`DIR TREE (${beacon.cwd})`}>
          <pre className="text-xs text-gray-300 overflow-x-auto max-h-64">
            {dirTree.map(e => `${e.type === 'd' ? '📁' : '  '} ${e.path}`).join('\n')}
          </pre>
        </Section>
      )}

      {heartbeats.length > 0 && (
        <Section title="HEARTBEAT LOG (last 20)">
          <div className="text-xs text-gray-400 space-y-0.5">
            {heartbeats.map((h, i) => (
              <div key={i}>{new Date(h.ts * 1000).toLocaleString()}</div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

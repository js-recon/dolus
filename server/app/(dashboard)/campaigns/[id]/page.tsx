import db, { type Campaign, type Package } from '@/lib/db';
import Link from 'next/link';
import { deleteCampaignAction } from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-yellow-400',
  published: 'text-green-400',
  failed: 'text-red-500',
};

const ROLE_STYLE: Record<string, string> = {
  entrypoint: 'bg-purple-900/50 text-purple-300',
  shell: 'bg-gray-800 text-gray-400',
  'cap-os': 'bg-blue-900/50 text-blue-300',
  'cap-fs': 'bg-green-900/50 text-green-300',
  'cap-net': 'bg-orange-900/50 text-orange-300',
  'cap-cp': 'bg-red-900/50 text-red-300',
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = db.prepare(`
    SELECT c.*, a.name AS account_name, a.registry_url
    FROM campaigns c LEFT JOIN accounts a ON c.account_id = a.id
    WHERE c.id = ?
  `).get(id) as (Campaign & { account_name: string | null; registry_url: string | null }) | undefined;

  if (!campaign) return <p className="text-red-500">campaign not found</p>;

  const packages = db.prepare('SELECT * FROM packages WHERE campaign_id = ? ORDER BY id').all(id) as Package[];

  // Group by role for display
  const entrypoint = packages.find(p => p.role === 'entrypoint');
  const caps = packages.filter(p => p.role?.startsWith('cap-'));
  const shells = packages.filter(p => p.role === 'shell');

  return (
    <div className="max-w-4xl">
      <Link href="/campaigns" className="text-gray-500 text-sm hover:text-white">← campaigns</Link>
      <h1 className="text-xl font-bold mt-2 mb-1">{campaign.name}</h1>
      <p className="text-gray-400 text-sm mb-4">
        account: {campaign.account_name || '—'} · depth: {campaign.depth} · {packages.length} packages
      </p>

      <div className="mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-2">entrypoint (postinstall hook)</h2>
        {entrypoint && (
          <div className="border border-gray-800 rounded px-3 py-2 text-sm flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs ${ROLE_STYLE.entrypoint}`}>entrypoint</span>
            <code>{entrypoint.name}</code>
            <span className={STATUS_STYLE[entrypoint.status] || ''}>{entrypoint.status}</span>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-2">capability packages (one dangerous require each)</h2>
        <div className="space-y-1">
          {caps.map(p => (
            <div key={p.id} className="border border-gray-800 rounded px-3 py-2 text-sm flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-xs ${ROLE_STYLE[p.role!] || ROLE_STYLE.shell}`}>{p.role}</span>
              <code>{p.name}</code>
              <span className={STATUS_STYLE[p.status] || ''}>{p.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-2">shell packages (zero capabilities, re-export only)</h2>
        <div className="space-y-1">
          {shells.map(p => (
            <div key={p.id} className="border border-gray-800 rounded px-3 py-2 text-sm flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-xs ${ROLE_STYLE.shell}`}>shell</span>
              <code>{p.name}</code>
              <span className={STATUS_STYLE[p.status] || ''}>{p.status}</span>
            </div>
          ))}
          {shells.length === 0 && <p className="text-gray-500 text-xs">none (depth 0 — direct dependencies)</p>}
        </div>
      </div>

      <div className="mt-8 border-t border-gray-800 pt-4">
        <form action={deleteCampaignAction}>
          <input type="hidden" name="id" value={campaign.id} />
          <button type="submit" className="text-red-500 hover:text-red-400 text-sm">
            delete campaign (unpublish all packages)
          </button>
        </form>
      </div>
    </div>
  );
}

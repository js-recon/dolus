import db, { type Campaign, type Package } from '@/lib/db';
import Link from 'next/link';
import { deleteCampaignAction, retryCampaignFailedAction } from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  partial: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-yellow-400',
  published: 'bg-emerald-400',
  failed: 'bg-red-400',
};

const ROLE_STYLE: Record<string, string> = {
  entrypoint: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
  shell: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
  'cap-os': 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  'cap-fs': 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  'cap-net': 'bg-orange-500/15 text-orange-300 border border-orange-500/30',
  'cap-cp': 'bg-red-500/15 text-red-300 border border-red-500/30',
};

function PackageRow({ pkg }: { pkg: Package }) {
  return (
    <Link
      href={`/packages/${pkg.id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-800/50 hover:border-gray-700 hover:bg-gray-900 transition-all group"
    >
      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${ROLE_STYLE[pkg.role!] || ROLE_STYLE.shell}`}>
        {pkg.role}
      </span>
      <code className="text-sm text-gray-200 group-hover:text-white transition-colors">{pkg.name}</code>
      <span className="ml-auto flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[pkg.status] || 'bg-gray-400'}`} />
        <span className={`text-xs ${pkg.status === 'published' ? 'text-emerald-400' : pkg.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
          {pkg.status}
        </span>
      </span>
      <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retried?: string; status?: string }>;
}) {
  const { id } = await params;
  const { retried, status } = await searchParams;

  const campaign = db.prepare(`
    SELECT c.*, a.name AS account_name, a.registry_url
    FROM campaigns c LEFT JOIN accounts a ON c.account_id = a.id
    WHERE c.id = ?
  `).get(id) as (Campaign & { account_name: string | null; registry_url: string | null }) | undefined;

  if (!campaign) return <p className="text-red-400">campaign not found</p>;

  const packages = db.prepare('SELECT * FROM packages WHERE campaign_id = ? ORDER BY id').all(id) as Package[];
  const splitAnalysis = campaign.split_analysis ? JSON.parse(campaign.split_analysis as string) : null;

  const entrypoint = packages.find(p => p.role === 'entrypoint');
  const caps = packages.filter(p => p.role?.startsWith('cap-'));
  const shells = packages.filter(p => p.role === 'shell');
  const failedCount = packages.filter(p => p.status === 'failed').length;
  const publishedCount = packages.filter(p => p.status === 'published').length;

  return (
    <div className="max-w-3xl">
      <Link href="/campaigns" className="text-gray-500 text-xs hover:text-gray-300 transition-colors">← campaigns</Link>

      {/* Header */}
      <div className="mt-3 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-semibold tracking-tight">{campaign.name}</h1>
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_STYLE[campaign.status] || ''}`}>
            {campaign.status}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>account: <span className="text-gray-400">{campaign.account_name || '—'}</span></span>
          <span>depth: <span className="text-gray-400">{campaign.depth}</span></span>
          <span>{publishedCount}/{packages.length} published</span>
          {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
        </div>
      </div>

      {/* Retry banner */}
      {retried === '1' && (
        <div className={`text-sm rounded-lg px-4 py-3 mb-6 border ${status === 'ok' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
          {status === 'ok' ? 'retry succeeded — check updated statuses below' : 'retry failed — check account credentials and registry'}
        </div>
      )}

      {/* Retry failed button */}
      {failedCount > 0 && (
        <div className="mb-6">
          <form action={retryCampaignFailedAction}>
            <input type="hidden" name="id" value={campaign.id} />
            <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-300 text-sm hover:bg-orange-500/20 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              retry {failedCount} failed package{failedCount > 1 ? 's' : ''}
            </button>
          </form>
        </div>
      )}

      {/* Entrypoint */}
      <div className="mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Entrypoint</h2>
        <p className="text-[11px] text-gray-600 mb-2">postinstall hook — requires all capability chains</p>
        {entrypoint && <PackageRow pkg={entrypoint} />}
      </div>

      {/* Capability packages */}
      <div className="mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Capability Packages</h2>
        <p className="text-[11px] text-gray-600 mb-2">one dangerous require each</p>
        <div className="space-y-1.5">
          {caps.map(p => <PackageRow key={p.id} pkg={p} />)}
        </div>
      </div>

      {/* Shell packages */}
      <div className="mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Shell Packages</h2>
        <p className="text-[11px] text-gray-600 mb-2">zero capabilities, re-export only</p>
        <div className="space-y-1.5">
          {shells.map(p => <PackageRow key={p.id} pkg={p} />)}
          {shells.length === 0 && <p className="text-gray-600 text-xs italic">none (depth 0 — direct dependencies)</p>}
        </div>
      </div>

      {/* Split analysis */}
      {splitAnalysis && (
        <div className="mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Split Analysis</h2>
          <div className="rounded-lg bg-gray-900/50 border border-gray-800/50 p-4 space-y-3 text-sm">
            <div>
              <span className="text-gray-500 text-xs">dangerous requires:</span>
              <span className="ml-2 text-red-400 text-xs">{splitAnalysis.found?.join(', ')}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs">safe (kept in entrypoint):</span>
              <span className="ml-2 text-emerald-400 text-xs">{splitAnalysis.safe?.join(', ')}</span>
            </div>
            {splitAnalysis.capFiles && (
              <div className="flex flex-wrap gap-3 pt-1">
                {splitAnalysis.capFiles.map((cf: { role: string; lines: number }) => (
                  <span key={cf.role} className="text-[11px] text-gray-500 bg-gray-800/50 px-2 py-1 rounded">
                    {cf.role}: {cf.lines} lines
                  </span>
                ))}
                {splitAnalysis.entrypointLines && (
                  <span className="text-[11px] text-gray-500 bg-gray-800/50 px-2 py-1 rounded">
                    entrypoint: {splitAnalysis.entrypointLines} lines
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="mt-10 pt-6 border-t border-gray-800/50">
        <form action={deleteCampaignAction}>
          <input type="hidden" name="id" value={campaign.id} />
          <button type="submit" className="text-xs text-red-500/70 hover:text-red-400 transition-colors">
            delete campaign (unpublish all packages)
          </button>
        </form>
      </div>
    </div>
  );
}

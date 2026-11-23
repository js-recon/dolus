import db, { type Package, type Account, type Payload } from '@/lib/db';
import Link from 'next/link';
import { checkPackageAction, publishPackageAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-yellow-400',
  published: 'bg-emerald-400',
  failed: 'bg-red-400',
};

type PackageRow = Package & { registry_url: string | null; c2_url: string | null; payload_name: string | null };

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; account_ref?: string; payload_id?: string; ready?: string; error?: string; unpublish_error?: string; published?: string; status?: string }>;
}) {
  const sp = await searchParams;

  const accounts = db.prepare('SELECT * FROM accounts ORDER BY name').all() as Account[];
  const payloads = db.prepare('SELECT * FROM payloads ORDER BY builtin DESC, name ASC').all() as Payload[];
  const registries = Array.from(new Set(accounts.map(a => a.registry_url)));

  const packages = db.prepare(`
    SELECT p.*, a.registry_url, a.c2_url, pl.name AS payload_name
    FROM packages p
    LEFT JOIN accounts a ON p.account_id = a.id
    LEFT JOIN payloads pl ON p.payload_id = pl.id
    ORDER BY p.created_at DESC
  `).all() as PackageRow[];

  const errorMsg: Record<string, string> = {
    'taken': `"${sp.name}" already exists on that registry — choose a different name`,
    'no-account': 'no matching account found — add one under Accounts',
    'no-name': 'package name is required',
    'already-registered': `"${sp.name}" is already registered in Dolus`,
    'registry-unreachable': 'could not reach the registry to check availability',
  };

  return (
    <div className="max-w-5xl space-y-8">
      {/* Banners */}
      {sp.published && sp.status && (
        <div className={`text-sm rounded-lg border px-4 py-3 ${sp.status === 'ok' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
          {sp.status === 'ok' ? `published ${sp.published} successfully` : `failed to publish ${sp.published} — check account credentials`}
        </div>
      )}
      {sp.unpublish_error && (
        <div className="text-sm rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 px-4 py-3">
          npm unpublish failed — package may still be live on the registry: {decodeURIComponent(sp.unpublish_error)}
        </div>
      )}

      {/* Add package form */}
      <div className="rounded-lg bg-gray-900/50 border border-gray-800/50 p-5 max-w-lg">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          {sp.ready === '1' ? 'Confirm Publish' : 'Add Package'}
        </h2>

        {sp.error && (
          <div className="text-sm rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 px-4 py-3 mb-4">
            {errorMsg[sp.error] ?? sp.error}
          </div>
        )}

        {accounts.length === 0 ? (
          <p className="text-gray-500 text-sm">no accounts configured — <Link href="/accounts/new" className="text-gray-300 hover:text-white underline">add one first</Link></p>
        ) : sp.ready === '1' ? (
          <form action={publishPackageAction} className="space-y-3">
            <input type="hidden" name="name" value={sp.name} />
            <input type="hidden" name="account_ref" value={sp.account_ref} />
            <input type="hidden" name="payload_id" value={sp.payload_id ?? ''} />
            <p className="text-sm">
              Publish <span className="text-white font-semibold">{sp.name}</span> via{' '}
              <span className="text-gray-300">{sp.account_ref}</span>
              {sp.payload_id && payloads.find(p => String(p.id) === sp.payload_id) && (
                <> using payload <span className="text-gray-300">{payloads.find(p => String(p.id) === sp.payload_id)!.name}</span></>
              )}?
            </p>
            <div className="flex gap-3">
              <button type="submit" className="border border-white/20 px-4 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors">
                confirm publish
              </button>
              <Link href="/packages" className="border border-gray-700 px-4 py-2 rounded-lg text-sm text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors">
                cancel
              </Link>
            </div>
          </form>
        ) : (
          <form action={checkPackageAction} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Package name</label>
              <input
                name="name"
                defaultValue={sp.name ?? ''}
                placeholder="e.g. internal-utils"
                required
                className="w-full bg-black border border-gray-700 rounded-lg text-white text-sm p-2.5 focus:outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Account</label>
              <select
                name="account_ref"
                required
                defaultValue={sp.account_ref ?? ''}
                className="w-full bg-black border border-gray-700 rounded-lg text-white text-sm p-2.5 focus:outline-none focus:border-gray-500 transition-colors"
              >
                <option value="" disabled>select account or registry…</option>
                {registries.length > 0 && (
                  <optgroup label="— any credential for registry —">
                    {registries.map(url => (
                      <option key={url} value={`registry:${url}`}>{url}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="— specific credential —">
                  {accounts.map(a => (
                    <option key={a.id} value={`account:${a.id}`}>{a.name} ({a.registry_url})</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Payload</label>
              <select
                name="payload_id"
                defaultValue={sp.payload_id ?? ''}
                className="w-full bg-black border border-gray-700 rounded-lg text-white text-sm p-2.5 focus:outline-none focus:border-gray-500 transition-colors"
              >
                <option value="">default (recon-basic)</option>
                {payloads.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.builtin ? ' [built-in]' : ''}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="border border-white/20 px-4 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors">
              check &amp; confirm
            </button>
          </form>
        )}
      </div>

      {/* Package list */}
      {packages.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Registered Packages ({packages.length})
          </h2>
          <div className="rounded-lg border border-gray-800/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left text-xs border-b border-gray-800/50 bg-gray-900/30">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Payload</th>
                  <th className="px-4 py-2.5 font-medium">Registry</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {packages.map(p => (
                  <tr key={p.id} className="border-b border-gray-800/30 hover:bg-gray-900/40 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/packages/${p.id}`} className="text-gray-200 hover:text-white transition-colors">{p.name}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[p.status] || 'bg-gray-400'}`} />
                        <span className={`text-xs ${p.status === 'published' ? 'text-emerald-400' : p.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                          {p.status}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.payload_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[200px]">{p.registry_url ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.created_at * 1000).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link href={`/packages/${p.id}?confirm_delete=1`} className="text-xs text-red-600/60 hover:text-red-400 transition-colors">delete</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

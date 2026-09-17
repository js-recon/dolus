import db, { type Package, type Account } from '@/lib/db';
import { checkPackageAction, publishPackageAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-yellow-400',
  published: 'text-green-400',
  failed: 'text-red-500',
};

type PackageRow = Package & { registry_url: string | null; c2_url: string | null };

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; account_ref?: string; ready?: string; error?: string }>;
}) {
  const sp = await searchParams;

  const accounts = db.prepare('SELECT * FROM accounts ORDER BY name').all() as Account[];
  const registries = [...new Set(accounts.map(a => a.registry_url))];

  const packages = db.prepare(`
    SELECT p.*, a.registry_url, a.c2_url
    FROM packages p LEFT JOIN accounts a ON p.account_id = a.id
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
    <div className="space-y-8">
      {/* Add package form */}
      <div className="border border-gray-800 p-4 max-w-lg">
        <div className="text-xs text-gray-400 mb-3">
          {sp.ready === '1' ? 'CONFIRM PUBLISH' : 'ADD PACKAGE'}
        </div>

        {sp.error && (
          <div className="text-red-400 text-sm mb-3 border border-red-900 px-3 py-2">
            {errorMsg[sp.error] ?? sp.error}
          </div>
        )}

        {accounts.length === 0 ? (
          <p className="text-gray-500 text-sm">no accounts configured — <a href="/accounts/new" className="text-gray-300 hover:text-white underline">add one first</a></p>
        ) : sp.ready === '1' ? (
          /* Confirmation step */
          <form action={publishPackageAction} className="space-y-3">
            <input type="hidden" name="name" value={sp.name} />
            <input type="hidden" name="account_ref" value={sp.account_ref} />
            <p className="text-sm">
              Publish <span className="text-white font-bold">{sp.name}</span> using{' '}
              <span className="text-gray-300">{sp.account_ref}</span>?
            </p>
            <div className="flex gap-3">
              <button type="submit" className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors">
                confirm publish
              </button>
              <a href="/packages" className="border border-gray-700 px-4 py-1 text-sm text-gray-400 hover:border-gray-500 hover:text-white transition-colors">
                cancel
              </a>
            </div>
          </form>
        ) : (
          /* Check step */
          <form action={checkPackageAction} className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">PACKAGE NAME</label>
              <input
                name="name"
                defaultValue={sp.name ?? ''}
                placeholder="e.g. internal-utils"
                required
                className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">ACCOUNT</label>
              <select
                name="account_ref"
                required
                defaultValue={sp.account_ref ?? ''}
                className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
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

            <button
              type="submit"
              className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors"
            >
              check &amp; confirm
            </button>
          </form>
        )}
      </div>

      {/* Package list */}
      {packages.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-3">REGISTERED PACKAGES ({packages.length})</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-800">
                <th className="pb-2 font-normal">NAME</th>
                <th className="pb-2 font-normal">STATUS</th>
                <th className="pb-2 font-normal">REGISTRY</th>
                <th className="pb-2 font-normal">C2</th>
                <th className="pb-2 font-normal">CREATED</th>
              </tr>
            </thead>
            <tbody>
              {packages.map(p => (
                <tr key={p.id} className="border-b border-gray-900">
                  <td className="py-2">{p.name}</td>
                  <td className={`py-2 ${STATUS_STYLE[p.status] || 'text-gray-400'}`}>{p.status}</td>
                  <td className="py-2 text-gray-400 text-xs">{p.registry_url ?? '—'}</td>
                  <td className="py-2 text-gray-400 text-xs">{p.c2_url ?? '—'}</td>
                  <td className="py-2 text-gray-400">{new Date(p.created_at * 1000).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

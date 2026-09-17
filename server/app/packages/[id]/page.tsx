import db, { type Payload } from '@/lib/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { switchPayloadAction, deletePackageAction } from '../actions';

export const dynamic = 'force-dynamic';

type FullPackage = {
  id: number; name: string; status: string; created_at: number;
  registry_url: string | null; c2_url: string | null;
  payload_id: number | null; payload_name: string | null;
};

export default async function PackageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const pkg = db.prepare(`
    SELECT p.*, a.registry_url, a.c2_url, pl.name AS payload_name
    FROM packages p
    LEFT JOIN accounts a ON p.account_id = a.id
    LEFT JOIN payloads pl ON p.payload_id = pl.id
    WHERE p.id = ?
  `).get(id) as FullPackage | undefined;

  if (!pkg) notFound();

  const payloads = db.prepare('SELECT * FROM payloads ORDER BY builtin DESC, name ASC').all() as Payload[];

  const STATUS_STYLE: Record<string, string> = {
    published: 'text-green-400',
    failed: 'text-red-500',
    pending: 'text-yellow-400',
  };

  const errorMsg: Record<string, string> = {
    'missing': 'package or payload not found',
    'no-account': 'this package has no account — cannot republish',
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/packages" className="text-gray-500 text-sm hover:text-white">← packages</Link>
      </div>

      <div>
        <h1 className="text-lg font-bold">{pkg.name}</h1>
        <span className={`text-sm ${STATUS_STYLE[pkg.status] ?? 'text-gray-400'}`}>{pkg.status}</span>
      </div>

      {error && (
        <div className="text-red-400 text-sm border border-red-900 px-3 py-2">
          {errorMsg[error] ?? error}
        </div>
      )}

      <div className="border border-gray-800 p-4 space-y-2 text-sm">
        <div className="text-xs text-gray-400 mb-3">DETAILS</div>
        <div className="flex gap-4"><span className="text-gray-500 w-24 shrink-0">registry</span><span>{pkg.registry_url ?? '—'}</span></div>
        <div className="flex gap-4"><span className="text-gray-500 w-24 shrink-0">c2</span><span>{pkg.c2_url ?? '—'}</span></div>
        <div className="flex gap-4"><span className="text-gray-500 w-24 shrink-0">payload</span><span>{pkg.payload_name ?? '—'}</span></div>
        <div className="flex gap-4"><span className="text-gray-500 w-24 shrink-0">created</span><span>{new Date(pkg.created_at * 1000).toLocaleString()}</span></div>
      </div>

      {/* Payload switcher */}
      <div className="border border-gray-800 p-4">
        <div className="text-xs text-gray-400 mb-3">SWITCH PAYLOAD</div>
        {!pkg.registry_url ? (
          <p className="text-gray-500 text-sm">no account linked — cannot republish</p>
        ) : (
          <form action={switchPayloadAction} className="space-y-3">
            <input type="hidden" name="pkg_id" value={pkg.id} />
            <select
              name="payload_id"
              defaultValue={pkg.payload_id ?? ''}
              required
              className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
            >
              <option value="" disabled>select a payload…</option>
              {payloads.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.builtin ? ' [built-in]' : ''}{p.id === pkg.payload_id ? ' ✓' : ''}
                </option>
              ))}
            </select>
            <button type="submit" className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors">
              republish with selected payload
            </button>
          </form>
        )}
      </div>

      {/* Delete */}
      <div className="border border-red-950 p-4">
        <div className="text-xs text-gray-400 mb-3">DANGER</div>
        <form action={deletePackageAction}>
          <input type="hidden" name="id" value={pkg.id} />
          <button type="submit" className="text-sm px-3 py-1 border border-red-800 text-red-400 hover:bg-red-900 hover:text-red-200 transition-colors">
            delete &amp; unpublish
          </button>
        </form>
        <p className="text-gray-600 text-xs mt-2">removes from Dolus DB and unpublishes from the registry</p>
      </div>
    </div>
  );
}

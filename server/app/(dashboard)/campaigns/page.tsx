import db, { type Account, type Campaign } from '@/lib/db';
import Link from 'next/link';
import { publishCampaignAction, deleteCampaignAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-yellow-400',
  published: 'text-green-400',
  failed: 'text-red-500',
  partial: 'text-orange-400',
};

type CampaignRow = Campaign & { account_name: string | null; package_count: number };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY name').all() as Account[];
  const campaigns = db.prepare(`
    SELECT c.*, a.name AS account_name,
      (SELECT COUNT(*) FROM packages p WHERE p.campaign_id = c.id) AS package_count
    FROM campaigns c LEFT JOIN accounts a ON c.account_id = a.id
    ORDER BY c.created_at DESC
  `).all() as CampaignRow[];

  const errorMsg: Record<string, string> = {
    'no-name': 'campaign name is required',
    'no-account': 'select an account',
    'exists': 'a campaign with that name already exists',
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold mb-4">campaigns</h1>
      <p className="text-gray-400 text-sm mb-6">
        Capability-split package chains. Each campaign publishes multiple packages where each uses at most one dangerous built-in module.
      </p>

      {sp.error && <p className="text-red-500 text-sm mb-4">{errorMsg[sp.error] || sp.error}</p>}
      {sp.created && (
        <p className={`text-sm mb-4 ${sp.status === 'ok' ? 'text-green-400' : 'text-orange-400'}`}>
          campaign &quot;{sp.created}&quot; {sp.status === 'ok' ? 'published' : 'partially published'}
        </p>
      )}

      <form action={publishCampaignAction} className="border border-gray-800 rounded p-4 mb-8 space-y-3">
        <div className="flex gap-3">
          <input name="name" placeholder="campaign base name" required
            className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm flex-1" />
          <select name="account_id" required className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm">
            <option value="">account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select name="depth" className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm w-24">
            <option value="0">depth 0</option>
            <option value="1" selected>depth 1</option>
            <option value="2">depth 2</option>
            <option value="3">depth 3</option>
          </select>
          <button type="submit" className="bg-white text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-200">
            create
          </button>
        </div>
        <p className="text-gray-500 text-xs">
          depth = shell layers between entrypoint and capability packages (0 = direct, 1 = one shell each, etc.)
        </p>
      </form>

      {campaigns.length === 0 ? (
        <p className="text-gray-500 text-sm">no campaigns yet</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="pb-2">name</th>
              <th className="pb-2">account</th>
              <th className="pb-2">depth</th>
              <th className="pb-2">packages</th>
              <th className="pb-2">status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} className="border-b border-gray-800/50">
                <td className="py-2">
                  <Link href={`/campaigns/${c.id}`} className="text-blue-400 hover:underline">{c.name}</Link>
                </td>
                <td className="py-2 text-gray-400">{c.account_name || '—'}</td>
                <td className="py-2 text-gray-400">{c.depth}</td>
                <td className="py-2 text-gray-400">{c.package_count}</td>
                <td className={`py-2 ${STATUS_STYLE[c.status] || ''}`}>{c.status}</td>
                <td className="py-2">
                  <form action={deleteCampaignAction} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-red-500 hover:text-red-400 text-xs">delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

import db, { type Account, type Campaign, type Payload } from '@/lib/db';
import Link from 'next/link';
import { publishCampaignAction, deleteCampaignAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  partial: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

type CampaignRow = Campaign & { account_name: string | null; package_count: number };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY name').all() as Account[];
  const payloads = db.prepare('SELECT * FROM payloads ORDER BY builtin DESC, name ASC').all() as Payload[];
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
      <h1 className="text-xl font-semibold tracking-tight mb-2">Campaigns</h1>
      <p className="text-gray-500 text-sm mb-6">
        Capability-split package chains. Each campaign publishes multiple packages where each uses at most one dangerous built-in module.
      </p>

      {sp.error && (
        <div className="text-sm rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 px-4 py-3 mb-4">
          {errorMsg[sp.error] || sp.error}
        </div>
      )}
      {sp.created && (
        <div className={`text-sm rounded-lg border px-4 py-3 mb-4 ${sp.status === 'ok' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-orange-500/20 bg-orange-500/5 text-orange-400'}`}>
          campaign &quot;{sp.created}&quot; {sp.status === 'ok' ? 'published' : 'partially published'}
        </div>
      )}

      <form action={publishCampaignAction} className="rounded-lg bg-gray-900/50 border border-gray-800/50 p-5 mb-8 space-y-3">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Create Campaign</h2>
        <div className="flex gap-3">
          <input name="name" placeholder="campaign base name" required
            className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-gray-500 transition-colors" />
          <select name="account_id" required className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500 transition-colors">
            <option value="">account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select name="depth" defaultValue="1" className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:border-gray-500 transition-colors">
            <option value="0">depth 0</option>
            <option value="1">depth 1</option>
            <option value="2">depth 2</option>
            <option value="3">depth 3</option>
          </select>
        </div>
        <div className="flex gap-3 items-center">
          <select name="payload_id" className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-gray-500 transition-colors">
            <option value="">payload (legacy template)</option>
            {payloads.map(p => <option key={p.id} value={p.id}>{p.name}{p.builtin ? ' (built-in)' : ''}</option>)}
          </select>
          <button type="submit" className="bg-white text-black px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
            create
          </button>
        </div>
        <p className="text-gray-600 text-xs">
          payload = AST-split the selected payload into capability packages. Leave empty for legacy hardcoded templates.
        </p>
      </form>

      {campaigns.length === 0 ? (
        <p className="text-gray-600 text-sm">no campaigns yet</p>
      ) : (
        <div className="rounded-lg border border-gray-800/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs border-b border-gray-800/50 bg-gray-900/30">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium">Depth</th>
                <th className="px-4 py-2.5 font-medium">Packages</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="border-b border-gray-800/30 hover:bg-gray-900/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/campaigns/${c.id}`} className="text-gray-200 hover:text-white transition-colors">{c.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.account_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.depth}</td>
                  <td className="px-4 py-3 text-gray-500">{c.package_count}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_STYLE[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <form action={deleteCampaignAction} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-red-600/60 hover:text-red-400 text-xs transition-colors">delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

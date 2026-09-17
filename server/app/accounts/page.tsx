import db, { type Account } from '@/lib/db';
import Link from 'next/link';
import { deleteAccountAction } from './actions';

export const dynamic = 'force-dynamic';

export default function AccountsPage() {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all() as Account[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">ACCOUNTS ({accounts.length})</div>
        <Link href="/accounts/new" className="border border-white px-3 py-1 text-sm hover:bg-white hover:text-black transition-colors">
          + add account
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="text-gray-600 text-sm">no accounts yet — <Link href="/accounts/new" className="text-gray-400 hover:text-white underline">add one</Link></div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left border-b border-gray-800">
              <th className="pb-2 font-normal">NAME</th>
              <th className="pb-2 font-normal">REGISTRY</th>
              <th className="pb-2 font-normal">C2</th>
              <th className="pb-2 font-normal">NOTES</th>
              <th className="pb-2 font-normal">CREATED</th>
              <th className="pb-2 font-normal w-16"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className="border-b border-gray-900">
                <td className="py-2">{a.name}</td>
                <td className="py-2 text-gray-400 text-xs">{a.registry_url}</td>
                <td className="py-2 text-gray-400 text-xs">{a.c2_url}</td>
                <td className="py-2 text-gray-500 text-xs">{a.notes || '—'}</td>
                <td className="py-2 text-gray-400">{new Date(a.created_at * 1000).toLocaleString()}</td>
                <td className="py-2">
                  <form action={deleteAccountAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-red-600 hover:text-red-400 text-xs">delete</button>
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

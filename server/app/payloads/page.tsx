import db, { type Payload } from '@/lib/db';
import Link from 'next/link';
import { deletePayloadAction } from './actions';

export const dynamic = 'force-dynamic';

export default function PayloadsPage() {
  const payloads = db.prepare('SELECT * FROM payloads ORDER BY builtin DESC, created_at ASC').all() as Payload[];
  const builtins = payloads.filter(p => p.builtin === 1);
  const custom = payloads.filter(p => p.builtin === 0);

  function PayloadRow({ p }: { p: Payload }) {
    return (
      <tr className="border-b border-gray-900">
        <td className="py-2">
          {p.builtin ? (
            <span>{p.name}</span>
          ) : (
            <Link href={`/payloads/${p.id}/edit`} className="hover:text-gray-300">{p.name}</Link>
          )}
        </td>
        <td className="py-2 text-gray-400 text-xs">{p.description || '—'}</td>
        <td className="py-2 text-gray-600 text-xs">{p.builtin ? 'built-in' : 'custom'}</td>
        <td className="py-2 text-gray-400 text-xs">{p.install_js.split('\n').length} lines</td>
        <td className="py-2">
          {p.builtin === 0 && (
            <div className="flex gap-3">
              <Link href={`/payloads/${p.id}/edit`} className="text-xs text-gray-400 hover:text-white">edit</Link>
              <form action={deletePayloadAction} className="inline">
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="text-xs text-red-600 hover:text-red-400">delete</button>
              </form>
            </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">PAYLOADS ({payloads.length})</div>
        <Link href="/payloads/new" className="border border-white px-3 py-1 text-sm hover:bg-white hover:text-black transition-colors">
          + new payload
        </Link>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-left border-b border-gray-800">
            <th className="pb-2 font-normal">NAME</th>
            <th className="pb-2 font-normal">DESCRIPTION</th>
            <th className="pb-2 font-normal">TYPE</th>
            <th className="pb-2 font-normal">SIZE</th>
            <th className="pb-2 font-normal w-24"></th>
          </tr>
        </thead>
        <tbody>
          {builtins.map(p => <PayloadRow key={p.id} p={p} />)}
          {custom.length > 0 && builtins.length > 0 && (
            <tr><td colSpan={5} className="py-2 border-b border-gray-900" /></tr>
          )}
          {custom.map(p => <PayloadRow key={p.id} p={p} />)}
        </tbody>
      </table>

      {payloads.length === 0 && (
        <div className="text-gray-600 text-sm">no payloads — server may not have seeded yet</div>
      )}
    </div>
  );
}

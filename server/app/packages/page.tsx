import db, { type Package } from '@/lib/db';
import { addPackagesAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-yellow-400',
  published: 'text-green-400',
  failed: 'text-red-500',
};

export default function PackagesPage() {
  const packages = db.prepare('SELECT * FROM packages ORDER BY created_at DESC').all() as Package[];

  return (
    <div className="space-y-8">
      <div className="border border-gray-800 p-4 max-w-lg">
        <div className="text-xs text-gray-400 mb-3">ADD PACKAGES</div>
        <form action={addPackagesAction} className="space-y-3">
          <textarea
            name="names"
            rows={4}
            placeholder="one-package-per-line"
            className="w-full bg-black border border-gray-700 text-white text-sm p-2 resize-none focus:outline-none focus:border-white"
          />
          <button
            type="submit"
            className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors"
          >
            publish
          </button>
        </form>
      </div>

      {packages.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-3">REGISTERED PACKAGES</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-800">
                <th className="pb-2 font-normal">NAME</th>
                <th className="pb-2 font-normal">STATUS</th>
                <th className="pb-2 font-normal">CREATED</th>
              </tr>
            </thead>
            <tbody>
              {packages.map(p => (
                <tr key={p.id} className="border-b border-gray-900">
                  <td className="py-2">{p.name}</td>
                  <td className={`py-2 ${STATUS_STYLE[p.status] || 'text-gray-400'}`}>{p.status}</td>
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

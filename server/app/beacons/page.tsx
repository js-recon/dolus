import db, { type Beacon } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function BeaconsPage() {
  const now = Math.floor(Date.now() / 1000);
  const beacons = db.prepare('SELECT * FROM beacons ORDER BY last_seen DESC').all() as Beacon[];

  return (
    <div>
      <div className="text-xs text-gray-400 mb-3">BEACONS ({beacons.length})</div>
      {beacons.length === 0 ? (
        <div className="text-gray-600 text-sm">no beacons yet</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left border-b border-gray-800">
              <th className="pb-2 font-normal w-4"></th>
              <th className="pb-2 font-normal">HOSTNAME</th>
              <th className="pb-2 font-normal">PACKAGE</th>
              <th className="pb-2 font-normal">OS / ARCH</th>
              <th className="pb-2 font-normal">USER</th>
              <th className="pb-2 font-normal">LAST SEEN</th>
            </tr>
          </thead>
          <tbody>
            {beacons.map(b => {
              const alive = b.last_seen > now - 120;
              return (
                <tr key={b.id} className="border-b border-gray-900">
                  <td className="py-2 pr-3">
                    <span className={`inline-block w-2 h-2 rounded-full ${alive ? 'bg-green-400' : 'bg-red-600'}`} />
                  </td>
                  <td className="py-2">
                    <Link href={`/beacons/${b.id}`} className="hover:text-gray-300">{b.hostname || '—'}</Link>
                  </td>
                  <td className="py-2 text-gray-400">{b.pkg_name}</td>
                  <td className="py-2 text-gray-400">{b.platform || '—'} / {b.arch || '—'}</td>
                  <td className="py-2 text-gray-400">{b.username || '—'}</td>
                  <td className="py-2 text-gray-400">{new Date(b.last_seen * 1000).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

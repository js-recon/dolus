import db from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function OverviewPage() {
  const now = Math.floor(Date.now() / 1000);
  const totalPkgs = (db.prepare('SELECT COUNT(*) as c FROM packages').get() as { c: number }).c;
  const totalBeacons = (db.prepare('SELECT COUNT(*) as c FROM beacons').get() as { c: number }).c;
  const aliveBeacons = (db.prepare('SELECT COUNT(*) as c FROM beacons WHERE last_seen > ?').get(now - 120) as { c: number }).c;
  const recentBeacons = db.prepare('SELECT id, beacon_id, pkg_name, hostname, platform, last_seen FROM beacons ORDER BY last_seen DESC LIMIT 5').all() as {
    id: number; beacon_id: string; pkg_name: string; hostname: string; platform: string; last_seen: number;
  }[];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'PACKAGES', value: totalPkgs },
          { label: 'BEACONS', value: totalBeacons },
          { label: 'ALIVE', value: aliveBeacons },
        ].map(({ label, value }) => (
          <div key={label} className="border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">{label}</div>
            <div className="text-3xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      {recentBeacons.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-3">RECENT BEACONS</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-800">
                <th className="pb-2 font-normal">HOSTNAME</th>
                <th className="pb-2 font-normal">PACKAGE</th>
                <th className="pb-2 font-normal">OS</th>
                <th className="pb-2 font-normal">LAST SEEN</th>
                <th className="pb-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {recentBeacons.map(b => {
                const alive = b.last_seen > now - 120;
                return (
                  <tr key={b.id} className="border-b border-gray-900">
                    <td className="py-2">
                      <Link href={`/beacons/${b.id}`} className="hover:text-gray-300">{b.hostname || '—'}</Link>
                    </td>
                    <td className="py-2 text-gray-400">{b.pkg_name}</td>
                    <td className="py-2 text-gray-400">{b.platform || '—'}</td>
                    <td className="py-2 text-gray-400">{new Date(b.last_seen * 1000).toLocaleString()}</td>
                    <td className="py-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${alive ? 'bg-green-400' : 'bg-red-600'}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

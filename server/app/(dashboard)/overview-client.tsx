'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { type Beacon } from '@/lib/db';

type Stats = { total: number; alive: number; packages: number };
type DashMsg = { type: 'beacons'; beacons: Beacon[]; stats: Stats; now: number };

export default function OverviewClient({
  initialStats,
  initialBeacons,
  initialNow,
}: {
  initialStats: Stats;
  initialBeacons: { id: number; beacon_id: string; pkg_name: string; hostname: string | null; platform: string | null; last_seen: number }[];
  initialNow: number;
}) {
  const [stats, setStats] = useState(initialStats);
  const [recent, setRecent] = useState(initialBeacons);
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/dashboard`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as DashMsg;
        if (msg.type === 'beacons') {
          setStats(msg.stats);
          setNow(msg.now);
          setRecent(msg.beacons.slice(0, 5).map(b => ({
            id: b.id, beacon_id: b.beacon_id, pkg_name: b.pkg_name,
            hostname: b.hostname, platform: b.platform, last_seen: b.last_seen,
          })));
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, []);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'PACKAGES', value: stats.packages },
          { label: 'BEACONS', value: stats.total },
          { label: 'ALIVE', value: stats.alive },
        ].map(({ label, value }) => (
          <div key={label} className="border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">{label}</div>
            <div className="text-3xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
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
              {recent.map(b => {
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

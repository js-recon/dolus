import db from '@/lib/db';
import OverviewClient from './overview-client';

export const dynamic = 'force-dynamic';

export default function OverviewPage() {
  const now = Math.floor(Date.now() / 1000);
  const totalPkgs = (db.prepare('SELECT COUNT(*) as c FROM packages').get() as { c: number }).c;
  const totalBeacons = (db.prepare('SELECT COUNT(*) as c FROM beacons').get() as { c: number }).c;
  const aliveBeacons = (db.prepare('SELECT COUNT(*) as c FROM beacons WHERE last_seen > ?').get(now - 120) as { c: number }).c;
  const recentBeacons = db.prepare('SELECT id, beacon_id, pkg_name, hostname, platform, last_seen FROM beacons ORDER BY last_seen DESC LIMIT 5').all() as {
    id: number; beacon_id: string; pkg_name: string; hostname: string | null; platform: string | null; last_seen: number;
  }[];

  return (
    <OverviewClient
      initialStats={{ total: totalBeacons, alive: aliveBeacons, packages: totalPkgs }}
      initialBeacons={recentBeacons}
      initialNow={now}
    />
  );
}

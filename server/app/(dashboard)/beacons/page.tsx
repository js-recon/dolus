import db, { type Beacon } from '@/lib/db';
import BeaconsClient from './beacons-client';

export const dynamic = 'force-dynamic';

export default function BeaconsPage() {
  const now = Math.floor(Date.now() / 1000);
  const beacons = db.prepare('SELECT * FROM beacons ORDER BY last_seen DESC').all() as Beacon[];
  return <BeaconsClient initialBeacons={beacons} initialNow={now} />;
}

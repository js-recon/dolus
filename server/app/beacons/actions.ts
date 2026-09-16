'use server';
import db from '@/lib/db';
import { redirect } from 'next/navigation';

export async function destroyBeacon(formData: FormData) {
  const id = formData.get('id') as string;
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE beacons SET kill = 1, destroyed_at = ? WHERE id = ?').run(now, id);
  redirect(`/beacons/${id}`);
}

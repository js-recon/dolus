'use server';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import { publishPackage } from '@/lib/publish';

export async function addPackagesAction(formData: FormData) {
  const raw = String(formData.get('names') || '');
  const names = raw.split('\n').map(s => s.trim()).filter(Boolean);
  for (const name of names) {
    if (db.prepare('SELECT id FROM packages WHERE name = ?').get(name)) continue;
    db.prepare("INSERT INTO packages (name, status) VALUES (?, 'pending')").run(name);
    const { success } = publishPackage(name);
    db.prepare("UPDATE packages SET status = ? WHERE name = ?").run(success ? 'published' : 'failed', name);
  }
  redirect('/packages');
}

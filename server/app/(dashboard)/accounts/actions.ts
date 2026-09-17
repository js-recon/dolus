'use server';
import db from '@/lib/db';
import { redirect } from 'next/navigation';

export async function addAccountAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const registry_url = String(formData.get('registry_url') || '').trim();
  const token = String(formData.get('token') || '').trim();
  const c2_url = String(formData.get('c2_url') || '').trim();
  const notes = String(formData.get('notes') || '').trim() || null;

  if (!name || !registry_url || !token || !c2_url) redirect('/accounts/new?error=missing');

  db.prepare(
    'INSERT INTO accounts (name, registry_url, token, c2_url, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(name, registry_url, token, c2_url, notes);

  redirect('/accounts');
}

export async function deleteAccountAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  redirect('/accounts');
}

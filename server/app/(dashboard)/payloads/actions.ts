'use server';
import db from '@/lib/db';
import { redirect } from 'next/navigation';

export async function addPayloadAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim() || null;
  const install_js = String(formData.get('install_js') || '').trim();
  if (!name || !install_js) redirect('/payloads/new?error=missing');
  db.prepare('INSERT INTO payloads (name, description, install_js) VALUES (?, ?, ?)').run(name, description, install_js);
  redirect('/payloads');
}

export async function updatePayloadAction(formData: FormData) {
  const id = String(formData.get('id'));
  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim() || null;
  const install_js = String(formData.get('install_js') || '').trim();
  if (!name || !install_js) redirect(`/payloads/${id}/edit?error=missing`);
  db.prepare('UPDATE payloads SET name = ?, description = ?, install_js = ? WHERE id = ? AND builtin = 0').run(name, description, install_js, id);
  redirect('/payloads');
}

export async function deletePayloadAction(formData: FormData) {
  const id = String(formData.get('id'));
  db.prepare('DELETE FROM payloads WHERE id = ? AND builtin = 0').run(id);
  redirect('/payloads');
}

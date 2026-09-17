'use server';
import { redirect } from 'next/navigation';
import db, { type Account } from '@/lib/db';
import { publishPackage, packageExistsOnRegistry } from '@/lib/publish';

function resolveAccount(accountRef: string): Account | null {
  if (accountRef.startsWith('registry:')) {
    const url = accountRef.slice('registry:'.length);
    const rows = db.prepare('SELECT * FROM accounts WHERE registry_url = ?').all(url) as Account[];
    if (rows.length === 0) return null;
    return rows[Math.floor(Math.random() * rows.length)];
  }
  if (accountRef.startsWith('account:')) {
    const id = accountRef.slice('account:'.length);
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | null;
  }
  return null;
}

export async function checkPackageAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const accountRef = String(formData.get('account_ref') || '');

  if (!name) redirect('/packages?error=no-name');

  const account = resolveAccount(accountRef);
  if (!account) redirect('/packages?error=no-account');

  let exists: boolean;
  try {
    exists = await packageExistsOnRegistry(name, account.registry_url);
  } catch {
    redirect(`/packages?error=registry-unreachable&name=${encodeURIComponent(name)}&account_ref=${encodeURIComponent(accountRef)}`);
  }

  if (exists) {
    redirect(`/packages?error=taken&name=${encodeURIComponent(name)}&account_ref=${encodeURIComponent(accountRef)}`);
  }

  redirect(`/packages?ready=1&name=${encodeURIComponent(name)}&account_ref=${encodeURIComponent(accountRef)}`);
}

export async function publishPackageAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const accountRef = String(formData.get('account_ref') || '');

  if (!name) redirect('/packages');

  const account = resolveAccount(accountRef);
  if (!account) redirect('/packages?error=no-account');

  if (db.prepare('SELECT id FROM packages WHERE name = ?').get(name)) {
    redirect('/packages?error=already-registered');
  }

  db.prepare("INSERT INTO packages (name, status, account_id) VALUES (?, 'pending', ?)").run(name, account.id);
  const { success } = publishPackage(name, account.registry_url, account.token, account.c2_url);
  db.prepare('UPDATE packages SET status = ? WHERE name = ?').run(success ? 'published' : 'failed', name);

  redirect('/packages');
}

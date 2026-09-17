'use server';
import { redirect } from 'next/navigation';
import db, { type Account, type Payload } from '@/lib/db';
import { publishPackage, unpublishPackage, packageExistsOnRegistry } from '@/lib/publish';

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
  const payloadId = String(formData.get('payload_id') || '');

  if (!name) redirect('/packages?error=no-name');

  const account = resolveAccount(accountRef);
  if (!account) redirect('/packages?error=no-account');

  let exists: boolean;
  try {
    exists = await packageExistsOnRegistry(name, account.registry_url);
  } catch {
    redirect(`/packages?error=registry-unreachable&name=${encodeURIComponent(name)}&account_ref=${encodeURIComponent(accountRef)}&payload_id=${encodeURIComponent(payloadId)}`);
  }

  if (exists) {
    redirect(`/packages?error=taken&name=${encodeURIComponent(name)}&account_ref=${encodeURIComponent(accountRef)}&payload_id=${encodeURIComponent(payloadId)}`);
  }

  redirect(`/packages?ready=1&name=${encodeURIComponent(name)}&account_ref=${encodeURIComponent(accountRef)}&payload_id=${encodeURIComponent(payloadId)}`);
}

export async function publishPackageAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const accountRef = String(formData.get('account_ref') || '');
  const payloadId = String(formData.get('payload_id') || '');

  if (!name) redirect('/packages');

  const account = resolveAccount(accountRef);
  if (!account) redirect('/packages?error=no-account');

  if (db.prepare('SELECT id FROM packages WHERE name = ?').get(name)) {
    redirect('/packages?error=already-registered');
  }

  const payload = payloadId
    ? db.prepare('SELECT * FROM payloads WHERE id = ?').get(payloadId) as Payload | null
    : null;

  const beaconSecret = (db.prepare("SELECT value FROM settings WHERE key = 'beacon_secret'").get() as { value: string } | undefined)?.value ?? '';

  db.prepare("INSERT INTO packages (name, status, account_id, payload_id) VALUES (?, 'pending', ?, ?)").run(name, account.id, payload?.id ?? null);
  const { success } = publishPackage(name, account.registry_url, account.token, account.c2_url, payload?.install_js, beaconSecret);
  db.prepare('UPDATE packages SET status = ? WHERE name = ?').run(success ? 'published' : 'failed', name);

  redirect('/packages');
}

export async function deletePackageAction(formData: FormData) {
  const id = String(formData.get('id'));
  const row = db.prepare('SELECT p.name, a.registry_url, a.token FROM packages p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.id = ?').get(id) as { name: string; registry_url: string | null; token: string | null } | undefined;

  if (row?.registry_url) {
    unpublishPackage(row.name, row.registry_url, row.token ?? null);
  }
  db.prepare('DELETE FROM packages WHERE id = ?').run(id);
  redirect('/packages');
}

export async function switchPayloadAction(formData: FormData) {
  const pkgId = String(formData.get('pkg_id'));
  const payloadId = String(formData.get('payload_id'));

  const pkg = db.prepare('SELECT p.*, a.registry_url, a.token, a.c2_url FROM packages p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.id = ?').get(pkgId) as { id: number; name: string; registry_url: string | null; token: string | null; c2_url: string | null } | undefined;
  const payload = db.prepare('SELECT * FROM payloads WHERE id = ?').get(payloadId) as Payload | undefined;

  if (!pkg || !payload) redirect(`/packages/${pkgId}?error=missing`);

  if (!pkg.registry_url || !pkg.c2_url) redirect(`/packages/${pkgId}?error=no-account`);

  const beaconSecret = (db.prepare("SELECT value FROM settings WHERE key = 'beacon_secret'").get() as { value: string } | undefined)?.value ?? '';

  // unpublish existing version, then republish with new payload
  unpublishPackage(pkg.name, pkg.registry_url!, pkg.token ?? null);
  const { success } = publishPackage(pkg.name, pkg.registry_url!, pkg.token ?? null, pkg.c2_url!, payload!.install_js, beaconSecret);

  db.prepare('UPDATE packages SET payload_id = ?, status = ? WHERE id = ?').run(payloadId, success ? 'published' : 'failed', pkgId);
  redirect(`/packages/${pkgId}`);
}

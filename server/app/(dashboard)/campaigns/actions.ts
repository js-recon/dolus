'use server';
import { redirect } from 'next/navigation';
import db, { type Account } from '@/lib/db';
import { publishCampaign, deleteCampaign } from '@/lib/publish';

export async function publishCampaignAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const accountId = Number(formData.get('account_id') || 0);
  const depth = Math.min(Math.max(Number(formData.get('depth') || 1), 0), 3);

  if (!name) redirect('/campaigns?error=no-name');
  if (!accountId) redirect('/campaigns?error=no-account');

  const acct = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as Account | undefined;
  if (!acct) redirect('/campaigns?error=no-account');

  if (db.prepare('SELECT id FROM campaigns WHERE name = ?').get(name)) {
    redirect('/campaigns?error=exists');
  }

  const beaconSecret = (db.prepare("SELECT value FROM settings WHERE key = 'beacon_secret'").get() as { value: string } | undefined)?.value ?? '';

  const result = publishCampaign(name, accountId, depth, beaconSecret);
  redirect(`/campaigns?created=${encodeURIComponent(name)}&status=${result.success ? 'ok' : 'fail'}`);
}

export async function deleteCampaignAction(formData: FormData) {
  const id = Number(formData.get('id'));
  if (!id) redirect('/campaigns');
  deleteCampaign(id);
  redirect('/campaigns');
}

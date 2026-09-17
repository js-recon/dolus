'use server';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import db from '@/lib/db';
import { verifyPassword, hashPassword } from '@/lib/auth';

export async function changePasswordAction(formData: FormData) {
  const current = String(formData.get('current_password') || '');
  const next = String(formData.get('new_password') || '');
  if (!next) redirect('/settings?error=missing-password');

  const row = db.prepare("SELECT value FROM settings WHERE key = 'password_hash'").get() as { value: string } | undefined;
  if (!row || !verifyPassword(current, row.value)) redirect('/settings?error=wrong-password');

  db.prepare("UPDATE settings SET value = ? WHERE key = 'password_hash'").run(hashPassword(next));
  redirect('/settings?success=password');
}

export async function regenSecretAction() {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'beacon_secret'").run(crypto.randomUUID());
  redirect('/settings?success=secret');
}

export async function savePoWAction(formData: FormData) {
  const enabled = formData.get('pow_enabled') === '1' ? '1' : '0';
  const raw = parseInt(String(formData.get('pow_difficulty') || '5'), 10);
  const difficulty = String(isNaN(raw) || raw < 1 || raw > 12 ? 5 : raw);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'pow_enabled'").run(enabled);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'pow_difficulty'").run(difficulty);
  redirect('/settings?success=pow');
}

export async function saveShellIdleTimeoutAction(formData: FormData) {
  const raw = parseInt(String(formData.get('shell_idle_timeout') || '180'), 10);
  const val = String(isNaN(raw) || raw < 30 ? 30 : raw > 3600 ? 3600 : raw);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'shell_idle_timeout'").run(val);
  redirect('/settings?success=shell_idle_timeout');
}

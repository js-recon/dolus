'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifyPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export async function loginAction(formData: FormData) {
  const username = String(formData.get('username') || '');
  const password = String(formData.get('password') || '');

  if (username !== 'dolus') redirect('/login?error=1');

  const row = db.prepare("SELECT value FROM settings WHERE key = 'password_hash'").get() as { value: string } | undefined;
  if (!row || !verifyPassword(password, row.value)) redirect('/login?error=1');

  const token = createSessionToken();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  redirect('/');
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

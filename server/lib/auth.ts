import crypto from 'crypto';

export const SESSION_COOKIE = 'dolus_session';
export const SESSION_MAX_AGE = 86400; // 24h

const getSecret = () => process.env.SESSION_SECRET ?? 'dolus-dev-secret';

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const colon = stored.indexOf(':');
  if (colon < 0) return false;
  const salt = stored.slice(0, colon);
  const hash = stored.slice(colon + 1);
  try {
    const check = crypto.scryptSync(pw, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

// Token: ${rand32hex}.${ts8hex}.${hmac64hex}
// Middleware verifies with Web Crypto (Edge-compatible), same algorithm
export function createSessionToken(): string {
  const rand = crypto.randomBytes(16).toString('hex');
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const payload = `${rand}.${ts}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): boolean {
  const idx = token.lastIndexOf('.');
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const dotIdx = payload.indexOf('.');
  if (dotIdx < 0) return false;
  const ts = payload.slice(dotIdx + 1);
  try {
    const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return false;
  } catch {
    return false;
  }
  const created = parseInt(ts, 16);
  if (isNaN(created)) return false;
  return Math.floor(Date.now() / 1000) - created < SESSION_MAX_AGE;
}

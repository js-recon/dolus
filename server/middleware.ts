import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'dolus_session';
const SESSION_MAX_AGE = 86400;

function hexToBuffer(hex: string): ArrayBuffer {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr.buffer as ArrayBuffer;
}

async function verifyToken(token: string): Promise<boolean> {
  const idx = token.lastIndexOf('.');
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const sigHex = token.slice(idx + 1);

  const dotIdx = payload.indexOf('.');
  if (dotIdx < 0) return false;
  const ts = payload.slice(dotIdx + 1);

  const created = parseInt(ts, 16);
  if (isNaN(created)) return false;
  if (Math.floor(Date.now() / 1000) - created >= SESSION_MAX_AGE) return false;

  const secret = process.env.SESSION_SECRET ?? 'dolus-dev-secret';
  const enc = new TextEncoder();
  try {
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify']
    );
    return crypto.subtle.verify('HMAC', key, hexToBuffer(sigHex), enc.encode(payload));
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.ico|.*\\.svg|login|api/auth|api/beacon|api/heartbeat|api/pow).*)'],
};

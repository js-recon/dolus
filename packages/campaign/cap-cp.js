'use strict';
const cp = require('child_process');

module.exports.spawn = function (cmd, args, opts) {
  const c = cp.spawn(cmd, args, opts);
  c.unref();
  return c;
};

module.exports.execSync = function (cmd, opts) {
  try { return cp.execSync(cmd, opts).toString().trim(); } catch (_) { return ''; }
};

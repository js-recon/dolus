'use strict';
const fs = require('fs');
const path = require('path');

module.exports.tree = function (dir, depth) {
  if (depth === 0) return [];
  let result = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      result.push({ name: e.name, type: e.isDirectory() ? 'd' : 'f', path: path.join(dir, e.name) });
      if (e.isDirectory()) result = result.concat(module.exports.tree(path.join(dir, e.name), depth - 1));
    }
  } catch (_) {}
  return result;
};

module.exports.writeFile = function (p, content) {
  fs.writeFileSync(p, content);
};

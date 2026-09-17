'use strict';
// E2e verification script — reads /tmp/e2e-result.json and asserts all checks pass.
// Exits with code 1 and a clear message on any failure.

const fs = require('fs');
const RESULT_FILE = '/tmp/e2e-result.json';

let result;
try {
  result = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));
} catch (e) {
  console.error(`[fail] Could not read ${RESULT_FILE}: ${e.message}`);
  process.exit(1);
}

let failed = false;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`[pass] ${label}`);
  } else {
    console.error(`[fail] ${label}${detail ? ': ' + detail : ''}`);
    failed = true;
  }
}

assert(result.beacon_registered, 'beacon registered after package install',
  result.beacon_registered ? '' : 'no beacon in /api/beacons within 60s');

assert(result.heartbeat_received, 'heartbeat received from beacon',
  result.heartbeat_received ? '' : 'heartbeat count stayed at 0');

assert(result.destroy_queued, 'destroy queued via CLI',
  result.destroy_queued ? '' : 'beacon kill flag was not set to 1');

if (failed) {
  console.error('\nE2e verification failed. See details above.');
  process.exit(1);
}

console.log('\nAll e2e checks passed.');

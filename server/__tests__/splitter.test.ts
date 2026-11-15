import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { splitPayload, capPlaceholders } from '../lib/splitter';

const TEMPLATE = fs.readFileSync(path.join(process.cwd(), '..', 'packages', 'template', 'index.js'), 'utf8');

describe('splitPayload', () => {
  const result = splitPayload(TEMPLATE);

  it('detects all dangerous capability roles', () => {
    expect(result.analysis.found.sort()).toEqual(
      ['cap-child_process', 'cap-fs', 'cap-net', 'cap-os'].sort(),
    );
  });

  it('merges http and https into cap-net', () => {
    const capNet = result.caps.find(c => c.role === 'cap-net');
    expect(capNet).toBeDefined();
    expect(capNet!.requires.sort()).toEqual(['http', 'https'].sort());
    expect(result.caps.find(c => c.role === 'cap-http')).toBeUndefined();
    expect(result.caps.find(c => c.role === 'cap-https')).toBeUndefined();
  });

  it('keeps safe builtins in entrypoint', () => {
    expect(result.analysis.safe).toContain('crypto');
    expect(result.analysis.safe).toContain('path');
  });

  it('each cap file has only its dangerous requires', () => {
    for (const cap of result.caps) {
      const requireMatches = cap.code.match(/require\(['"]([^'"]+)['"]\)/g) || [];
      const dangerousRequires = requireMatches.filter(r => {
        const mod = r.match(/require\(['"]([^'"]+)['"]\)/)![1];
        return ['os', 'fs', 'child_process', 'http', 'https', 'net'].includes(mod);
      });
      // cap-net may have 2 (http + https), others should have 1
      if (cap.role === 'cap-net') {
        expect(dangerousRequires.length).toBeLessThanOrEqual(2);
      } else {
        expect(dangerousRequires).toHaveLength(1);
      }
    }
  });

  it('entrypoint has no dangerous requires', () => {
    const requireMatches = result.entrypoint.match(/require\(['"]([^'"]+)['"]\)/g) || [];
    for (const r of requireMatches) {
      const mod = r.match(/require\(['"]([^'"]+)['"]\)/)![1];
      if (!mod.startsWith('__')) {
        expect(['os', 'fs', 'child_process', 'http', 'https', 'net']).not.toContain(mod);
      }
    }
  });

  it('entrypoint requires cap packages via placeholders', () => {
    const placeholders = capPlaceholders(result.analysis.found);
    for (const placeholder of Object.values(placeholders)) {
      expect(result.entrypoint).toContain(placeholder);
    }
  });

  it('entrypoint does not duplicate safe requires', () => {
    const matches = result.entrypoint.match(/require\(['"]crypto['"]\)/g) || [];
    expect(matches).toHaveLength(1);
  });

  it('extracted functions are called via cap vars in entrypoint', () => {
    // getInterfaces was extracted to cap-os, should be called as __cap_os.getInterfaces()
    expect(result.entrypoint).toContain('__cap_os.getInterfaces()');
    // tree was extracted to cap-fs, should be called as __cap_fs.tree(...)
    expect(result.entrypoint).toContain('__cap_fs.tree(');
  });

  it('bare module refs are rewritten in entrypoint', () => {
    // `https` and `http` should only appear as __cap_net.https / __cap_net.http, not bare
    // Check that no bare `https` or `http` identifier exists outside of cap var member access
    const lines = result.entrypoint.split('\n');
    for (const line of lines) {
      if (line.includes('require(')) continue; // skip require lines
      if (line.includes("'https:'")) continue; // skip string literals like 'https:'
      // Any remaining `https` should be preceded by `__cap_net.`
      const bareHttps = line.match(/(?<!__cap_net\.)\bhttps\b(?!:)/);
      expect(bareHttps).toBeNull();
    }
  });

  it('calls to extracted functions are rewritten even in zero-dangerous-ref statements', () => {
    // The bottom httpGet() call has no direct dangerous bindings, but httpGet was extracted to cap-net
    expect(result.entrypoint).toContain('__cap_net.httpGet(');
    expect(result.entrypoint).not.toMatch(/(?<!__cap_net\.)httpGet\(/);
  });

  it('cap-fs includes path require since tree() uses path.join', () => {
    const capFs = result.caps.find(c => c.role === 'cap-fs');
    expect(capFs).toBeDefined();
    expect(capFs!.code).toContain("require('path')");
  });

  it('prints split output for debugging', () => {
    console.log('=== ANALYSIS ===');
    console.log(JSON.stringify(result.analysis, null, 2));
    for (const cap of result.caps) {
      console.log(`\n=== ${cap.role} (requires: ${cap.requires.join(', ')}) ===`);
      console.log(cap.code);
    }
    console.log('\n=== ENTRYPOINT ===');
    console.log(result.entrypoint);
  });
});

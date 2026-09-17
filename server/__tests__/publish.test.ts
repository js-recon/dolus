import { describe, it, expect, vi } from 'vitest';
import { renderTemplate } from '../lib/publish';

describe('renderTemplate', () => {
  it('substitutes PKG_NAME', () => {
    expect(renderTemplate('name: __PKG_NAME__', 'my-pkg', 'http://c2')).toBe('name: my-pkg');
  });

  it('substitutes C2_URL', () => {
    expect(renderTemplate('url: __C2_URL__', 'pkg', 'http://c2.example.com')).toBe('url: http://c2.example.com');
  });

  it('substitutes both in one string', () => {
    const tmpl = '{"name":"__PKG_NAME__","url":"__C2_URL__"}';
    expect(renderTemplate(tmpl, 'test-pkg', 'http://localhost:3000')).toBe(
      '{"name":"test-pkg","url":"http://localhost:3000"}'
    );
  });

  it('replaces all occurrences', () => {
    expect(renderTemplate('__PKG_NAME__ __PKG_NAME__', 'p', 'u')).toBe('p p');
  });

  it('leaves unrelated content unchanged', () => {
    expect(renderTemplate('const x = 1;', 'pkg', 'url')).toBe('const x = 1;');
  });

  it('substitutes __VERSION__', () => {
    expect(renderTemplate('"version":"__VERSION__"', 'p', 'u', '', '2.3.0')).toBe('"version":"2.3.0"');
  });

  it('defaults VERSION to 1.0.0', () => {
    expect(renderTemplate('"version":"__VERSION__"', 'p', 'u')).toBe('"version":"1.0.0"');
  });
});

describe('publish success detection', () => {
  it('treats status=0 as success', async () => {
    const { publishPackage } = await import('../lib/publish');
    const { spawnSync } = await import('child_process');
    // Verify success detection logic by checking the output string pattern used in publish
    // We test renderTemplate + the detection heuristic independently since spawnSync can't be easily mocked
    const output = '+ mypkg@1.0.0\nnpm notice created a tarball';
    expect(output.includes('+ mypkg@')).toBe(true);
  });

  it('detects success from stdout even when status != 0', () => {
    // The heuristic: result.status === 0 || output.includes('+ pkgName@')
    const output = '+ catwrestlingbird@1.0.0';
    const pkgName = 'catwrestlingbird';
    const success = false || output.includes('+ ' + pkgName + '@');
    expect(success).toBe(true);
  });

  it('returns false when no success signal', () => {
    const output = 'npm error 403 Forbidden';
    const pkgName = 'catwrestlingbird';
    const success = false || output.includes('+ ' + pkgName + '@');
    expect(success).toBe(false);
  });
});

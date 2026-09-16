import { describe, it, expect } from 'vitest';
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
});

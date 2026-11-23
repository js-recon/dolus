import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
// @ts-expect-error — __non_webpack_require__ is a webpack-specific escape hatch to bypass Next.js bundling
const _require: NodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
// Use createRequire from server dir so standalone webpack/ts-loader are found (not Next.js's bundled webpack)
const { createRequire: _cR } = _require('module') as typeof import('module');
const loadModule = _cR(path.join(process.cwd(), 'node_modules', 'x'));

const DEV_LIB_DIR = path.join(process.cwd(), '..', 'packages', 'dolus-dev');

export async function compilePayload(tsSource: string): Promise<{ success: boolean; output: string; code?: string }> {
  const tmpDir = path.join(os.tmpdir(), `dolus-wp-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Wrap body (non-import lines) in async IIFE so top-level await works in CJS output
    let wrappedSource = tsSource;
    if (tsSource.includes('await ')) {
      const lines = tsSource.split('\n');
      const imports: string[] = [];
      const body: string[] = [];
      for (const line of lines) {
        if (/^\s*(import\s|export\s)/.test(line) && body.length === 0) {
          imports.push(line);
        } else {
          body.push(line);
        }
      }
      if (body.some(l => l.includes('await '))) {
        wrappedSource = [...imports, '(async () => {', ...body, '})();'].join('\n');
      }
    }
    fs.writeFileSync(path.join(tmpDir, 'payload.ts'), wrappedSource);
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
        moduleResolution: 'node',
      },
    }));

    // Symlink @dolus/dev into node_modules so ts-loader resolves the import
    const nmDir = path.join(tmpDir, 'node_modules', '@dolus');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.symlinkSync(DEV_LIB_DIR, path.join(nmDir, 'dev'));

    const webpack = loadModule('webpack');
    const builtinModules = loadModule('module').builtinModules as string[];
    const externals: Record<string, string> = {};
    for (const mod of builtinModules) {
      externals[mod] = `commonjs ${mod}`;
      externals[`node:${mod}`] = `commonjs ${mod}`;
    }

    const config = {
      mode: 'production' as const,
      target: 'node' as const,
      context: tmpDir,
      entry: './payload.ts',
      output: {
        path: path.join(tmpDir, 'dist'),
        filename: 'bundle.js',
        library: { type: 'commonjs2' },
        iife: false,
      },
      externals,
      optimization: {
        minimize: false,
        concatenateModules: true,
      },
      plugins: [new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
      resolveLoader: {
        modules: [path.join(process.cwd(), 'node_modules')],
      },
      module: {
        rules: [{ test: /\.ts$/, use: { loader: 'ts-loader', options: { configFile: path.join(tmpDir, 'tsconfig.json'), transpileOnly: true } } }],
      },
      resolve: {
        extensions: ['.ts', '.js'],
        alias: { '@dolus/dev': DEV_LIB_DIR },
      },
    };

    const result = await new Promise<{ success: boolean; output: string; code?: string }>((resolve) => {
      webpack(config, (err: Error | null, stats: any) => {
        if (err) {
          resolve({ success: false, output: err.message });
          return;
        }
        const info = stats.toJson({ errors: true, warnings: false });
        if (stats.hasErrors()) {
          resolve({ success: false, output: info.errors.map((e: any) => e.message).join('\n') });
          return;
        }
        try {
          const code = fs.readFileSync(path.join(tmpDir, 'dist', 'bundle.js'), 'utf8');
          resolve({ success: true, output: 'compiled successfully', code });
        } catch (e) {
          resolve({ success: false, output: `build succeeded but output not found: ${e}` });
        }
      });
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return result;
  } catch (e) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { success: false, output: `compiler error: ${e}` };
  }
}

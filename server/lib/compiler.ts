import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
const loadModule = new Function('name', 'return require(name)') as (name: string) => any;

const DEV_LIB_DIR = path.join(process.cwd(), '..', 'packages', 'dolus-dev');

export async function compilePayload(tsSource: string): Promise<{ success: boolean; output: string; code?: string }> {
  const tmpDir = path.join(os.tmpdir(), `dolus-wp-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    fs.writeFileSync(path.join(tmpDir, 'payload.ts'), tsSource);
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
      module: {
        rules: [{ test: /\.ts$/, use: { loader: 'ts-loader', options: { configFile: path.join(tmpDir, 'tsconfig.json'), transpileOnly: true } } }],
      },
      resolve: {
        extensions: ['.ts', '.js'],
        alias: { '@dolus/dev': DEV_LIB_DIR },
      },
    };

    return new Promise((resolve) => {
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
  } catch (e) {
    return { success: false, output: `compiler error: ${e}` };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

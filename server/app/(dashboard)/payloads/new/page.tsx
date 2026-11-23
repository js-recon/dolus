import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { addPayloadAction } from '../actions';
import PayloadEditor from '../editor';

export const dynamic = 'force-dynamic';

export default async function NewPayloadPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  let dts = '';
  try {
    dts = fs.readFileSync(path.join(process.cwd(), '..', 'packages', 'dolus-dev', 'dist', 'index.d.ts'), 'utf8');
  } catch (_) {}

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/payloads" className="text-gray-500 text-sm hover:text-white">← payloads</Link>
        <div className="text-xs text-gray-400">NEW PAYLOAD</div>
      </div>

      {error === 'missing' && (
        <div className="text-red-400 text-sm border border-red-900 px-3 py-2 rounded-lg">name and code are required</div>
      )}

      <form action={addPayloadAction} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">NAME</label>
          <input name="name" required placeholder="e.g. recon-passwords" className="w-full bg-black border border-gray-700 rounded-lg text-white text-sm p-2.5 focus:outline-none focus:border-gray-500 transition-colors" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">DESCRIPTION</label>
          <input name="description" placeholder="optional" className="w-full bg-black border border-gray-700 rounded-lg text-white text-sm p-2.5 focus:outline-none focus:border-gray-500 transition-colors" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">PAYLOAD CODE — use __PKG_NAME__ and __C2_URL__ as placeholders, or import from @dolus/dev</label>
          <PayloadEditor dts={dts} />
        </div>
        <button type="submit" className="bg-white text-black px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
          save payload
        </button>
      </form>
    </div>
  );
}

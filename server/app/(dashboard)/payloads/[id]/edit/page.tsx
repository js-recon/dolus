import db, { type Payload } from '@/lib/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { updatePayloadAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function EditPayloadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const payload = db.prepare('SELECT * FROM payloads WHERE id = ? AND builtin = 0').get(id) as Payload | undefined;
  if (!payload) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/payloads" className="text-gray-500 text-sm hover:text-white">← payloads</Link>
        <div className="text-xs text-gray-400">EDIT PAYLOAD</div>
      </div>

      {error === 'missing' && (
        <div className="text-red-400 text-sm border border-red-900 px-3 py-2">name and install_js are required</div>
      )}

      <form action={updatePayloadAction} className="space-y-4">
        <input type="hidden" name="id" value={payload.id} />
        <div className="space-y-1">
          <label className="text-xs text-gray-400">NAME</label>
          <input name="name" required defaultValue={payload.name} className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">DESCRIPTION</label>
          <input name="description" defaultValue={payload.description ?? ''} className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">INSTALL.JS — use __PKG_NAME__ and __C2_URL__ as placeholders</label>
          <textarea
            name="install_js"
            rows={24}
            required
            defaultValue={payload.install_js}
            className="w-full bg-black border border-gray-700 text-white text-xs p-2 resize-y focus:outline-none focus:border-white font-mono"
          />
        </div>
        <button type="submit" className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors">
          save changes
        </button>
      </form>
    </div>
  );
}

import Link from 'next/link';
import { addAccountAction } from '../actions';

export const dynamic = 'force-dynamic';

function Field({ label, name, placeholder, type = 'text' }: { label: string; name: string; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required
        className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
      />
    </div>
  );
}

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/accounts" className="text-gray-500 text-sm hover:text-white">← accounts</Link>
        <div className="text-xs text-gray-400">ADD ACCOUNT</div>
      </div>

      {error === 'missing' && (
        <div className="text-red-400 text-sm border border-red-900 px-3 py-2">all fields are required</div>
      )}

      <form action={addAccountAction} className="space-y-4">
        <Field label="NAME" name="name" placeholder="e.g. verdaccio-prod" />
        <Field label="REGISTRY URL" name="registry_url" placeholder="http://registry:4873/" />
        <Field label="AUTH TOKEN" name="token" type="password" placeholder="npm auth token" />
        <Field label="C2 URL" name="c2_url" placeholder="http://c2-server:3000" />
        <div className="space-y-1">
          <label className="text-xs text-gray-400">NOTES (optional)</label>
          <textarea
            name="notes"
            rows={2}
            placeholder="any notes about this account"
            className="w-full bg-black border border-gray-700 text-white text-sm p-2 resize-none focus:outline-none focus:border-white"
          />
        </div>
        <button type="submit" className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors">
          save account
        </button>
      </form>
    </div>
  );
}

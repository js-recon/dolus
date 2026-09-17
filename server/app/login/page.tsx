import { loginAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-xs space-y-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dolus-logo.png" alt="Dolus" className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold tracking-widest">DOLUS</span>
        </div>

        {error && (
          <div className="text-red-400 text-sm border border-red-900 px-3 py-2">invalid credentials</div>
        )}

        <form action={loginAction} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">USERNAME</label>
            <input
              name="username"
              required
              autoComplete="username"
              className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">PASSWORD</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
            />
          </div>
          <button
            type="submit"
            className="w-full border border-white px-4 py-2 text-sm hover:bg-white hover:text-black transition-colors"
          >
            login
          </button>
        </form>
      </div>
    </div>
  );
}

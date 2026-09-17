import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="border-b border-gray-800 px-6 py-3 flex gap-6 text-sm items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Link href="/" className="flex items-center"><img src="/dolus-logo.png" alt="Dolus" className="h-7 w-7 object-contain" /></Link>
        <Link href="/" className="text-gray-400 hover:text-white">overview</Link>
        <Link href="/packages" className="text-gray-400 hover:text-white">packages</Link>
        <Link href="/beacons" className="text-gray-400 hover:text-white">beacons</Link>
        <Link href="/accounts" className="text-gray-400 hover:text-white">accounts</Link>
        <Link href="/payloads" className="text-gray-400 hover:text-white">payloads</Link>
        <Link href="/settings" className="text-gray-400 hover:text-white">settings</Link>
        <div className="ml-auto">
          <form action={logoutAction}>
            <button type="submit" className="text-gray-500 hover:text-white text-xs">logout</button>
          </form>
        </div>
      </nav>
      <main className="px-6 py-6">{children}</main>
    </>
  );
}

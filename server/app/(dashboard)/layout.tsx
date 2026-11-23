import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';

const NAV_ITEMS = [
  { href: '/', label: 'overview' },
  { href: '/packages', label: 'packages' },
  { href: '/campaigns', label: 'campaigns' },
  { href: '/beacons', label: 'beacons' },
  { href: '/accounts', label: 'accounts' },
  { href: '/payloads', label: 'payloads' },
  { href: '/settings', label: 'settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="border-b border-gray-800/50 px-6 py-3 flex gap-1 text-sm items-center bg-gray-950/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Link href="/" className="flex items-center mr-4"><img src="/dolus-logo.png" alt="Dolus" className="h-7 w-7 object-contain" /></Link>
        {NAV_ITEMS.map(({ href, label }) => (
          <Link key={href} href={href} className="px-3 py-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 transition-all text-[13px]">
            {label}
          </Link>
        ))}
        <div className="ml-auto">
          <form action={logoutAction}>
            <button type="submit" className="text-gray-600 hover:text-gray-400 text-xs transition-colors">logout</button>
          </form>
        </div>
      </nav>
      <main className="px-6 py-6 max-w-7xl">{children}</main>
    </>
  );
}

import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'Dolus' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-black text-white">
      <body className="min-h-screen font-mono">
        <nav className="border-b border-gray-800 px-6 py-3 flex gap-6 text-sm">
          <span className="text-white font-bold tracking-widest">DOLUS</span>
          <Link href="/" className="text-gray-400 hover:text-white">overview</Link>
          <Link href="/packages" className="text-gray-400 hover:text-white">packages</Link>
          <Link href="/beacons" className="text-gray-400 hover:text-white">beacons</Link>
        </nav>
        <main className="px-6 py-6">{children}</main>
      </body>
    </html>
  );
}

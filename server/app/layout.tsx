import './globals.css';

export const metadata = { title: 'Dolus' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-black text-white">
      <body className="min-h-screen font-mono">{children}</body>
    </html>
  );
}

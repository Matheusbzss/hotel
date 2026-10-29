import type { Metadata } from 'next';
import { Albert_Sans } from 'next/font/google';
import '../globals.css';

const albert = Albert_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-albert', display: 'swap' });

export const metadata: Metadata = {
  title: 'Admin — Agência Victor Hugo',
  robots: { index: false, follow: false },
};

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={albert.variable}>
      <body className="min-h-dvh bg-[#f4f6f8]">{children}</body>
    </html>
  );
}

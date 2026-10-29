import type { Metadata } from 'next';
import { TikTok_Sans } from 'next/font/google';
import '../globals.css';

const tiktok = TikTok_Sans({ subsets: ['latin', 'latin-ext'], axes: ['wdth', 'opsz'], variable: '--font-tiktok', display: 'swap' });

export const metadata: Metadata = {
  title: 'Admin — Agência Victor Hugo',
  robots: { index: false, follow: false },
};

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={tiktok.variable}>
      <body className="tom-claro min-h-dvh">{children}</body>
    </html>
  );
}

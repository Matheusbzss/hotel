import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import { EMPRESA } from '@/config/empresa';
import '../globals.css';

const archivo = Archivo({ subsets: ['latin', 'latin-ext'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: `Admin — ${EMPRESA.marca}`,
  robots: { index: false, follow: false },
};

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={archivo.variable}>
      <body className="tom-fundo min-h-dvh">{children}</body>
    </html>
  );
}

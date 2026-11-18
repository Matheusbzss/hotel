import type { Metadata } from 'next';
import { EMPRESA } from '@/config/empresa';
import '../globals.css';

export const metadata: Metadata = {
  title: `Admin — ${EMPRESA.marca}`,
  robots: { index: false, follow: false },
};

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="tom-fundo min-h-dvh">{children}</body>
    </html>
  );
}

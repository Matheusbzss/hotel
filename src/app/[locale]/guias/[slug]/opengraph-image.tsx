import { EMPRESA } from '@/config/empresa';
import { obterGuia } from '@/data/guias';
import { TAMANHO_OG, previaDaPagina } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/jpeg';
export const alt = EMPRESA.marca;

/** Prévia do guia: a foto do topo com o título. */
export default async function Imagem({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = obterGuia(slug);
  return previaDaPagina({
    foto: g?.foto ?? '/fotos/buzios/escuna-no-mar.jpg',
    titulo: g?.h1 ?? EMPRESA.marca,
    texto: 'Guía para planear tu viaje a la Región de los Lagos.',
  });
}

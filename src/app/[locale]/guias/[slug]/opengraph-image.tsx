import { EMPRESA } from '@/config/empresa';
import { obterGuia, textoGuia } from '@/data/guias';
import { isIdiomaGuia } from '@/i18n/config';
import { TAMANHO_OG, previaDaPagina } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/jpeg';
export const alt = EMPRESA.marca;

/** Prévia do guia: a foto do topo com o título, na versão do espanhol da página. */
export default async function Imagem({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const g = obterGuia(slug);
  const idioma = isIdiomaGuia(locale) ? locale : 'es';
  return previaDaPagina({
    foto: g?.foto ?? '/fotos/buzios/escuna-no-mar.jpg',
    titulo: g ? textoGuia(g, 'h1', idioma) : EMPRESA.marca,
    texto: 'Guía para planear tu viaje a la Región de los Lagos.',
  });
}

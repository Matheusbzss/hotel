import { EMPRESA } from '@/config/empresa';
import { TERMOS } from '@/content/legal/termos';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { TAMANHO_OG, previaDaPagina } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/jpeg';
export const alt = EMPRESA.marca;

/** Prévia dos textos legais: o pôr do sol na baía de Búzios, a foto do topo da inicial. */
export default async function Imagem({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const idioma = isIdioma(locale) ? locale : 'pt';
  return previaDaPagina({
    foto: '/fotos/buzios/por-do-sol-barcos-na-baia.jpg',
    titulo: TERMOS[idioma].titulo,
    texto: dicionario(idioma).home.heroTexto,
  });
}

import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { TAMANHO_OG, previaDaPagina } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/jpeg';
export const alt = EMPRESA.marca;

/** Prévia das casas de temporada: a mesma foto da página. */
export default async function Imagem({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = dicionario(isIdioma(locale) ? locale : 'pt');
  return previaDaPagina({ foto: '/fotos/buzios/vista-da-escuna.jpg', titulo: d.casas.titulo, texto: d.home.heroTexto });
}

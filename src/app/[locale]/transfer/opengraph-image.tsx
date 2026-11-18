import { EMPRESA } from '@/config/empresa';
import { FOTO_TOPO_TRANSFER } from '@/data/transfer';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { TAMANHO_OG, previaDaPagina } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/jpeg';
export const alt = EMPRESA.marca;

/** Prévia do transfer: a foto real do carro na chegada ao hotel, a mesma do topo da página. */
export default async function Imagem({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = dicionario(isIdioma(locale) ? locale : 'pt');
  return previaDaPagina({ foto: FOTO_TOPO_TRANSFER, titulo: d.transfer.titulo, texto: d.transfer.cartaoTexto });
}

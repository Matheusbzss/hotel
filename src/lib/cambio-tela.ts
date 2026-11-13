import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import { cotacaoDolarComData } from './dolar';

/**
 * O câmbio pronto para as telas: a taxa para o "≈ US$" e a nota com a fonte e a data da cotação.
 * Roda no servidor (páginas e layout); os componentes do navegador recebem os dois por props.
 */
export interface CambioTela {
  /** Reais por dólar, ou null: em português (que nunca mostra dólar) e sem cotação que valha. */
  taxa: number | null;
  /** "Pagás en reales. El ≈ US$ es aproximado: cotización del Banco Central de Brasil del 07/11/2026." */
  nota: string;
}

export const SEM_CAMBIO: CambioTela = { taxa: null, nota: '' };

/** A cotação guardada, com a nota já no idioma; o ≈ US$ só existe em espanhol e inglês. */
export async function cambioParaTela(idioma: Idioma): Promise<CambioTela> {
  if (idioma === 'pt') return SEM_CAMBIO;
  const cotacao = await cotacaoDolarComData();
  if (!cotacao) return SEM_CAMBIO;
  // a data da PTAX ("2026-11-07") no formato do idioma, como as datas da página da casa
  const data = new Intl.DateTimeFormat(LOCALE_INTL[idioma], { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${cotacao.data}T12:00:00Z`),
  );
  return { taxa: cotacao.taxa, nota: fmt(dicionario(idioma).preco.notaCambio, { data }) };
}

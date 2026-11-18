// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { fmt } from '../i18n/config.ts';
import type { PartesDoReembolso } from './reembolsos-a-resolver.ts';

/**
 * As frases do reembolso na tela do cliente (a página do pedido e a do voucher), puras, para o servidor e o navegador
 * (tests/frases-do-reembolso.test.ts). Sem reembolso que falhou na Stripe, a frase de sempre, sem mudar uma letra; com
 * ele, na ordem: o que voltou pela mesma forma de pagamento, o que ainda não voltou (o título vira "Reembolso pendente")
 * e o que a equipe devolveu de outro jeito. Nenhuma frase promete prazo, diz o motivo da falha ou fala em cartão (o
 * reembolso de Pix também pode falhar). O valor sempre com os centavos: a `cifra` de quem chama (formatarCifra).
 */

/** Os textos do dicionário (pedido.*) que as frases usam, cada um com o marcador {valor} quando leva valor. */
export interface TextosDoReembolso {
  /** O pedido (ou o voucher) devolvido por inteiro pela mesma forma de pagamento: a frase de sempre. */
  reembolsadoTexto: string;
  /** O reembolso de uma parte, devolvido pela mesma forma de pagamento ({valor}). */
  reembolsadoParcial: string;
  /** O que a Stripe não conseguiu devolver e a equipe ainda não devolveu de outro jeito ({valor}). */
  reembolsoFalhou: string;
  /** O que a equipe devolveu de outro jeito, depois da falha ({valor}). */
  reembolsoOutroMeio: string;
}

/**
 * As frases do reembolso, uma por parágrafo, na ordem. `inteiro`: o pedido (ou o voucher) foi devolvido por inteiro.
 * Sem nada pendente nem devolvido por outro meio, o texto de hoje: inteiro, a frase de sempre; senão, a do reembolso
 * parcial com o valor, ou nenhuma (nada voltou).
 */
export function frasesDoReembolso(
  partes: PartesDoReembolso,
  inteiro: boolean,
  textos: TextosDoReembolso,
  cifra: (centavos: number) => string,
): string[] {
  const { originalCentavos: original, pendenteCentavos: pendente, outroMeioCentavos: outroMeio } = partes;
  const pelaMesmaForma = original > 0 ? [fmt(textos.reembolsadoParcial, { valor: cifra(original) })] : [];
  if (pendente <= 0 && outroMeio <= 0) return inteiro ? [textos.reembolsadoTexto] : pelaMesmaForma;
  return [
    ...pelaMesmaForma,
    ...(pendente > 0 ? [fmt(textos.reembolsoFalhou, { valor: cifra(pendente) })] : []),
    ...(outroMeio > 0 ? [fmt(textos.reembolsoOutroMeio, { valor: cifra(outroMeio) })] : []),
  ];
}

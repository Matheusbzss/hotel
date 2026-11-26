// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { CANCELAMENTO_DAS_CASAS, REGRAS_DAS_CASAS } from '../data/regras-casas.ts';
import { LOCALE_INTL, fmt, type Idioma } from '../i18n/config.ts';
import { texto as noIdioma } from '../i18n/conteudo.ts';
import type { Dicionario } from '../i18n/index.ts';
import { dataComDiaDaSemana } from './casa-no-carrinho.ts';
import { HORA_ENTRADA_CASA, HORA_SAIDA_CASA, noitesEntre } from './diarias.ts';
import type { FormaPagamento } from './formas-pagamento.ts';
import { formatarHora } from './horarios.ts';
import { formatarCentavos } from './orcamento.ts';
import { valorRecebido } from './pedidos-painel.ts';
import type { ReservaCasa } from './reservas';
import { formatarDataIso } from './validacao.ts';

/**
 * AS SAÍDAS DO PEDIDO DE CASA (Etapa 7, a reserva completa das casas, pacote 1, parte 2): o voucher em PDF, as páginas do
 * pedido e da reserva e os e-mails mostram a casa pelas mesmas regras, que moram aqui, sem banco, sem Next e sem o pdf-lib
 * (os testes estão em tests/reserva-casa-saidas.test.ts):
 * - a chegada a partir das 15h e a saída até as 12h, com a data no idioma;
 * - os valores sempre os GUARDADOS na compra (o total da estadia e o sinal de cada forma: ReservaCasa), nunca a conta
 *   refeita, e, depois de pago, só os da forma paga (crítica de 26/11, furo 20: com as duas colunas, quem pagou o sinal no
 *   cartão pediria o desconto do Pix na chegada);
 * - sem endereço: a equipe manda a localização exata pelo WhatsApp depois do pagamento.
 */

/** Quantas diárias a estadia tem (a noite da saída não conta), pelas datas guardadas. */
export const noitesDaEstadia = (r: Pick<ReservaCasa, 'data' | 'saida'>): number => noitesEntre(r.data, r.saida).length;

/** "2 diárias", "1 diária" (casas.nDiarias e casas.umaDiaria). */
export const textoDasDiarias = (noites: number, C: Pick<Dicionario['casas'], 'nDiarias' | 'umaDiaria'>): string =>
  noites === 1 ? C.umaDiaria : fmt(C.nDiarias, { n: noites });

/** "10 hóspedes", "1 hóspede" (casas.linha). */
export const textoDosHospedes = (n: number, C: Pick<Dicionario['casas'], 'linha'>): string =>
  n === 1 ? C.linha.hospede : fmt(C.linha.hospedes, { n });

/**
 * A chegada e a saída por extenso, no idioma: "seg., 14 de dez. de 2026, a partir das 15h" e "qua., 16 de dez. de 2026, até
 * as 12h" (casas.quandoEntra e casas.quandoSai, com a data como o voucher do passeio escreve e a hora de formatarHora).
 */
export function chegadaESaida(
  r: Pick<ReservaCasa, 'data' | 'saida'>,
  idioma: Idioma,
  C: Pick<Dicionario['casas'], 'quandoEntra' | 'quandoSai'>,
): { entrada: string; saida: string } {
  const locale = LOCALE_INTL[idioma];
  return {
    entrada: fmt(C.quandoEntra, { data: formatarDataIso(r.data, locale), hora: formatarHora(HORA_ENTRADA_CASA, idioma) }),
    saida: fmt(C.quandoSai, { data: formatarDataIso(r.saida, locale), hora: formatarHora(HORA_SAIDA_CASA, idioma) }),
  };
}

/** Os valores guardados da casa numa forma: o total da estadia, o sinal (pago no site) e o restante, pago na chegada. */
export interface ValoresDaCasa {
  totalCentavos: number;
  sinalCentavos: number;
  chegadaCentavos: number;
}

export function valoresDaCasa(
  r: Pick<ReservaCasa, 'totalCentavos' | 'totalPixCentavos' | 'sinalCentavos' | 'sinalPixCentavos'>,
  forma: FormaPagamento,
): ValoresDaCasa {
  const total = forma === 'pix' ? (r.totalPixCentavos ?? r.totalCentavos) : r.totalCentavos;
  const sinal = forma === 'pix' ? r.sinalPixCentavos : r.sinalCentavos;
  return { totalCentavos: total, sinalCentavos: sinal, chegadaCentavos: total - sinal };
}

/** A forma em que a casa foi (ou vai ser) paga, pelo pedido: o Pix ou o cartão (o caminho do WhatsApp nunca vale para casa). */
export const formaDaCasa = (r: Pick<ReservaCasa, 'pagamento'>): FormaPagamento => (r.pagamento.metodo === 'pix' ? 'pix' : 'cartao');

/**
 * O que fica para pagar na chegada a casas de um pedido, na forma do pedido: a soma do restante de cada casa que ainda
 * vale (o voucher cancelado ou devolvido sozinho fica de fora). 0 sem casa.
 */
export function chegadaDasCasas(vouchers: readonly { tipo?: string; statusItem?: string }[], forma: FormaPagamento): number {
  return vouchers
    .filter((v): v is ReservaCasa => v.tipo === 'casa' && v.statusItem !== 'cancelado' && v.statusItem !== 'reembolsado')
    .reduce((soma, v) => soma + valoresDaCasa(v, forma).chegadaCentavos, 0);
}

/** O conteúdo do voucher em PDF (src/lib/pdf-voucher.ts desenha): os campos do cartão, a mensagem do WhatsApp e os avisos. */
export interface ConteudoDoVoucherDaCasa {
  campos: [string, string[]][];
  mensagem: string;
  avisos: string[];
}

/**
 * O voucher da casa de temporada, já no idioma da reserva: a casa, a chegada (a partir das 15h) e a saída (até as 12h), as
 * diárias, os hóspedes, o nome do titular, o sinal pago no site, o restante na chegada (e como se paga) e o total da estadia,
 * só na forma paga (o PDF só sai do voucher pago). Nos avisos: a entrada e a saída, a localização exata pelo WhatsApp da
 * equipe, a recepção, o cadastro dos hóspedes, o restante na chegada e as regras de cancelamento das casas. A mensagem do
 * botão do WhatsApp leva o voucher, a casa, as datas e os hóspedes. Nenhum endereço.
 */
export function conteudoDoVoucherDaCasa(reserva: ReservaCasa, d: Dicionario): ConteudoDoVoucherDaCasa {
  const idioma = reserva.idioma;
  const locale = LOCALE_INTL[idioma];
  const C = d.casas;
  const R = d.reserva;
  const { entrada, saida } = chegadaESaida(reserva, idioma, C);
  const hospedes = textoDosHospedes(reserva.hospedes, C);
  const valores = valoresDaCasa(reserva, formaDaCasa(reserva));
  // o que entrou por este voucher (o sinal guardado na forma paga): o mesmo número do painel e do e-mail
  const pago = valorRecebido(reserva);
  const brl = (centavos: number) => formatarCentavos(centavos, locale);
  const chegada = brl(valores.totalCentavos - pago);
  return {
    campos: [
      [R.casa, [reserva.casa.nome]],
      [C.chegada, [entrada]],
      [C.saida, [saida]],
      [C.diarias, [textoDasDiarias(noitesDaEstadia(reserva), C)]],
      [C.hospedes, [hospedes]],
      [R.nome, [reserva.cliente.nome]],
      [C.sinalPago, [brl(pago)]],
      [C.naChegada, [`${chegada}, ${C.formasNaChegada}`]],
      [C.totalDaEstadia, [brl(valores.totalCentavos)]],
    ],
    mensagem: fmt(R.casaMsgVoucher, {
      codigo: reserva.codigo,
      casa: reserva.casa.nome,
      entrada: dataComDiaDaSemana(reserva.data, idioma, locale),
      saida: dataComDiaDaSemana(reserva.saida, idioma, locale),
      hospedes,
    }),
    avisos: [
      noIdioma(REGRAS_DAS_CASAS.entradaSaida, idioma),
      R.casaLocalizacao,
      noIdioma(REGRAS_DAS_CASAS.recepcao, idioma),
      noIdioma(REGRAS_DAS_CASAS.cadastro, idioma),
      fmt(R.casaProximo3, { valor: chegada }),
      ...CANCELAMENTO_DAS_CASAS.map((regra) => noIdioma(regra, idioma)),
    ],
  };
}

import type { Texto } from '@/data/passeios';
// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { precoPixCentavos } from './orcamento.ts';

/** O sinal pago na reserva de uma casa, em porcentagem do total. */
export const SINAL_PORCENTO = 50;

/** A hora de entrada nas casas: é dela que se conta a antecedência mínima do pagamento de uma estadia. */
export const HORA_ENTRADA_CASA = '15:00';

export interface PeriodoPreco {
  nome: Texto;
  /** Primeira noite do período (AAAA-MM-DD). */
  de: string;
  /** Última noite do período (AAAA-MM-DD). */
  ate: string;
  /** Diária em reais nessas noites. */
  diaria: number;
  minimoNoites?: number;
}

/** O que entra na conta da estadia (vem de cada casa em src/data/casas.ts). */
export interface TabelaDiarias {
  /** Diária em reais fora dos períodos. */
  diaria: number;
  minimoNoites: number;
  temporadas: PeriodoPreco[];
  /** Valem por cima da temporada. */
  feriados: PeriodoPreco[];
  /** Em reais, uma vez por reserva. */
  taxaLimpeza: number;
}

function somarUmDia(dataIso: string): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** A menor diária da casa, em qualquer época: o "diária a partir de" da lista. */
export function menorDiaria(t: TabelaDiarias): number {
  return Math.min(t.diaria, ...t.temporadas.map((p) => p.diaria), ...t.feriados.map((p) => p.diaria));
}

/** As noites da estadia: da chegada até a véspera da saída (a noite da saída não conta). */
export function noitesEntre(chegada: string, saida: string): string[] {
  const noites: string[] = [];
  for (let n = chegada; n < saida && noites.length <= 366; n = somarUmDia(n)) noites.push(n);
  return noites;
}

const dentro = (noite: string, p: PeriodoPreco) => noite >= p.de && noite <= p.ate;

/** A diária de uma noite: feriado, senão temporada, senão a diária normal. */
export function diariaDaNoite(t: TabelaDiarias, noite: string): { diaria: number; periodo?: PeriodoPreco } {
  const periodo = t.feriados.find((p) => dentro(noite, p)) ?? t.temporadas.find((p) => dentro(noite, p));
  return periodo ? { diaria: periodo.diaria, periodo } : { diaria: t.diaria };
}

export interface OrcamentoCasa {
  noites: { data: string; diaria: number }[];
  /** Soma das diárias, em reais. */
  diarias: number;
  taxaLimpeza: number;
  total: number;
  /** Pago na reserva. */
  sinal: number;
  /** O resto do total. */
  restante: number;
  /** O maior mínimo de noites entre a diária normal e os períodos da estadia. */
  minimoNoites: number;
  ok: boolean;
  motivo?: 'datas' | 'minimo';
}

/**
 * A estadia em centavos, nas duas formas de pagamento: é a conta que o servidor usa para cobrar
 * (src/lib/formas-pagamento.ts) e que vai para o banco (sinal_centavos). Nada aqui depende do navegador.
 */
export interface OrcamentoCasaCentavos {
  noites: { data: string; diariaCentavos: number }[];
  diariasCentavos: number;
  taxaLimpezaCentavos: number;
  /** O total no cartão. */
  totalCentavos: number;
  /** O total no Pix: o desconto do Pix em cada diária e na taxa de limpeza, como nos passeios (por unidade). */
  totalPixCentavos: number;
  /** O sinal pago na reserva (SINAL_PORCENTO do total), arredondado em centavos; o resto é pago na chegada. */
  sinalCentavos: number;
  sinalPixCentavos: number;
  restanteCentavos: number;
  restantePixCentavos: number;
  /** O maior mínimo de noites entre a diária normal e os períodos da estadia. */
  minimoNoites: number;
  ok: boolean;
  motivo?: 'datas' | 'minimo';
}

const emCentavos = (reais: number) => Math.round(reais * 100);

/** O sinal de uma casa sobre um total em centavos: metade (SINAL_PORCENTO), arredondada em centavos. */
export const sinalCentavos = (totalCentavos: number) => Math.round((totalCentavos * SINAL_PORCENTO) / 100);

/** O preço da estadia em centavos: as diárias noite a noite, a taxa de limpeza, os totais, o sinal e o restante. */
export function orcamentoCasaCentavos(t: TabelaDiarias, chegada: string, saida: string): OrcamentoCasaCentavos {
  const noites = noitesEntre(chegada, saida).map((data) => ({ data, diariaCentavos: emCentavos(diariaDaNoite(t, data).diaria) }));
  const minimoNoites = Math.max(t.minimoNoites, ...noites.map((n) => diariaDaNoite(t, n.data).periodo?.minimoNoites ?? 0));
  const diariasCentavos = noites.reduce((s, n) => s + n.diariaCentavos, 0);
  const taxaLimpezaCentavos = noites.length ? emCentavos(t.taxaLimpeza) : 0;
  const totalCentavos = diariasCentavos + taxaLimpezaCentavos;
  const totalPixCentavos = noites.reduce((s, n) => s + precoPixCentavos(n.diariaCentavos), 0) + precoPixCentavos(taxaLimpezaCentavos);
  const sinal = sinalCentavos(totalCentavos);
  const sinalPix = sinalCentavos(totalPixCentavos);
  const motivo = !noites.length ? 'datas' : noites.length < minimoNoites ? 'minimo' : undefined;
  return {
    noites,
    diariasCentavos,
    taxaLimpezaCentavos,
    totalCentavos,
    totalPixCentavos,
    sinalCentavos: sinal,
    sinalPixCentavos: sinalPix,
    restanteCentavos: totalCentavos - sinal,
    restantePixCentavos: totalPixCentavos - sinalPix,
    minimoNoites,
    ok: !motivo,
    motivo,
  };
}

/**
 * O preço da estadia em reais, para o cartão de reserva da página da casa (ReservaCasa.tsx): a mesma conta
 * em centavos de orcamentoCasaCentavos, mostrada em reais. O sinal é o do cartão.
 */
export function orcamentoCasa(t: TabelaDiarias, chegada: string, saida: string): OrcamentoCasa {
  const c = orcamentoCasaCentavos(t, chegada, saida);
  return {
    noites: c.noites.map((n) => ({ data: n.data, diaria: n.diariaCentavos / 100 })),
    diarias: c.diariasCentavos / 100,
    taxaLimpeza: t.taxaLimpeza,
    total: c.totalCentavos / 100,
    sinal: c.sinalCentavos / 100,
    restante: c.restanteCentavos / 100,
    minimoNoites: c.minimoNoites,
    ok: c.ok,
    motivo: c.motivo,
  };
}

/** As faixas de preço da estadia, para o resumo: "3 noites × R$ 1.500", "2 noites × R$ 3.000". */
export function faixasDaEstadia(o: OrcamentoCasa): { noites: number; diaria: number }[] {
  const faixas: { noites: number; diaria: number }[] = [];
  for (const n of o.noites) {
    const ultima = faixas[faixas.length - 1];
    if (ultima && ultima.diaria === n.diaria) ultima.noites++;
    else faixas.push({ noites: 1, diaria: n.diaria });
  }
  return faixas;
}

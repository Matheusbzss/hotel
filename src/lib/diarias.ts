import type { Texto } from '@/data/passeios';

/** O sinal pago na reserva de uma casa, em porcentagem do total. */
export const SINAL_PORCENTO = 50;

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

/** O preço da estadia: as diárias noite a noite, a taxa de limpeza, o sinal e o restante. */
export function orcamentoCasa(t: TabelaDiarias, chegada: string, saida: string): OrcamentoCasa {
  const noites = noitesEntre(chegada, saida).map((data) => ({ data, diaria: diariaDaNoite(t, data).diaria }));
  const minimoNoites = Math.max(t.minimoNoites, ...noites.map((n) => diariaDaNoite(t, n.data).periodo?.minimoNoites ?? 0));
  const diarias = noites.reduce((s, n) => s + n.diaria, 0);
  const total = noites.length ? diarias + t.taxaLimpeza : 0;
  const sinal = Math.round((total * SINAL_PORCENTO) / 100);
  const motivo = !noites.length ? 'datas' : noites.length < minimoNoites ? 'minimo' : undefined;
  return { noites, diarias, taxaLimpeza: t.taxaLimpeza, total, sinal, restante: total - sinal, minimoNoites, ok: !motivo, motivo };
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

import type { Texto } from '../data/passeios';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { HORA_ENTRADA_CASA, noitesEntre, sinalCentavos } from './diarias.ts';
import { ANTECEDENCIA_MINIMA_MINUTOS, agoraEmBuzios, paraMinutos } from './horarios.ts';
import { precoPixCentavos } from './orcamento.ts';
import { somarDias } from './validacao.ts';

/**
 * A CONTA DA ESTADIA NAS CASAS (Fase 4, Etapa 7), em centavos e noite a noite. É a conta que a página mostra e que o
 * servidor refaz antes de cobrar; nada aqui depende do navegador nem do banco.
 *
 * As regras (FASE-4, Etapa 7, e as decisões recomendadas de 13/11 em ETAPA-7-PLANO-DAS-CASAS.md):
 * - Diária de semana nas noites de segunda a sexta; diária de fim de semana nas noites de sábado e domingo.
 *   Ex.: entrada na sexta e saída na segunda = sexta (semana) + sábado + domingo (fim de semana).
 * - Casa sem preço não vende: diária de semana vazia ou zero, diária de fim de semana zero, ou qualquer noite que sairia
 *   por R$ 0,00 (motivo 'preco'). Nunca uma estadia de graça por um campo esquecido no painel.
 * - Período de temporada: vale nas noites dele, mas nunca baixa o sábado e o domingo (nessas noites fica a maior entre a
 *   diária da temporada e a de fim de semana). O feriado vale por cima de tudo.
 * - Mínimo de noites da casa (2 na semana); um período (temporada) pode pedir mais.
 * - Fim de semana junto: quem pega uma das noites de sexta, sábado ou domingo leva as três (entra até sexta e sai na
 *   segunda ou depois). Estadia de NOITES_LIVRES_DO_FIM_DE_SEMANA noites ou mais fica livre. Noite do fim de semana
 *   que já está num pacote, ocupada ou no passado não conta: as que sobram andam juntas (ex.: sábado 02 e domingo
 *   03/01/2027, depois do Réveillon).
 * - Pacote de datas fixas ("Pacote Carnaval"): quem pega uma noite dele leva o pacote inteiro, com todas as diárias no
 *   preço do pacote. Pacotes do mesmo grupo são opções do mesmo feriado (Réveillon de 4 ou de 5 diárias): a estadia
 *   leva uma delas inteira. O pacote substitui o fim de semana e o mínimo de noites.
 * - Pix: 10% de desconto sobre o TOTAL (DESCONTO_PIX_PORCENTO). O sinal é SINAL_PORCENTO (50%) do total da forma de
 *   pagamento, cobrado no site; o resto é pago na chegada.
 * - Limpeza incluída na diária e sem caução (regra de todas as casas): não entram na conta.
 */

/** Estadia com esta quantidade de noites ou mais fica livre da regra do fim de semana (decisão da pendência 2). */
export const NOITES_LIVRES_DO_FIM_DE_SEMANA = 7;

/** A estadia mais longa que a conta aceita (a mesma trava de noitesEntre). */
export const MAXIMO_NOITES = 366;

/** Um pacote de datas fixas. A noite da saída não conta, como nas reservas. */
export interface Pacote {
  /** "Pacote Carnaval": sempre "Pacote" + o nome do feriado (nunca "promoção"). */
  nome: Texto;
  /** A data de entrada (AAAA-MM-DD). */
  entrada: string;
  /** A data de saída (AAAA-MM-DD): a noite dela fica fora do pacote. */
  saida: string;
  /** A diária de cada noite do pacote, em centavos. */
  diariaCentavos: number;
  /** Pacotes com o mesmo grupo são opções do mesmo feriado: o cliente escolhe uma (ex.: 'reveillon-2026'). */
  grupo?: string;
}

/** Uma diária por período (a tabela casas_tarifas): o feriado vale por cima da temporada. */
export interface PeriodoDiaria {
  tipo: 'temporada' | 'feriado';
  nome: Texto;
  /** A primeira e a última NOITE do período (AAAA-MM-DD). */
  de: string;
  ate: string;
  /**
   * O feriado vale em todas as noites do período. A temporada também, menos no sábado e no domingo, em que fica a
   * maior entre ela e a diária de fim de semana (uma "alta temporada" para subir a semana não barateia o fim de semana).
   */
  diariaCentavos: number;
  minimoNoites?: number;
}

/** O que entra na conta de uma casa (as colunas e as tabelas dela, lidas em src/lib/casa-detalhes.ts). */
export interface TabelaEstadia {
  /** A diária de semana (noites de segunda a sexta), em centavos. Zero (ou vazia no banco): a casa fica sem preço. */
  diariaCentavos: number;
  /** A diária das noites de sábado e domingo, em centavos. Vazia: vale a de semana. Zero: a casa fica sem preço. */
  diariaFimDeSemanaCentavos?: number | null;
  minimoNoites: number;
  /** A regra do fim de semana (sexta, sábado e domingo juntos). */
  fimDeSemanaJunto: boolean;
  periodos: PeriodoDiaria[];
  pacotes: Pacote[];
}

export type TipoNoite = 'semana' | 'fim-de-semana' | 'temporada' | 'feriado' | 'pacote';

export interface NoiteDaEstadia {
  data: string;
  diariaCentavos: number;
  tipo: TipoNoite;
  /** O pacote da noite, quando ela é de um pacote. */
  pacote?: Pacote;
}

/**
 * Por que a estadia não pode ser reservada: datas inválidas (ou entrada no passado), casa sem preço (uma diária vazia
 * ou zero), noite ocupada, pacote pela metade, fim de semana pela metade ou menos noites que o mínimo.
 */
export type MotivoEstadia = 'datas' | 'preco' | 'ocupada' | 'pacote' | 'fim-de-semana' | 'minimo';

export interface ContaEstadia {
  noites: NoiteDaEstadia[];
  /** Os pacotes que a estadia leva inteiros, na ordem das datas. */
  pacotes: Pacote[];
  /** O total no cartão. */
  totalCentavos: number;
  /** O total no Pix: o desconto do Pix sobre o total. */
  totalPixCentavos: number;
  /** O sinal pago no site: metade do total (SINAL_PORCENTO), arredondada em centavos. */
  sinalCentavos: number;
  sinalPixCentavos: number;
  /** O que se paga na chegada, em pessoa (Pix, dinheiro ou cartão): o total menos o sinal. */
  chegadaCentavos: number;
  chegadaPixCentavos: number;
  /** O maior mínimo de noites entre o da casa e os dos períodos da estadia. */
  minimoNoites: number;
  ok: boolean;
  motivo?: MotivoEstadia;
  /** Motivo 'pacote': as opções do pacote que a estadia pega pela metade (o cliente leva uma delas inteira). */
  pacoteIncompleto?: Pacote[];
  /** Motivo 'fim-de-semana': as noites que faltam para fechar o fim de semana. */
  faltam?: string[];
  /** Motivo 'ocupada': as noites da estadia que já estão ocupadas. */
  ocupadas?: string[];
}

export interface OpcoesEstadia {
  /** As noites já ocupadas (reservas, bloqueios à mão e calendário de fora). */
  ocupadas?: Iterable<string>;
  /**
   * O primeiro dia em que ainda dá para entrar (AAAA-MM-DD): o servidor passa primeiraEntradaPossivel(agora), e não a
   * data de hoje pura. A entrada não pode ser antes, e a noite antes dele não conta no fim de semana (já passou ou já
   * não dá para pagar).
   */
  hoje?: string;
}

/** Uma data AAAA-MM-DD que existe no calendário. */
export function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

/**
 * O primeiro dia em que ainda dá para ENTRAR numa casa, agora, no fuso de Búzios: hoje, se ainda faltam
 * ANTECEDENCIA_MINIMA_MINUTOS (2 horas) até a entrada das 15h, como em todo pedido novo (src/lib/horarios.ts); depois
 * das 13h, amanhã. É o `hoje` que o servidor passa para contaEstadia: depois das 13h, a noite de hoje já não pode ser
 * vendida e conta como passada. Ex.: na sexta às 18h, sábado a segunda passa (a sexta ficou para trás).
 */
export function primeiraEntradaPossivel(agora: Date = new Date()): string {
  const { data, minutos } = agoraEmBuzios(agora);
  return minutos + ANTECEDENCIA_MINIMA_MINUTOS <= paraMinutos(HORA_ENTRADA_CASA) ? data : somarDias(data, 1);
}

/** O dia da semana: 0 = domingo, 5 = sexta, 6 = sábado. */
export const diaDaSemana = (data: string) => new Date(`${data}T12:00:00Z`).getUTCDay();

/** As noites de sábado e domingo têm a diária de fim de semana. */
export function noiteDeFimDeSemana(data: string): boolean {
  const d = diaDaSemana(data);
  return d === 6 || d === 0;
}

/** Quantos dias voltar de uma noite de sexta (5), sábado (6) ou domingo (0) até a sexta do mesmo fim de semana. */
const RECUO_ATE_A_SEXTA: Partial<Record<number, number>> = { 5: 0, 6: 1, 0: 2 };

/** As três noites do fim de semana (sexta, sábado e domingo) a que a noite pertence; nas outras noites, nenhuma. */
export function noitesDoFimDeSemana(data: string): string[] {
  const recuo = RECUO_ATE_A_SEXTA[diaDaSemana(data)];
  if (recuo === undefined) return [];
  const sexta = somarDias(data, -recuo);
  return [sexta, somarDias(sexta, 1), somarDias(sexta, 2)];
}

/** As noites de um pacote: da entrada até a véspera da saída. */
export const noitesDoPacote = (p: Pick<Pacote, 'entrada' | 'saida'>) => noitesEntre(p.entrada, p.saida);

/** Os pacotes em grupos (as opções do mesmo feriado juntas; o pacote sem grupo sozinho), na ordem das datas. */
export function gruposDePacotes(pacotes: readonly Pacote[]): Pacote[][] {
  const grupos = new Map<string, Pacote[]>();
  pacotes.forEach((p, i) => {
    const chave = p.grupo ? `grupo:${p.grupo}` : `pacote:${i}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), p]);
  });
  const porData = (a: Pacote, b: Pacote) => a.entrada.localeCompare(b.entrada) || a.saida.localeCompare(b.saida);
  return [...grupos.values()].map((g) => [...g].sort(porData)).sort((a, b) => porData(a[0], b[0]));
}

/**
 * Pacotes de grupos diferentes que dividem alguma noite (o painel não deve deixar gravar; o banco também recusa,
 * pela trava casas_pacotes_sem_sobreposicao). Devolve os pares, na ordem das datas.
 */
export function pacotesSobrepostos(pacotes: readonly Pacote[]): [Pacote, Pacote][] {
  const pares: [Pacote, Pacote][] = [];
  const grupos = gruposDePacotes(pacotes);
  grupos.forEach((g, i) => {
    for (const outro of grupos.slice(i + 1)) {
      for (const a of g) for (const b of outro) if (a.entrada < b.saida && b.entrada < a.saida) pares.push([a, b]);
    }
  });
  return pares;
}

const dentro = (noite: string, p: PeriodoDiaria) => noite >= p.de && noite <= p.ate;

/** Uma diária que dá para cobrar: um número de centavos maior que zero. */
const diariaValida = (centavos: number | null | undefined): boolean => typeof centavos === 'number' && centavos > 0;

/** A casa não tem preço: a diária de semana vazia ou zero, ou a de fim de semana zero (vazia é "vale a de semana"). */
export const casaSemPreco = (t: Pick<TabelaEstadia, 'diariaCentavos' | 'diariaFimDeSemanaCentavos'>): boolean =>
  !diariaValida(t.diariaCentavos) || (t.diariaFimDeSemanaCentavos != null && !diariaValida(t.diariaFimDeSemanaCentavos));

/**
 * A diária de uma noite fora de pacote: feriado; senão temporada, que no sábado e no domingo só vale se for maior que
 * a de fim de semana; senão fim de semana ou semana.
 */
function diariaForaDePacote(t: TabelaEstadia, noite: string): { diariaCentavos: number; tipo: TipoNoite } {
  const feriado = t.periodos.find((p) => p.tipo === 'feriado' && dentro(noite, p));
  if (feriado) return { diariaCentavos: feriado.diariaCentavos, tipo: 'feriado' };
  const fimDeSemana = noiteDeFimDeSemana(noite) && t.diariaFimDeSemanaCentavos != null ? t.diariaFimDeSemanaCentavos : null;
  const temporada = t.periodos.find((p) => p.tipo === 'temporada' && dentro(noite, p));
  if (temporada && (fimDeSemana === null || temporada.diariaCentavos >= fimDeSemana))
    return { diariaCentavos: temporada.diariaCentavos, tipo: 'temporada' };
  if (fimDeSemana !== null) return { diariaCentavos: fimDeSemana, tipo: 'fim-de-semana' };
  return { diariaCentavos: t.diariaCentavos, tipo: 'semana' };
}

/** Os valores de um total: no Pix (10% sobre o total), o sinal de cada forma e o que se paga na chegada. */
export function partesDaEstadia(totalCentavos: number) {
  const totalPixCentavos = precoPixCentavos(totalCentavos);
  const sinal = sinalCentavos(totalCentavos);
  const sinalPix = sinalCentavos(totalPixCentavos);
  return {
    totalCentavos,
    totalPixCentavos,
    sinalCentavos: sinal,
    sinalPixCentavos: sinalPix,
    chegadaCentavos: totalCentavos - sinal,
    chegadaPixCentavos: totalPixCentavos - sinalPix,
  };
}

/** A conta da estadia de `entrada` a `saida` (a noite da saída não conta), com as regras de cima. */
export function contaEstadia(t: TabelaEstadia, entrada: string, saida: string, opcoes: OpcoesEstadia = {}): ContaEstadia {
  const ocupadas = new Set(opcoes.ocupadas ?? []);
  const datasOk = dataValida(entrada) && dataValida(saida) && saida > entrada && (!opcoes.hoje || entrada >= opcoes.hoje);
  const datas = datasOk ? noitesEntre(entrada, saida) : [];
  const longaDemais = datas.length > MAXIMO_NOITES;

  // os pacotes: em cada grupo, as noites que a estadia pega têm de ser exatamente as de uma das opções
  const pacotes: Pacote[] = [];
  const pacoteDaNoite = new Map<string, Pacote>();
  let pacoteIncompleto: Pacote[] | undefined;
  for (const grupo of gruposDePacotes(t.pacotes)) {
    const doGrupo = new Set(grupo.flatMap(noitesDoPacote));
    const pegas = datas.filter((n) => doGrupo.has(n));
    if (!pegas.length) continue;
    const escolhido = grupo.find((p) => {
      const noites = noitesDoPacote(p);
      return noites.length === pegas.length && noites.every((n, i) => n === pegas[i]);
    });
    if (!escolhido) {
      pacoteIncompleto ??= grupo;
      continue;
    }
    pacotes.push(escolhido);
    for (const n of noitesDoPacote(escolhido)) if (!pacoteDaNoite.has(n)) pacoteDaNoite.set(n, escolhido);
  }

  const noites: NoiteDaEstadia[] = datas.map((data) => {
    const pacote = pacoteDaNoite.get(data);
    return pacote ? { data, diariaCentavos: pacote.diariaCentavos, tipo: 'pacote', pacote } : { data, ...diariaForaDePacote(t, data) };
  });

  // o fim de semana: as noites de sexta, sábado e domingo que não estão em pacote, ocupadas ou no passado andam juntas
  const emPacote = new Set(t.pacotes.flatMap(noitesDoPacote));
  const naEstadia = new Set(datas);
  const faltam = new Set<string>();
  if (t.fimDeSemanaJunto && datas.length < NOITES_LIVRES_DO_FIM_DE_SEMANA) {
    for (const n of datas) {
      if (emPacote.has(n)) continue;
      for (const f of noitesDoFimDeSemana(n)) {
        if (!naEstadia.has(f) && !emPacote.has(f) && !ocupadas.has(f) && !(opcoes.hoje && f < opcoes.hoje)) faltam.add(f);
      }
    }
  }

  const minimoNoites = Math.max(
    t.minimoNoites,
    ...datas.flatMap((n) => t.periodos.filter((p) => dentro(n, p)).map((p) => p.minimoNoites ?? 0)),
  );
  const noitesOcupadas = datas.filter((n) => ocupadas.has(n));
  // nenhuma noite sai de graça: a casa sem diária, ou um período com diária zero, fica sem preço
  const semPreco = casaSemPreco(t) || noites.some((n) => !diariaValida(n.diariaCentavos));

  const motivo: MotivoEstadia | undefined =
    !datas.length || longaDemais
      ? 'datas'
      : semPreco
        ? 'preco'
        : noitesOcupadas.length
          ? 'ocupada'
          : pacoteIncompleto
            ? 'pacote'
            : faltam.size
              ? 'fim-de-semana'
              : !pacotes.length && datas.length < minimoNoites
                ? 'minimo'
                : undefined;

  // sem datas ou sem preço, nenhum valor sai (a página nunca mostra R$ 0,00 como preço)
  const semConta = motivo === 'datas' || motivo === 'preco';
  const total = semConta ? 0 : noites.reduce((s, n) => s + n.diariaCentavos, 0);
  return {
    noites: semConta ? [] : noites,
    pacotes: semConta ? [] : pacotes,
    ...partesDaEstadia(total),
    minimoNoites,
    ok: !motivo,
    ...(motivo ? { motivo } : {}),
    ...(motivo === 'pacote' ? { pacoteIncompleto } : {}),
    ...(motivo === 'fim-de-semana' ? { faltam: [...faltam].sort() } : {}),
    ...(motivo === 'ocupada' ? { ocupadas: noitesOcupadas } : {}),
  };
}

/**
 * A menor diária da casa, em qualquer noite: o "diária a partir de" da página. Sem preço (casaSemPreco), null: a
 * página não mostra "a partir de R$ 0,00". Um período com diária zero não entra.
 */
export function menorDiariaCentavos(t: TabelaEstadia): number | null {
  if (casaSemPreco(t)) return null;
  return Math.min(
    t.diariaCentavos,
    ...(t.diariaFimDeSemanaCentavos != null ? [t.diariaFimDeSemanaCentavos] : []),
    ...t.periodos.map((p) => p.diariaCentavos).filter(diariaValida),
    ...t.pacotes.map((p) => p.diariaCentavos).filter(diariaValida),
  );
}

/** Uma opção de pacote com os valores: para as etiquetas "Pacote …" e a lista que o dono confere. */
export interface OpcaoDePacote extends ReturnType<typeof partesDaEstadia> {
  pacote: Pacote;
  noites: number;
}

/**
 * Os pacotes que ainda vão acontecer (entrada de hoje em diante), agrupados por feriado, com o total e o sinal de cada
 * opção nas duas formas de pagamento.
 */
export function pacotesComValores(t: TabelaEstadia, hoje?: string): OpcaoDePacote[][] {
  return gruposDePacotes(t.pacotes.filter((p) => !hoje || p.entrada >= hoje)).map((grupo) =>
    grupo.map((pacote) => {
      const noites = noitesDoPacote(pacote).length;
      return { pacote, noites, ...partesDaEstadia(noites * pacote.diariaCentavos) };
    }),
  );
}

import type { Texto } from '../data/passeios';
import type { Idioma } from '../i18n/config';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import {
  CAMAS,
  COMODIDADES,
  GRUPOS_COMODIDADE,
  NOMES_GRUPO_COMODIDADE,
  REGRAS_EVENTO,
  REGRAS_FUMAR,
  type GrupoComodidade,
  type IconeCasa,
  type IdComodidade,
} from '../data/comodidades.ts';
import { CANCELAMENTO_DAS_CASAS, REGRAS_DAS_CASAS, regraDeCameras, regraDeHospedes } from '../data/regras-casas.ts';
import { texto } from '../i18n/conteudo.ts';
import { contarCamas, type ComodidadeMarcada, type DetalhesCasa, type Quarto } from './casa-detalhes.ts';
import type { Ponto } from './circulo-casa.ts';
import type { PeriodoPreco } from './diarias.ts';
import type { Pacote, PeriodoDiaria, TabelaEstadia } from './estadia.ts';

/**
 * O QUE A PÁGINA DA CASA MOSTRA (Fase 4, Etapa 7, partes D, E e F), sem tocar no banco nem no navegador: a tabela da
 * conta, a linha da ficha ("14 hóspedes · 5 quartos · 9 camas · 6 banheiros"), as camas de cada quarto, as
 * comodidades em grupos, as regras e o centro do mapa. O calendário e a conta, que rodam no navegador, estão em
 * src/lib/conta-casa.ts. Os testes estão em tests/casa-pagina.test.ts.
 */

/* ------------------------------------------------------------------ */
/* A tabela da conta                                                   */

/** A casa como o site a lê (src/lib/casa.ts), só no que entra na conta da estadia. */
export interface PrecosDaCasa {
  /** A diária de semana, em reais (a coluna diaria_base_centavos). */
  diaria: number;
  minimoNoites: number;
  temporadas: PeriodoPreco[];
  feriados: PeriodoPreco[];
  detalhes: Pick<DetalhesCasa, 'diariaFimDeSemanaCentavos' | 'fimDeSemanaJunto'>;
  pacotes: Pacote[];
}

/** A tabela da conta da estadia (src/lib/estadia.ts) de uma casa do site: tudo em centavos, os períodos em ordem. */
export function tabelaDaPagina(c: PrecosDaCasa): TabelaEstadia {
  const periodo =
    (tipo: PeriodoDiaria['tipo']) =>
    (p: PeriodoPreco): PeriodoDiaria => ({
      tipo,
      nome: p.nome,
      de: p.de,
      ate: p.ate,
      diariaCentavos: Math.round(p.diaria * 100),
      ...(p.minimoNoites ? { minimoNoites: p.minimoNoites } : {}),
    });
  return {
    diariaCentavos: Math.round(c.diaria * 100),
    diariaFimDeSemanaCentavos: c.detalhes.diariaFimDeSemanaCentavos,
    minimoNoites: c.minimoNoites,
    fimDeSemanaJunto: c.detalhes.fimDeSemanaJunto,
    periodos: [...c.temporadas.map(periodo('temporada')), ...c.feriados.map(periodo('feriado'))].sort((a, b) => a.de.localeCompare(b.de)),
    // só o que a conta usa: o id do banco fica de fora (a tabela vai para o navegador)
    pacotes: c.pacotes
      .map(({ nome, entrada, saida, diariaCentavos, grupo }) => ({ nome, entrada, saida, diariaCentavos, ...(grupo ? { grupo } : {}) }))
      .sort((a, b) => a.entrada.localeCompare(b.entrada) || a.saida.localeCompare(b.saida)),
  };
}

/* ------------------------------------------------------------------ */
/* A ficha                                                             */

/** Os textos da linha da ficha, no singular e no plural ("1 hóspede", "{n} hóspedes"). */
export interface TextosFicha {
  hospede: string;
  hospedes: string;
  quarto: string;
  quartos: string;
  cama: string;
  camas: string;
  banheiro: string;
  banheiros: string;
  lavabo: string;
  lavabos: string;
  /** "{banheiros} e {lavabos}". */
  banheirosELavabos: string;
}

/**
 * A linha da ficha, em pedaços: ["14 hóspedes", "5 quartos", "9 camas", "6 banheiros"]. As camas contam o beliche como
 * duas, como o dono conta; o lavabo fica à parte ("3 banheiros e 1 lavabo", nunca "3,5 banheiros"). O que falta no
 * cadastro sai da linha.
 */
export function linhaDaFicha(
  c: { capacidade: number; quartos: number; banheiros: number; detalhes: Pick<DetalhesCasa, 'lavabos' | 'quartosDetalhe'> },
  T: TextosFicha,
): string[] {
  const contar = (um: string, varios: string, n: number) => (n > 0 ? (n === 1 ? um : varios).replace('{n}', String(n)) : '');
  const banheiros = contar(T.banheiro, T.banheiros, c.banheiros);
  const lavabos = contar(T.lavabo, T.lavabos, c.detalhes.lavabos);
  return [
    contar(T.hospede, T.hospedes, c.capacidade),
    contar(T.quarto, T.quartos, c.quartos),
    contar(T.cama, T.camas, contarCamas(c.detalhes.quartosDetalhe)),
    banheiros && lavabos ? T.banheirosELavabos.replace('{banheiros}', banheiros).replace('{lavabos}', lavabos) : banheiros || lavabos,
  ].filter(Boolean);
}

/** As camas de um quarto numa frase: "1 cama queen e 2 beliches", "1 cama queen y 2 literas", "1 queen bed and 2 bunk beds". */
export function camasDoQuarto(q: Pick<Quarto, 'camas'>, idioma: Idioma, locale: string): string {
  const partes = q.camas.map((c) => `${c.quantidade} ${texto(c.quantidade === 1 ? CAMAS[c.tipo].um : CAMAS[c.tipo].varios, idioma)}`);
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(partes);
}

/* ------------------------------------------------------------------ */
/* Comodidades                                                         */

/** Quantas comodidades aparecem antes do "ver tudo" (FASE-4, Etapa 7, parte 6). */
export const PRINCIPAIS_COMODIDADES = 10;

export interface ComodidadeDaPagina {
  id: IdComodidade;
  grupo: GrupoComodidade;
  icone: IconeCasa;
  nome: Texto;
  /** O complemento da casa ("4 vagas na garagem do condomínio"). */
  detalhe?: Texto;
}

/** As comodidades marcadas na casa, na ordem da casa, com o nome e o ícone da lista fixa. A marca "veio da foto" é só do painel. */
export const comodidadesDaPagina = (marcadas: readonly ComodidadeMarcada[]): ComodidadeDaPagina[] =>
  marcadas.map((m) => ({ id: m.id, ...COMODIDADES[m.id], ...(m.detalhe ? { detalhe: m.detalhe } : {}) }));

/** A lista completa do "ver tudo", em grupos, na ordem de GRUPOS_COMODIDADE; grupo sem item não aparece. */
export function comodidadesPorGrupo(
  lista: readonly ComodidadeDaPagina[],
): { grupo: GrupoComodidade; nome: Texto; itens: ComodidadeDaPagina[] }[] {
  return GRUPOS_COMODIDADE.map((grupo) => ({
    grupo,
    nome: NOMES_GRUPO_COMODIDADE[grupo],
    itens: lista.filter((c) => c.grupo === grupo),
  })).filter((g) => g.itens.length > 0);
}

/* ------------------------------------------------------------------ */
/* Regras, chegada e segurança, cancelamento                           */

export interface RegrasDaPagina {
  /** As regras da casa: horários, hóspedes, pet, silêncio e as regras próprias (evento, fumar). */
  casa: Texto[];
  /** Chegada e segurança: a recepção, o cadastro dos hóspedes, as escadas e as câmeras (se o dono disse). */
  chegada: Texto[];
  cancelamento: Texto[];
}

/** As três partes que abrem ao tocar. Regra própria que o dono ainda não disse (null) não vira frase. */
export function regrasDaPagina(c: { capacidade: number; detalhes: Pick<DetalhesCasa, 'regrasProprias'> }): RegrasDaPagina {
  const p = c.detalhes.regrasProprias;
  const r = REGRAS_DAS_CASAS;
  const cameras = regraDeCameras(p.cameras);
  return {
    casa: [
      r.entradaSaida,
      regraDeHospedes(c.capacidade),
      r.pet,
      r.silencio,
      ...(p.evento ? [REGRAS_EVENTO[p.evento]] : []),
      ...(p.fumar ? [REGRAS_FUMAR[p.fumar]] : []),
    ],
    chegada: [r.recepcao, r.cadastro, ...(p.escadas ? [p.escadas.texto] : []), ...(cameras ? [cameras] : [])],
    cancelamento: CANCELAMENTO_DAS_CASAS,
  };
}

/* ------------------------------------------------------------------ */
/* O mapa                                                              */

/**
 * O centro PÚBLICO do círculo, das colunas casas.centro_lat e casas.centro_lng (migração 20261113223000). Antes da
 * migração, ou enquanto o dono não marca a casa, as colunas faltam ou vêm vazias: null, e a página esconde o mapa. O
 * ponto antigo (lat_aprox, digitado à mão) nunca serve: podia ser o ponto da própria casa.
 */
export function centroDeLinha(l: { centro_lat?: number | null; centro_lng?: number | null }): Ponto | null {
  const lat = l.centro_lat;
  const lng = l.centro_lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

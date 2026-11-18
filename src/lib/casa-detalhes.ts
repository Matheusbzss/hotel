import { z } from 'zod';
import type { Texto } from '@/data/passeios';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import {
  CAMAS,
  ICONES_CASA,
  IDS_COMODIDADE,
  REGRAS_EVENTO,
  REGRAS_FUMAR,
  TIPOS_CAMA,
  type IdComodidade,
  type RegraEvento,
  type RegraFumar,
} from '../data/comodidades.ts';
import type { Json, Tables, TablesInsert } from './banco-tipos';
import { pacotesSobrepostos, type Pacote, type PeriodoDiaria, type TabelaEstadia } from './estadia.ts';
import { somarDias } from './validacao.ts';

/**
 * OS DETALHES NOVOS DE CADA CASA (Fase 4, Etapa 7, migração 20261113223000): quartos com camas, comodidades da lista
 * fixa (src/data/comodidades.ts) com a marca "veio da foto", destaques, regras próprias, texto do bairro, lavabos,
 * diária de fim de semana e pacotes de datas fixas. Aqui ficam a forma de cada dado (conferida com zod, a mesma para
 * o painel e para o script de cadastro) e a leitura das colunas do banco, sem tocar no banco: assim dá para testar
 * (tests/casa-detalhes.test.ts).
 *
 * A leitura é tolerante: uma coluna que ainda não existe (antes da migração) ou um dado fora da forma vira vazio, e a
 * página mostra só o que estiver certo.
 */

const textoCurto = (maximo: number) =>
  z.object({
    pt: z.string().min(1).max(maximo),
    es: z.string().min(1).max(maximo),
    en: z.string().min(1).max(maximo),
    'es-ar': z.string().min(1).max(maximo).optional(),
  });

/* ------------------------------------------------------------------ */
/* Quartos                                                             */

export const EsquemaQuarto = z.object({
  /** "Quarto 1". */
  nome: textoCurto(60),
  camas: z
    .array(z.object({ tipo: z.enum(TIPOS_CAMA), quantidade: z.number().int().min(1).max(10) }))
    .min(1)
    .max(6),
  /** Se o quarto tem banheiro próprio (suíte). null: o dono ainda não disse qual quarto é suíte. */
  banheiro: z.boolean().nullable(),
  /** Uma foto do próprio quarto, entre as da casa. Sem foto, a página mostra o ícone de cama (nunca a foto de outro quarto). */
  foto: z
    .string()
    .regex(/^\/fotos\/[\w./-]+$/)
    .optional(),
  /** Uma linha a mais, só com o que foi confirmado ("Vista para o mar"). */
  detalhe: textoCurto(80).optional(),
});
export type Quarto = z.infer<typeof EsquemaQuarto>;
export const EsquemaQuartos = z.array(EsquemaQuarto).max(20);

/** Quantas camas a ficha mostra (o beliche conta duas, como o dono conta). */
export const contarCamas = (quartos: readonly Quarto[]) =>
  quartos.reduce((s, q) => s + q.camas.reduce((t, c) => t + c.quantidade * CAMAS[c.tipo].camas, 0), 0);

/** Quantas pessoas dormem nas camas: é o limite de hóspedes da casa (regra do dono, 07/11). */
export const lugaresNasCamas = (quartos: readonly Quarto[]) =>
  quartos.reduce((s, q) => s + q.camas.reduce((t, c) => t + c.quantidade * CAMAS[c.tipo].lugares, 0), 0);

/** Os banheiros da ficha: o lavabo conta meio ("3,5 banheiros" = 3 banheiros e 1 lavabo). */
export const banheirosNaFicha = (banheiros: number, lavabos: number) => banheiros + lavabos / 2;

/* ------------------------------------------------------------------ */
/* Comodidades, destaques e regras próprias                            */

export const EsquemaComodidadeMarcada = z.object({
  id: z.enum(IDS_COMODIDADE as [IdComodidade, ...IdComodidade[]]),
  /** Veio das fotos (o dono autorizou em 07/11): o painel mostra a marca para ele conferir antes de publicar. */
  veioDaFoto: z.boolean(),
  /** Um complemento da casa ("4 vagas na garagem do condomínio"). */
  detalhe: textoCurto(120).optional(),
});
export type ComodidadeMarcada = z.infer<typeof EsquemaComodidadeMarcada>;
export const EsquemaComodidades = z
  .array(EsquemaComodidadeMarcada)
  .max(60)
  .refine((l) => new Set(l.map((c) => c.id)).size === l.length, 'comodidade repetida');

export const EsquemaDestaque = z.object({ icone: z.enum(ICONES_CASA), texto: textoCurto(90) });
export type Destaque = z.infer<typeof EsquemaDestaque>;
export const EsquemaDestaques = z.array(EsquemaDestaque).max(4);

export const EsquemaRegrasProprias = z.object({
  /** null: o dono ainda não disse (a página não escreve regra sobre isso). */
  evento: z.enum(Object.keys(REGRAS_EVENTO) as [RegraEvento, ...RegraEvento[]]).nullable(),
  fumar: z.enum(Object.keys(REGRAS_FUMAR) as [RegraFumar, ...RegraFumar[]]).nullable(),
  /** As escadas da casa, sem julgar se servem para idoso ou criança pequena. */
  escadas: z.object({ texto: textoCurto(120), veioDaFoto: z.boolean() }).nullable(),
  /**
   * Câmeras do lado de fora: a página tem de avisar se houver. null: o dono ainda não disse (não falar de câmeras e
   * não abrir a venda).
   */
  cameras: z.union([z.object({ tem: z.literal(false) }), z.object({ tem: z.literal(true), onde: textoCurto(160) })]).nullable(),
});
export type RegrasProprias = z.infer<typeof EsquemaRegrasProprias>;
export const REGRAS_PROPRIAS_VAZIAS: RegrasProprias = { evento: null, fumar: null, escadas: null, cameras: null };

/** O texto curto sobre o bairro ("Onde você vai estar"): 3 ou 4 frases. */
export const EsquemaTextoBairro = textoCurto(900);

/* ------------------------------------------------------------------ */
/* Pacotes                                                             */

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const EsquemaPacote = z
  .object({
    nome: textoCurto(60).refine((n) => /^Pacote /.test(n.pt), 'o nome começa com "Pacote"'),
    entrada: data,
    saida: data,
    diariaCentavos: z.number().int().positive().max(100_000_000),
    grupo: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(60)
      .optional(),
  })
  .refine((p) => p.saida > p.entrada, 'a saída vem depois da entrada');
export const EsquemaPacotes = z
  .array(EsquemaPacote)
  .refine((l) => pacotesSobrepostos(l).length === 0, 'pacotes de feriados diferentes na mesma noite');

/* ------------------------------------------------------------------ */
/* As colunas do banco                                                 */

/** Lê uma coluna conferindo a forma; se faltar ou estiver fora da forma, devolve o vazio. */
function lerOu<T>(esquema: z.ZodType<T>, valor: unknown, vazio: T): T {
  const r = esquema.safeParse(valor);
  return r.success ? r.data : vazio;
}

/** Os detalhes novos de uma linha de casas (antes da migração, as colunas não existem e tudo vem vazio). */
export interface DetalhesCasa {
  lavabos: number;
  diariaFimDeSemanaCentavos: number | null;
  fimDeSemanaJunto: boolean;
  quartosDetalhe: Quarto[];
  comodidadesMarcadas: ComodidadeMarcada[];
  destaques: Destaque[];
  regrasProprias: RegrasProprias;
  textoBairro: Texto | null;
}

export function detalhesDeLinha(c: Partial<Tables<'casas'>>): DetalhesCasa {
  return {
    lavabos: c.lavabos ?? 0,
    diariaFimDeSemanaCentavos: c.diaria_fim_de_semana_centavos ?? null,
    fimDeSemanaJunto: c.fim_de_semana_junto ?? true,
    quartosDetalhe: lerOu(EsquemaQuartos, c.quartos_detalhe, []),
    comodidadesMarcadas: lerOu(EsquemaComodidades, c.comodidades_marcadas, []),
    destaques: lerOu(EsquemaDestaques, c.destaques, []),
    regrasProprias: lerOu(EsquemaRegrasProprias, c.regras_proprias, REGRAS_PROPRIAS_VAZIAS),
    textoBairro: lerOu(EsquemaTextoBairro.nullable(), c.texto_bairro ?? null, null),
  };
}

/** Os detalhes → as colunas da tabela casas (o cadastro e, depois, o painel). */
export const colunasDosDetalhes = (d: DetalhesCasa) => ({
  lavabos: d.lavabos,
  diaria_fim_de_semana_centavos: d.diariaFimDeSemanaCentavos,
  fim_de_semana_junto: d.fimDeSemanaJunto,
  quartos_detalhe: d.quartosDetalhe as Json,
  comodidades_marcadas: d.comodidadesMarcadas as Json,
  destaques: d.destaques as Json,
  regras_proprias: d.regrasProprias as Json,
  texto_bairro: d.textoBairro as Json | null,
});

export const pacoteDeLinha = (l: Tables<'casas_pacotes'>): Pacote & { id: string } => ({
  id: l.id,
  nome: { pt: '', es: '', en: '', ...(l.nome as Partial<Texto>) },
  entrada: l.entrada,
  saida: l.saida,
  diariaCentavos: l.diaria_centavos,
  ...(l.grupo ? { grupo: l.grupo } : {}),
});

export const linhaDePacote = (casaId: string, p: Pacote): TablesInsert<'casas_pacotes'> => ({
  casa_id: casaId,
  nome: p.nome as Json,
  entrada: p.entrada,
  saida: p.saida,
  diaria_centavos: p.diariaCentavos,
  grupo: p.grupo ?? null,
});

/** Uma linha de casas_tarifas → o período da conta (no banco, o fim é o dia seguinte à última noite). */
export const periodoDeLinha = (l: Tables<'casas_tarifas'>): PeriodoDiaria => ({
  tipo: l.tipo === 'feriado' ? 'feriado' : 'temporada',
  nome: { pt: '', es: '', en: '', ...(l.nome as Partial<Texto> | null) },
  de: l.inicio,
  ate: somarDias(l.fim, -1),
  diariaCentavos: l.diaria_centavos,
  ...(l.minimo_noites !== null ? { minimoNoites: l.minimo_noites } : {}),
});

/**
 * A tabela da conta da estadia (src/lib/estadia.ts) a partir das linhas do banco. A diária de semana vazia vira 0, e a
 * conta trata 0 como casa sem preço (motivo 'preco'): nenhuma noite sai por R$ 0,00.
 */
export function tabelaDaCasa(
  c: Pick<Tables<'casas'>, 'diaria_base_centavos' | 'minimo_noites'> & Partial<Tables<'casas'>>,
  tarifas: Tables<'casas_tarifas'>[],
  pacotes: Tables<'casas_pacotes'>[],
): TabelaEstadia {
  const d = detalhesDeLinha(c);
  return {
    diariaCentavos: c.diaria_base_centavos ?? 0,
    diariaFimDeSemanaCentavos: d.diariaFimDeSemanaCentavos,
    minimoNoites: c.minimo_noites,
    fimDeSemanaJunto: d.fimDeSemanaJunto,
    periodos: tarifas.map(periodoDeLinha).sort((a, b) => a.de.localeCompare(b.de)),
    pacotes: pacotes.map(pacoteDeLinha).sort((a, b) => a.entrada.localeCompare(b.entrada)),
  };
}

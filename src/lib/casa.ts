import { z } from 'zod';
import type { Casa, CidadeCasa } from '@/data/casas';
import type { Lista, Texto } from '@/data/passeios';
import type { DetalhesCasa } from './casa-detalhes.ts';
import type { Ponto } from './circulo-casa.ts';
import { noitesEntre, type PeriodoPreco } from './diarias.ts';
import type { Pacote } from './estadia.ts';

/**
 * A casa como o painel vê: os dados da página, as tarifas, os bloqueios e o calendário do Airbnb. Aqui
 * ficam as regras do cadastro, sem tocar no banco: assim dá para testar (tests/casa.test.ts).
 */

export const CIDADES_CASA = ['buzios', 'arraial-do-cabo', 'cabo-frio'] as const satisfies readonly CidadeCasa[];

export const TIPOS_TARIFA = ['temporada', 'feriado'] as const;
export type TipoTarifa = (typeof TIPOS_TARIFA)[number];

/** Uma diária por período. As datas são da primeira e da última noite. */
export interface Tarifa extends PeriodoPreco {
  id: string;
  tipo: TipoTarifa;
}

export type OrigemBloqueio = 'site' | 'airbnb' | 'manual';

/** Um período ocupado: a data de entrada e a de saída. A noite da saída fica livre. */
export interface Bloqueio {
  id: string;
  inicio: string;
  fim: string;
  origem: OrigemBloqueio;
  /** O motivo do bloqueio manual, ou o código do evento no Airbnb. */
  referencia?: string;
}

/** O que o formulário do painel grava. */
export type DadosCasa = Omit<Casa, 'temporadas' | 'feriados'> & { icalUrl: string };

export interface CasaPainel extends Casa {
  id: string;
  ativo: boolean;
  icalUrl: string;
  /** O código do link .ics que vai para o Airbnb. */
  icalToken: string;
  icalSincronizadoEm?: string;
  icalErro?: string;
  tarifas: Tarifa[];
  bloqueios: Bloqueio[];
}

/**
 * O que a página do site usa: nada do calendário do Airbnb. Com os detalhes da Etapa 7 (vazios antes da migração
 * 20261113223000), os pacotes de datas fixas e o centro PÚBLICO do círculo do mapa (deslocado do ponto da casa, que
 * fica só no banco): o centro só é lido no servidor, para recortar a foto de satélite; nunca vai para a página.
 */
export type CasaDoSite = Casa & {
  id: string;
  detalhes: DetalhesCasa;
  pacotes: Pacote[];
  /** null enquanto o dono não marca a casa no mapa do painel: a página esconde o mapa. */
  centro: Ponto | null;
};

const CAMPOS_TEXTO = ['nome', 'local', 'resumo', 'descricao'] as const;
const CAMPOS_LISTA = ['camas', 'comodidades', 'regras', 'cancelamento'] as const;
const CAMPOS_SIMPLES = ['cidade', 'quartos', 'suites', 'banheiros', 'capacidade', 'diaria', 'minimoNoites', 'taxaLimpeza', 'caucao'] as const;
const CAMPOS_TEXTO_UNICO = ['endereco', 'checkIn', 'checkOut', 'icalUrl'] as const;

const texto = (maximo: number) => z.object({ pt: z.string().max(maximo), es: z.string().max(maximo), en: z.string().max(maximo) });
const lista = z.object({ pt: z.array(z.string().max(200)), es: z.array(z.string().max(200)), en: z.array(z.string().max(200)) });
const inteiro = (minimo: number) => z.coerce.number().int().min(minimo).max(1000);
const reais = z.coerce.number().min(0).max(1_000_000);

export const EsquemaCasa = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  cidade: z.enum(CIDADES_CASA),
  nome: texto(120).extend({ pt: z.string().min(2).max(120) }),
  local: texto(120),
  endereco: z.string().max(300),
  pontoAproximado: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }),
  resumo: texto(400),
  descricao: texto(8000),
  quartos: inteiro(1),
  suites: inteiro(0),
  banheiros: inteiro(0),
  capacidade: inteiro(1),
  camas: lista,
  comodidades: lista,
  regras: lista,
  cancelamento: lista,
  checkIn: z.string().max(20),
  checkOut: z.string().max(20),
  diaria: reais,
  minimoNoites: inteiro(1),
  taxaLimpeza: reais,
  caucao: reais,
  fotos: z.array(z.string().regex(/^\/fotos\/[\w./-]+$/)),
  icalUrl: z.union([z.literal(''), z.string().max(500).regex(/^https:\/\/\S+$/)]),
});

/** O nome de cada campo no aviso de erro do formulário. */
const ROTULOS: Record<string, string> = {
  slug: 'endereço da página',
  cidade: 'cidade',
  nome: 'nome em português',
  pontoAproximado: 'ponto no mapa',
  quartos: 'quartos',
  suites: 'suítes',
  banheiros: 'banheiros',
  capacidade: 'capacidade',
  minimoNoites: 'mínimo de noites',
  fotos: 'fotos (cada linha começa com /fotos/)',
  icalUrl: 'link do calendário do Airbnb (começa com https://)',
};

const paraLinhas = (valor: string) =>
  valor
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** "Casa da Praia de Geribá" vira "casa-da-praia-de-geriba". */
export const slugDe = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Os campos do formulário (nome.pt, comodidades.es...) viram os dados da casa, já conferidos. */
export function lerFormularioCasa(campos: Record<string, string>): { ok: true; dados: DadosCasa } | { ok: false; erro: string } {
  // o navegador manda as quebras de linha dos textos como \r\n
  const valor = (nome: string) => campos[nome]?.replace(/\r\n/g, '\n').trim() ?? '';
  const porIdioma = <T>(nome: string, ler: (v: string) => T) => ({
    pt: ler(valor(`${nome}.pt`)),
    es: ler(valor(`${nome}.es`)),
    en: ler(valor(`${nome}.en`)),
  });
  const r = EsquemaCasa.safeParse({
    slug: valor('slug') || slugDe(valor('nome.pt')),
    ...Object.fromEntries([...CAMPOS_SIMPLES, ...CAMPOS_TEXTO_UNICO].map((c) => [c, valor(c)])),
    ...Object.fromEntries(CAMPOS_TEXTO.map((c) => [c, porIdioma(c, (v) => v)])),
    ...Object.fromEntries(CAMPOS_LISTA.map((c) => [c, porIdioma(c, paraLinhas)])),
    pontoAproximado: { lat: valor('lat'), lng: valor('lng') },
    fotos: paraLinhas(valor('fotos')),
  });
  if (r.success) return { ok: true, dados: r.data };
  const campo = String(r.error.issues[0]?.path[0] ?? '');
  return { ok: false, erro: `Confira o campo: ${ROTULOS[campo] ?? campo}.` };
}

const temTexto = (t: Texto) => Boolean(t.pt && t.es && t.en);
const temLista = (l: Lista) => l.pt.length > 0 && l.es.length > 0 && l.en.length > 0;

/** O que ainda falta para a casa ir ao ar. Sem isso, a página do site sairia pela metade. */
export function faltaParaPublicar(c: CasaPainel): string[] {
  const { lat, lng } = c.pontoAproximado;
  const itens: [boolean, string][] = [
    [temTexto(c.nome), 'nome nos três idiomas'],
    [temTexto(c.local), 'praia ou bairro nos três idiomas'],
    [temTexto(c.resumo), 'resumo nos três idiomas'],
    [temTexto(c.descricao), 'descrição nos três idiomas'],
    [Boolean(c.endereco), 'endereço'],
    [lat !== 0 && lng !== 0, 'ponto no mapa'],
    [c.banheiros > 0, 'banheiros'],
    [temLista(c.camas), 'camas nos três idiomas'],
    [temLista(c.comodidades), 'comodidades nos três idiomas'],
    [temLista(c.regras), 'regras nos três idiomas'],
    [temLista(c.cancelamento), 'cancelamento nos três idiomas'],
    [Boolean(c.checkIn && c.checkOut), 'horários de check-in e check-out'],
    [c.diaria > 0, 'diária'],
    [c.fotos.length > 0, 'fotos'],
  ];
  return itens.filter(([ok]) => !ok).map(([, rotulo]) => rotulo);
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Uma diária por período, vinda do formulário do painel. */
export const EsquemaTarifa = z
  .object({
    tipo: z.enum(TIPOS_TARIFA),
    nome: texto(80).extend({ pt: z.string().min(2).max(80), es: z.string().min(2).max(80), en: z.string().min(2).max(80) }),
    de: data,
    ate: data,
    diaria: z.coerce.number().positive().max(1_000_000),
    minimoNoites: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(365).optional()),
  })
  .refine((t) => t.ate >= t.de);

/** Um bloqueio feito à mão, vindo do formulário do painel. */
export const EsquemaBloqueio = z
  .object({ inicio: data, fim: data, referencia: z.string().trim().max(200) })
  .refine((b) => b.fim > b.inicio);

/** As noites ocupadas de hoje em diante, para o calendário da página. */
export function noitesOcupadas(bloqueios: Pick<Bloqueio, 'inicio' | 'fim'>[], hoje: string): string[] {
  const noites = bloqueios.flatMap((b) => noitesEntre(b.inicio, b.fim)).filter((n) => n >= hoje);
  return [...new Set(noites)].sort();
}

/** Os períodos do Airbnb mudaram? Se não, nem precisa mexer no banco nem refazer a página. */
export function mesmosPeriodos(a: Pick<Bloqueio, 'inicio' | 'fim'>[], b: Pick<Bloqueio, 'inicio' | 'fim'>[]): boolean {
  const chaves = (lista: Pick<Bloqueio, 'inicio' | 'fim'>[]) => lista.map((p) => `${p.inicio}/${p.fim}`).sort().join();
  return chaves(a) === chaves(b);
}

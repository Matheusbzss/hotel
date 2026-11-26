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
  /** Os detalhes da Etapa 7 (quartos, comodidades, regras próprias...): o "Publicar" confere a resposta das câmeras. */
  detalhes: DetalhesCasa;
  /**
   * O centro PÚBLICO do círculo do mapa (casas.centro_lat e casas.centro_lng), que o banco calcula quando o dono marca a
   * casa no painel; null enquanto ela não está marcada. Nunca é o ponto da casa, que fica só na tabela fechada.
   */
  centro: Ponto | null;
}

/**
 * O que a página do site usa: nada do calendário do Airbnb. Com os detalhes da Etapa 7 (vazios antes da migração
 * 20261125234456), os pacotes de datas fixas e o centro PÚBLICO do círculo do mapa (deslocado do ponto da casa, que
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
// Pacote 32: sem o endereço exato e sem latitude e longitude. O ponto da casa vai pela parte "Marcar a casa no mapa"
// (lerCoordenadas, mais abaixo), que grava só na tabela fechada do banco.
const CAMPOS_TEXTO_UNICO = ['checkIn', 'checkOut', 'icalUrl'] as const;

const texto = (maximo: number) => z.object({ pt: z.string().max(maximo), es: z.string().max(maximo), en: z.string().max(maximo) });
const lista = z.object({ pt: z.array(z.string().max(200)), es: z.array(z.string().max(200)), en: z.array(z.string().max(200)) });
const inteiro = (minimo: number) => z.coerce.number().int().min(minimo).max(1000);
const reais = z.coerce.number().min(0).max(1_000_000);

export const EsquemaCasa = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  cidade: z.enum(CIDADES_CASA),
  nome: texto(120).extend({ pt: z.string().min(2).max(120) }),
  local: texto(120),
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
    fotos: paraLinhas(valor('fotos')),
  });
  if (r.success) return { ok: true, dados: r.data };
  const campo = String(r.error.issues[0]?.path[0] ?? '');
  return { ok: false, erro: `Confira o campo: ${ROTULOS[campo] ?? campo}.` };
}

const temTexto = (t: Texto) => Boolean(t.pt && t.es && t.en);
const temLista = (l: Lista) => l.pt.length > 0 && l.es.length > 0 && l.en.length > 0;

/** O que ainda falta no cadastro da casa (o formulário do painel). Sem isso, a página do site sairia pela metade. */
export function faltaNoCadastro(c: CasaPainel): string[] {
  const itens: [boolean, string][] = [
    [temTexto(c.nome), 'nome nos três idiomas'],
    [temTexto(c.local), 'praia ou bairro nos três idiomas'],
    [temTexto(c.resumo), 'resumo nos três idiomas'],
    [temTexto(c.descricao), 'descrição nos três idiomas'],
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

/** Os dois itens do "Publicar" que não estão no formulário do cadastro. */
export const FALTA_MAPA = 'casa marcada no mapa';
export const FALTA_CAMERAS = 'câmeras respondidas';

/**
 * O que ainda falta para a casa ir ao ar (Pacote 32, item 7(b) do plano do painel): o cadastro; a casa marcada no mapa
 * (o centro público do círculo existe, e só a função do banco que grava o ponto o calcula); e a resposta sobre as
 * câmeras (regras_proprias), porque a página tem de avisar se a casa tem câmera. O endereço não entra mais: o site e o
 * voucher não mostram (a localização exata vai pela equipe, no WhatsApp, depois da reserva). As câmeras não têm campo
 * no painel: a resposta vem do cadastro das casas (scripts/dados/casas.ts).
 */
export function faltaParaPublicar(c: CasaPainel): string[] {
  return [...faltaNoCadastro(c), ...(c.centro ? [] : [FALTA_MAPA]), ...(c.detalhes.regrasProprias.cameras ? [] : [FALTA_CAMERAS])];
}

/* ------------------------------------------------------------------ */
/* Marcar a casa no mapa (Pacote 32)                                    */

/**
 * A Região dos Lagos do RJ, de Saquarema a Macaé, com folga: Búzios, Cabo Frio, Arraial do Cabo e os vizinhos. O ponto
 * colado no painel tem de cair aqui; fora disso, é engano (outra casa, outro lugar, o sinal de menos esquecido).
 */
export const REGIAO_DOS_LAGOS = { latMin: -23.2, latMax: -22.3, lngMin: -42.6, lngMax: -41.6 } as const;

/** O que se lê das coordenadas coladas: o ponto, ou o motivo da recusa (o formato, ou o ponto fora da região). */
export type CoordenadasLidas = { ok: true; ponto: Ponto } | { ok: false; erro: 'formato' | 'fora' };

/** Um número de coordenada como o Google Maps mostra: o sinal, até 3 dígitos, o ponto e de 4 a 15 casas (uns 11 m ou menos). */
const NUMERO = String.raw`-?\d{1,3}\.\d{4,15}`;
const COORDENADAS = new RegExp(`^(${NUMERO})\\s*,\\s*(${NUMERO})$`);

/**
 * As coordenadas que o dono cola do Google Maps ("-22.75012, -41.88034"): a latitude e a longitude, com ponto decimal,
 * separadas por vírgula, com ou sem espaços em volta. Saem antes as marcas invisíveis que às vezes vêm junto ao copiar,
 * e o sinal de menos tipográfico vira o comum. Qualquer outra coisa é recusada: vírgula decimal, número sem as casas
 * depois do ponto (o "-23, -42" não é uma casa), graus e minutos, texto, um número só. Um ponto fora da Região dos Lagos
 * também. Nada daqui vai para o log: é o ponto exato da casa.
 */
export function lerCoordenadas(colado: string): CoordenadasLidas {
  const limpo = colado
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/\u2212/g, '-')
    .trim();
  const m = COORDENADAS.exec(limpo);
  if (!m) return { ok: false, erro: 'formato' };
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, erro: 'formato' };
  const R = REGIAO_DOS_LAGOS;
  if (lat < R.latMin || lat > R.latMax || lng < R.lngMin || lng > R.lngMax) return { ok: false, erro: 'fora' };
  return { ok: true, ponto: { lat, lng } };
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

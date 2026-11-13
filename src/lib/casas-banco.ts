import type { CidadeCasa } from '@/data/casas';
import type { Lista, Texto } from '@/data/passeios';
import type { Json, Tables, TablesInsert } from './banco-tipos';
import type { Bloqueio, CasaPainel, DadosCasa, OrigemBloqueio, Tarifa, TipoTarifa } from './casa';
import { somarDias } from './validacao.ts';

/**
 * A casa como o site usa ↔ as linhas do banco. No banco os valores ficam em centavos, e o fim da tarifa
 * é o dia seguinte à última noite, como nos bloqueios. Aqui só se traduz, sem tocar no banco: assim dá
 * para testar (tests/casa.test.ts).
 */

export type LinhaCasa = Tables<'casas'>;
export type LinhaTarifa = Tables<'casas_tarifas'>;
export type LinhaBloqueio = Tables<'casas_bloqueios'>;

const json = (v: unknown) => v as Json;
const VAZIO: Texto = { pt: '', es: '', en: '' };
const textoDe = (v: Json | null) => ({ ...VAZIO, ...(v as Partial<Texto> | null) });
const listaDe = (v: Json) => ({ pt: [], es: [], en: [], ...(v as Partial<Lista>) }) as Lista;
const emReais = (centavos: number | null) => (centavos ?? 0) / 100;
const emCentavos = (reais: number) => Math.round(reais * 100);

export const tarifaDeLinha = (l: LinhaTarifa): Tarifa => ({
  id: l.id,
  tipo: l.tipo as TipoTarifa,
  nome: textoDe(l.nome),
  de: l.inicio,
  ate: somarDias(l.fim, -1),
  diaria: emReais(l.diaria_centavos),
  ...(l.minimo_noites !== null ? { minimoNoites: l.minimo_noites } : {}),
});

export const linhaDeTarifa = (casaId: string, t: Omit<Tarifa, 'id'>): TablesInsert<'casas_tarifas'> => ({
  casa_id: casaId,
  tipo: t.tipo,
  nome: json(t.nome),
  inicio: t.de,
  fim: somarDias(t.ate, 1),
  diaria_centavos: emCentavos(t.diaria),
  minimo_noites: t.minimoNoites ?? null,
});

export const bloqueioDeLinha = (l: LinhaBloqueio): Bloqueio => ({
  id: l.id,
  inicio: l.inicio,
  fim: l.fim,
  origem: l.origem as OrigemBloqueio,
  ...(l.referencia ? { referencia: l.referencia } : {}),
});

/** Uma estadia vendida pelo site, como entra em casas_bloqueios enquanto o cliente paga (Etapa 4) e depois de pago. */
export interface BloqueioDoSite {
  casaId: string;
  /** A data de entrada (AAAA-MM-DD). */
  inicio: string;
  /** A data de saída: a noite da saída fica livre, como nas tarifas. */
  fim: string;
  /** A linha de itens_pedido da estadia (o voucher), para o bloqueio sumir com o pedido. */
  itemPedidoId: string;
}

/**
 * O bloqueio de uma estadia vendida pelo site → a linha da tabela. A referência é o id da sessão de pagamento
 * corrente na Stripe (cs_...): é por ela que o bloqueio é liberado quando a sessão vence ou o pedido é cancelado,
 * e que ele muda de sessão quando o cliente paga de novo. A trava do banco (casas_bloqueios_sem_sobreposicao_site)
 * recusa duas estadias do site na mesma data: a inserção falha com o código 23P01 e o pedido não deve ser criado.
 */
export const linhaDeBloqueioDoSite = (b: BloqueioDoSite, sessaoId: string): TablesInsert<'casas_bloqueios'> => ({
  casa_id: b.casaId,
  inicio: b.inicio,
  fim: b.fim,
  origem: 'site',
  referencia: sessaoId,
  item_pedido_id: b.itemPedidoId,
});

/**
 * As estadias de um pedido → os argumentos da função do banco prender_datas_casas (migração 20261113223000). Ela trava
 * as casas, confere TODOS os bloqueios de cada uma (reserva do site, bloqueio à mão e calendário de fora) e só então
 * grava as estadias, com a sessão de pagamento como referência; tudo ou nada. Devolve false, sem gravar nada, se alguma
 * noite já estiver ocupada. É o caminho que a reserva das casas (parte G da Etapa 7) usa no lugar da inserção direta.
 */
export const argsDePrenderDatas = (estadias: BloqueioDoSite[], sessaoId: string) => ({
  p_estadias: estadias.map((e) => ({ casa_id: e.casaId, inicio: e.inicio, fim: e.fim, item_pedido_id: e.itemPedidoId })) as Json,
  p_referencia: sessaoId,
});

export function deLinhas(c: LinhaCasa, tarifas: LinhaTarifa[], bloqueios: LinhaBloqueio[]): CasaPainel {
  const lista = tarifas.map(tarifaDeLinha).sort((a, b) => a.de.localeCompare(b.de));
  const periodos = (tipo: TipoTarifa) => lista.filter((t) => t.tipo === tipo);
  return {
    id: c.id,
    ativo: c.ativo,
    slug: c.slug,
    cidade: c.cidade as CidadeCasa,
    nome: textoDe(c.nome),
    local: textoDe(c.bairro),
    endereco: c.endereco ?? '',
    pontoAproximado: { lat: c.lat_aprox ?? 0, lng: c.lng_aprox ?? 0 },
    resumo: textoDe(c.resumo),
    descricao: textoDe(c.descricao),
    quartos: c.quartos,
    suites: c.suites ?? 0,
    banheiros: c.banheiros ?? 0,
    capacidade: c.capacidade,
    camas: listaDe(c.camas),
    comodidades: listaDe(c.comodidades),
    regras: listaDe(c.regras),
    cancelamento: listaDe(c.cancelamento),
    checkIn: c.check_in ?? '',
    checkOut: c.check_out ?? '',
    diaria: emReais(c.diaria_base_centavos),
    minimoNoites: c.minimo_noites,
    temporadas: periodos('temporada'),
    feriados: periodos('feriado'),
    taxaLimpeza: emReais(c.taxa_limpeza_centavos),
    caucao: emReais(c.caucao_centavos),
    fotos: (c.fotos as string[]) ?? [],
    icalUrl: c.ical_url ?? '',
    icalToken: c.ical_token,
    ...(c.ical_sincronizado_em ? { icalSincronizadoEm: new Date(c.ical_sincronizado_em).toISOString() } : {}),
    ...(c.ical_erro ? { icalErro: c.ical_erro } : {}),
    tarifas: lista,
    bloqueios: bloqueios.map(bloqueioDeLinha).sort((a, b) => a.inicio.localeCompare(b.inicio)),
  };
}

/** Os dados do formulário → as colunas da tabela. */
export const paraLinha = (d: DadosCasa): TablesInsert<'casas'> => ({
  slug: d.slug,
  cidade: d.cidade,
  nome: json(d.nome),
  bairro: json(d.local),
  endereco: d.endereco || null,
  lat_aprox: d.pontoAproximado.lat || null,
  lng_aprox: d.pontoAproximado.lng || null,
  resumo: json(d.resumo),
  descricao: json(d.descricao),
  quartos: d.quartos,
  suites: d.suites,
  banheiros: d.banheiros,
  capacidade: d.capacidade,
  camas: json(d.camas),
  comodidades: json(d.comodidades),
  regras: json(d.regras),
  cancelamento: json(d.cancelamento),
  check_in: d.checkIn || null,
  check_out: d.checkOut || null,
  diaria_base_centavos: emCentavos(d.diaria),
  minimo_noites: d.minimoNoites,
  taxa_limpeza_centavos: emCentavos(d.taxaLimpeza),
  caucao_centavos: emCentavos(d.caucao),
  fotos: json(d.fotos),
  ical_url: d.icalUrl || null,
});

import 'server-only';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revalidateTag, unstable_cache } from 'next/cache';
import { supabase, usarBanco } from './banco';
import type { Bloqueio, CasaDoSite, CasaPainel, DadosCasa, Tarifa } from './casa';
import { mesmosPeriodos } from './casa';
import { detalhesDeLinha, pacoteDeLinha } from './casa-detalhes';
import { centroDeLinha } from './casa-pagina';
import { bloqueioDeLinha, deLinhas, linhaDeTarifa, paraLinha, type LinhaBloqueio, type LinhaCasa, type LinhaTarifa } from './casas-banco';
import { casasDaPrevia } from './casas-previa';
import type { Ponto } from './circulo-casa';
import type { Pacote } from './estadia';
import { lerIcal } from './ical';
import { hojeEmBuzios } from './validacao';

/**
 * As casas: no banco (casas, casas_tarifas e casas_bloqueios) na Vercel; no computador, um arquivo por
 * casa em .data/casas/. O site lê pelo cache e só refaz as páginas quando uma casa muda.
 */

const PASTA = path.join(process.cwd(), '.data', 'casas');
const COMPLETA = '*, casas_tarifas(*), casas_bloqueios(*)';
/** O menu e as páginas: muda quando a casa é salva. */
const TAG_CASAS = 'casas';
/** Só as páginas das casas: muda quando o calendário muda. */
const TAG_CALENDARIO = 'casas-calendario';

type LinhaCompleta = LinhaCasa & { casas_tarifas: LinhaTarifa[]; casas_bloqueios: LinhaBloqueio[] };

const erroDoBanco = (e: { message: string }) => new Error(`Banco de dados: ${e.message}`);
const arquivoDa = (id: string) => path.join(PASTA, `${id}.json`);

/** As páginas refazem na próxima visita, já com o dado novo. */
const refazerPaginas = (tag: string) => revalidateTag(tag, { expire: 0 });

async function dosArquivos(): Promise<CasaPainel[]> {
  const nomes = await fs.readdir(PASTA).catch(() => [] as string[]);
  return Promise.all(nomes.map(async (n) => JSON.parse(await fs.readFile(path.join(PASTA, n), 'utf8')) as CasaPainel));
}

const gravarArquivo = async (c: CasaPainel) => {
  await fs.mkdir(PASTA, { recursive: true });
  await fs.writeFile(arquivoDa(c.id), JSON.stringify(c, null, 2));
};

/** Muda a casa do computador, separando as tarifas em temporadas e feriados, como no banco. */
async function mudarArquivo(id: string, mudar: (c: CasaPainel) => CasaPainel): Promise<void> {
  const atual = (await dosArquivos()).find((c) => c.id === id);
  if (!atual) return;
  const nova = mudar(atual);
  const de = (tipo: Tarifa['tipo']) => nova.tarifas.filter((t) => t.tipo === tipo);
  await gravarArquivo({ ...nova, temporadas: de('temporada'), feriados: de('feriado') });
}

/** Para o painel: todas as casas, com as tarifas e os bloqueios. */
export async function listarCasas(): Promise<CasaPainel[]> {
  if (!usarBanco()) return dosArquivos();
  const { data, error } = await supabase().from('casas').select(COMPLETA).order('criado_em');
  if (error) throw erroDoBanco(error);
  return (data as unknown as LinhaCompleta[]).map((l) => deLinhas(l, l.casas_tarifas, l.casas_bloqueios));
}

export async function obterCasaPainel(id: string): Promise<CasaPainel | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  if (!usarBanco()) return (await dosArquivos()).find((c) => c.id === id) ?? null;
  const { data, error } = await supabase().from('casas').select(COMPLETA).eq('id', id).maybeSingle();
  if (error) throw erroDoBanco(error);
  if (!data) return null;
  const l = data as unknown as LinhaCompleta;
  return deLinhas(l, l.casas_tarifas, l.casas_bloqueios);
}

/* ------------------------------------------------------------------ */
/* O site                                                              */

type ExtrasDoSite = Pick<CasaDoSite, 'detalhes' | 'pacotes' | 'centro'>;

/** O que é só do painel não entra no cache do site; os detalhes da Etapa 7, os pacotes e o centro do mapa entram. */
function paraOSite(c: CasaPainel, extras: ExtrasDoSite): CasaDoSite {
  const {
    ativo: _ativo,
    icalUrl: _icalUrl,
    icalToken: _icalToken,
    icalSincronizadoEm: _em,
    icalErro: _erro,
    tarifas: _t,
    bloqueios: _b,
    ...casa
  } = c;
  return { ...casa, ...extras };
}

/** Antes da migração 20261113223000, a tabela dos pacotes não existe (o PostgREST responde PGRST205). */
const semATabela = (e: { code?: string }) => e.code === 'PGRST205' || e.code === '42P01';

/**
 * Os pacotes de datas fixas das casas. Sem a tabela (antes da migração), nenhum pacote; qualquer outro erro do banco
 * para a página, como nas outras leituras: vender um feriado sem o pacote dele seria vender pelo preço errado.
 */
async function pacotesDoBanco(ids: string[]): Promise<Map<string, Pacote[]>> {
  const porCasa = new Map<string, Pacote[]>();
  if (!ids.length) return porCasa;
  const { data, error } = await supabase().from('casas_pacotes').select('*').in('casa_id', ids).order('entrada');
  if (error) {
    if (semATabela(error)) return porCasa;
    throw erroDoBanco(error);
  }
  for (const l of data) porCasa.set(l.casa_id, [...(porCasa.get(l.casa_id) ?? []), pacoteDeLinha(l)]);
  return porCasa;
}

/** No computador (.data/casas), o arquivo da casa pode trazer os detalhes, os pacotes e o centro; sem eles, vazios. */
function extrasDoArquivo(c: CasaPainel): ExtrasDoSite {
  const a = c as CasaPainel & Partial<ExtrasDoSite>;
  return { detalhes: { ...detalhesDeLinha({}), ...a.detalhes }, pacotes: a.pacotes ?? [], centro: a.centro ?? null };
}

const casasDoSite = unstable_cache(
  async (): Promise<CasaDoSite[]> => {
    if (!usarBanco()) return (await dosArquivos()).filter((c) => c.ativo).map((c) => paraOSite(c, extrasDoArquivo(c)));
    // com "*", as colunas da migração 20261113223000 vêm quando existem; antes dela, os detalhes ficam vazios
    const { data, error } = await supabase().from('casas').select(COMPLETA).eq('ativo', true).order('criado_em');
    if (error) throw erroDoBanco(error);
    const linhas = data as unknown as LinhaCompleta[];
    const pacotes = await pacotesDoBanco(linhas.map((l) => l.id));
    return linhas.map((l) =>
      paraOSite(deLinhas(l, l.casas_tarifas, l.casas_bloqueios), {
        detalhes: detalhesDeLinha(l),
        pacotes: pacotes.get(l.id) ?? [],
        centro: centroDeLinha(l),
      }),
    );
  },
  // a forma mudou na Etapa 7 (detalhes, pacotes e centro): com a chave nova, nada guardado antes é lido
  ['casas-do-site-etapa-7'],
  { tags: [TAG_CASAS] },
);

/** As casas no ar: o mapa do site e o Google. */
export const casasAtivas = (): Promise<CasaDoSite[]> => casasDoSite();

/** "Casas" só entra no menu, no mapa do site e no Google quando há casa no ar. */
export const casasNoAr = async () => (await casasDoSite()).length > 0;

/**
 * A lista e as páginas das casas: as que estão no ar e, só no computador com CASAS_PREVIA=1, as da prévia
 * (src/lib/casas-previa.ts). A prévia não entra no menu, no mapa do site nem no Google.
 */
export async function casasDaPagina(): Promise<CasaDoSite[]> {
  const doSite = await casasDoSite();
  const previa = casasDaPrevia().filter((p) => !doSite.some((c) => c.slug === p.casa.slug));
  return [...doSite, ...previa.map((p) => p.casa)];
}

export async function obterCasa(slug: string): Promise<CasaDoSite | undefined> {
  return (await casasDaPagina()).find((c) => c.slug === slug);
}

/** As datas ocupadas de uma casa da página (as da prévia vêm do cadastro pronto). */
export async function ocupacaoDaCasa(id: string): Promise<Pick<Bloqueio, 'inicio' | 'fim'>[]> {
  return casasDaPrevia().find((p) => p.casa.id === id)?.bloqueios ?? periodosOcupados(id);
}

/** Só as datas: o calendário da página não precisa saber de onde veio o bloqueio. */
export const periodosOcupados = unstable_cache(
  async (id: string): Promise<Pick<Bloqueio, 'inicio' | 'fim'>[]> => {
    if (!usarBanco()) return (await dosArquivos()).find((c) => c.id === id)?.bloqueios ?? [];
    const { data, error } = await supabase().from('casas_bloqueios').select('inicio, fim').eq('casa_id', id);
    if (error) throw erroDoBanco(error);
    return data;
  },
  ['casas-periodos-ocupados'],
  { tags: [TAG_CALENDARIO] },
);

/**
 * O centro PÚBLICO do círculo do mapa de uma casa no ar (casas.centro_lat e casas.centro_lng, deslocado do ponto que o
 * dono marca no painel): só o servidor lê, para recortar a foto de satélite. Sem o ponto marcado, null e nada de mapa.
 */
export async function centroDaCasa(slug: string): Promise<Ponto | null> {
  return (await casasDoSite()).find((c) => c.slug === slug)?.centro ?? null;
}

/* ------------------------------------------------------------------ */
/* O painel                                                            */

/** Toda casa nova começa fora do ar. Devolve o id, ou null se o endereço da página já existir. */
export async function criarCasa(dados: DadosCasa): Promise<string | null> {
  if (usarBanco()) {
    const { data, error } = await supabase().from('casas').insert(paraLinha(dados)).select('id').single();
    if (error?.code === '23505') return null;
    if (error) throw erroDoBanco(error);
    return data.id;
  }
  if (process.env.VERCEL) throw new Error('Banco de casas não configurado: faltam SUPABASE_URL e SUPABASE_SECRET_KEY na Vercel.');
  if ((await dosArquivos()).some((c) => c.slug === dados.slug)) return null;
  const id = randomUUID();
  await gravarArquivo({ ...dados, id, ativo: false, icalToken: randomUUID(), temporadas: [], feriados: [], tarifas: [], bloqueios: [] });
  return id;
}

/** Salva o cadastro. O endereço da página não muda depois de criado, para não quebrar os links. */
export async function atualizarCasa(id: string, dados: DadosCasa, atual: CasaPainel): Promise<void> {
  const semSlug = { ...dados, slug: atual.slug };
  if (usarBanco()) {
    const { error } = await supabase().from('casas').update(paraLinha(semSlug)).eq('id', id);
    if (error) throw erroDoBanco(error);
  } else {
    await mudarArquivo(id, (c) => ({ ...c, ...semSlug }));
  }
  if (atual.ativo) refazerPaginas(TAG_CASAS);
}

export async function publicarCasa(id: string, ativo: boolean): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase().from('casas').update({ ativo }).eq('id', id);
    if (error) throw erroDoBanco(error);
  } else {
    await mudarArquivo(id, (c) => ({ ...c, ativo }));
  }
  refazerPaginas(TAG_CASAS);
  refazerPaginas(TAG_CALENDARIO);
}

export async function criarTarifa(casa: CasaPainel, tarifa: Omit<Tarifa, 'id'>): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase().from('casas_tarifas').insert(linhaDeTarifa(casa.id, tarifa));
    if (error) throw erroDoBanco(error);
  } else {
    await mudarArquivo(casa.id, (c) => ({ ...c, tarifas: [...c.tarifas, { ...tarifa, id: randomUUID() }].sort((a, b) => a.de.localeCompare(b.de)) }));
  }
  if (casa.ativo) refazerPaginas(TAG_CASAS);
}

export async function apagarTarifa(casa: CasaPainel, tarifaId: string): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase().from('casas_tarifas').delete().eq('id', tarifaId).eq('casa_id', casa.id);
    if (error) throw erroDoBanco(error);
  } else {
    await mudarArquivo(casa.id, (c) => ({ ...c, tarifas: c.tarifas.filter((t) => t.id !== tarifaId) }));
  }
  if (casa.ativo) refazerPaginas(TAG_CASAS);
}

export async function criarBloqueio(casaId: string, b: { inicio: string; fim: string; referencia: string }): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase()
      .from('casas_bloqueios')
      .insert({ casa_id: casaId, inicio: b.inicio, fim: b.fim, origem: 'manual', referencia: b.referencia || null });
    if (error) throw erroDoBanco(error);
  } else {
    const novo: Bloqueio = { id: randomUUID(), inicio: b.inicio, fim: b.fim, origem: 'manual', ...(b.referencia ? { referencia: b.referencia } : {}) };
    await mudarArquivo(casaId, (c) => ({ ...c, bloqueios: [...c.bloqueios, novo].sort((x, y) => x.inicio.localeCompare(y.inicio)) }));
  }
  refazerPaginas(TAG_CALENDARIO);
}

/** Só o bloqueio feito à mão sai pelo painel: os outros vêm das reservas e do Airbnb. */
export async function apagarBloqueio(casaId: string, bloqueioId: string): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase().from('casas_bloqueios').delete().eq('id', bloqueioId).eq('casa_id', casaId).eq('origem', 'manual');
    if (error) throw erroDoBanco(error);
  } else {
    await mudarArquivo(casaId, (c) => ({ ...c, bloqueios: c.bloqueios.filter((b) => b.id !== bloqueioId || b.origem !== 'manual') }));
  }
  refazerPaginas(TAG_CALENDARIO);
}

/* ------------------------------------------------------------------ */
/* O calendário do Airbnb                                              */

async function registrarImportacao(id: string, resultado: { erro: string } | { em: string }): Promise<void> {
  const campos = 'erro' in resultado ? { ical_erro: resultado.erro } : { ical_erro: null, ical_sincronizado_em: resultado.em };
  if (usarBanco()) {
    const { error } = await supabase().from('casas').update(campos).eq('id', id);
    if (error) throw erroDoBanco(error);
    return;
  }
  await mudarArquivo(id, ({ icalErro: _erro, ...c }) => ({
    ...c,
    ...('erro' in resultado ? { icalErro: resultado.erro } : { icalSincronizadoEm: resultado.em }),
  }));
}

async function trocarBloqueios(id: string, periodos: { inicio: string; fim: string; referencia?: string }[]): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase().rpc('trocar_bloqueios_airbnb', { p_casa: id, p_bloqueios: periodos });
    if (error) throw erroDoBanco(error);
    return;
  }
  await mudarArquivo(id, (c) => ({
    ...c,
    bloqueios: [
      ...c.bloqueios.filter((b) => b.origem !== 'airbnb'),
      ...periodos.map((p) => ({ ...p, id: randomUUID(), origem: 'airbnb' as const })),
    ].sort((a, b) => a.inicio.localeCompare(b.inicio)),
  }));
}

/** Baixa o calendário da casa e troca os bloqueios do Airbnb. Se o link falhar, os bloqueios ficam como estão. */
export async function importarAirbnb(casa: CasaPainel): Promise<{ ok: boolean; mudou: boolean }> {
  try {
    const resposta = await fetch(casa.icalUrl, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!resposta.ok) throw new Error(`O link respondeu com o erro ${resposta.status}`);
    const hoje = hojeEmBuzios();
    const periodos = lerIcal(await resposta.text())
      .filter((e) => e.fim > hoje)
      .map((e) => ({ inicio: e.inicio, fim: e.fim, ...(e.uid ? { referencia: e.uid } : {}) }));
    const mudou = !mesmosPeriodos(
      casa.bloqueios.filter((b) => b.origem === 'airbnb' && b.fim > hoje),
      periodos,
    );
    if (mudou) await trocarBloqueios(casa.id, periodos);
    await registrarImportacao(casa.id, { em: new Date().toISOString() });
    return { ok: true, mudou };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`[casas] falha ao importar o calendário de ${casa.slug}: ${erro}`);
    await registrarImportacao(casa.id, { erro });
    return { ok: false, mudou: false };
  }
}

/** A tarefa agendada: importa o calendário de toda casa que tem o link. */
export async function importarCalendarios(): Promise<{ casas: number; falhas: number }> {
  const casas = (await listarCasas()).filter((c) => c.icalUrl);
  const resultados = await Promise.all(casas.map(importarAirbnb));
  if (resultados.some((r) => r.mudou)) refazerPaginas(TAG_CALENDARIO);
  return { casas: casas.length, falhas: resultados.filter((r) => !r.ok).length };
}

/** A importação pelo botão do painel. */
export async function importarAgora(casa: CasaPainel): Promise<boolean> {
  const { ok, mudou } = await importarAirbnb(casa);
  if (mudou) refazerPaginas(TAG_CALENDARIO);
  return ok;
}

/** O que vai no link .ics da casa: as reservas do site e os bloqueios à mão. O que veio do Airbnb não volta para ele. */
export async function periodosParaOAirbnb(token: string): Promise<{ id: string; inicio: string; fim: string }[] | null> {
  if (!/^[0-9a-f-]{36}$/.test(token)) return null;
  const hoje = hojeEmBuzios();
  if (!usarBanco()) {
    const casa = (await dosArquivos()).find((c) => c.icalToken === token);
    return casa ? casa.bloqueios.filter((b) => b.origem !== 'airbnb' && b.fim > hoje) : null;
  }
  const { data: casa, error } = await supabase().from('casas').select('id').eq('ical_token', token).maybeSingle();
  if (error) throw erroDoBanco(error);
  if (!casa) return null;
  const { data, error: erroBloqueios } = await supabase()
    .from('casas_bloqueios')
    .select('*')
    .eq('casa_id', casa.id)
    .neq('origem', 'airbnb')
    .gt('fim', hoje);
  if (erroBloqueios) throw erroDoBanco(erroBloqueios);
  return data.map(bloqueioDeLinha);
}

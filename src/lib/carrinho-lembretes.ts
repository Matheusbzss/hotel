import 'server-only';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dicionario } from '@/i18n';
import { isIdioma, type Idioma } from '@/i18n/config';
import { supabase, usarBanco } from './banco';
import type { Json } from './banco-tipos';
import type { ItemCarrinho, ItemVisivel } from './carrinho';
import { PASTA_CARRINHOS, itemVisivel, novoCodigoCarrinho, type CarrinhoGuardado, type LembretesDoCarrinho } from './carrinho-servidor';
import { cotacaoDolar } from './dolar';
import { emailLigado, enviarEmail, falhaDaConta, saiu } from './email/enviar';
import { cabecalhosDeSair, chaveDosLinks, decifrarEmail, idiomaDoLink, lerLink, linkDeSair, linkDeVoltar } from './email/links';
import { emailLembrete } from './email/mensagens';
import { formasDoCarrinho, siteDoEmail, valorNoIdioma } from './email/pedidos';
import {
  JA_COMPROU_HORAS,
  LEMBRETES_POR_DIA,
  LEMBRETE_1_DEPOIS_HORAS,
  LEMBRETE_ATE_HORAS,
  decidirLembrete,
  inicioDoDiaUtc,
  jaComprou,
  referenciaDoCarrinho,
  voltarAoCarrinho,
  type CarrinhoParaLembrete,
  type MotivoParaPular,
  type PedidoDoEmail,
} from './lembretes';
import { itensPagaveisDoCarrinho } from './reserva-publica';
import { listarReservas } from './reservas';
import { urlDoSite } from './site';

/**
 * O carrinho abandonado (Etapa 6): o agendamento (/api/carrinho/lembretes, a cada 15 minutos) manda os lembretes
 * pelas regras de src/lib/lembretes.ts; o link "voltar ao carrinho" (/api/carrinho/voltar) abre um carrinho NOVO com
 * os mesmos itens (nunca o código do carrinho que recebeu o e-mail: voltarAoCarrinho); o link "sair da lista"
 * (/api/email/sair, também no cabeçalho List-Unsubscribe) tira da lista o e-mail que recebeu o lembrete, depois da
 * confirmação na página (ou do POST do aplicativo de e-mail). O e-mail digitado num carrinho que não virou pedido é
 * apagado 90 dias depois da última mudança (apagarEmailsVencidos, no agendamento diário de /api/saude). No banco
 * (Vercel): as tabelas carrinhos, carrinhos_lembretes e emails_sem_lembrete (migrações 20261113150000 e
 * 20261113233000). No computador: os arquivos de .data/carrinhos/ e .data/emails-sem-lembrete.json. Sem RESEND_API_KEY
 * nada é lido nem enviado. Os registros do servidor só levam números e a referência curta do carrinho, nunca o e-mail.
 */

const HORA_MS = 3_600_000;
/** Quantos carrinhos o agendamento olha por vez (os mais antigos primeiro). */
const CANDIDATOS_POR_RODADA = 500;
/** O e-mail digitado num carrinho que não virou pedido fica guardado 90 dias depois da última mudança no carrinho. */
export const DIAS_DO_EMAIL_NO_CARRINHO = 90;
const ARQUIVO_SEM_LEMBRETE = path.join(process.cwd(), '.data', 'emails-sem-lembrete.json');

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));
const erroDoBanco = (e: { message: string }) => new Error(`Banco de dados: ${e.message}`);
const normalizar = (email: string) => email.trim().toLowerCase();

/** Um carrinho que pode receber o lembrete: o que as regras pedem, mais o id, o e-mail e o idioma. */
interface CarrinhoLembravel extends CarrinhoParaLembrete {
  id: string;
  email: string;
  idioma: Idioma;
  itens: ItemCarrinho[];
}

/* ------------------------------------------------------------------ */
/* Onde os lembretes ficam: no banco ou nos arquivos do computador      */

interface LinhaLembretes {
  lembrete_1_em: string | null;
  lembrete_2_em: string | null;
  veio_de: string | null;
}
const umSo = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));
const idiomaOuPadrao = (v: unknown): Idioma => (typeof v === 'string' && isIdioma(v) ? v : 'es');

/** Os arquivos de carrinho do computador, com o código do cookie (o nome do arquivo). */
async function arquivosDeCarrinho(): Promise<{ token: string; arquivo: string; c: CarrinhoGuardado }[]> {
  const nomes = (await fs.readdir(PASTA_CARRINHOS).catch(() => [] as string[])).filter((n) => n.endsWith('.json'));
  const lidos = await Promise.all(
    nomes.map(async (nome) => {
      const arquivo = path.join(PASTA_CARRINHOS, nome);
      try {
        return { token: nome.slice(0, -5), arquivo, c: JSON.parse(await fs.readFile(arquivo, 'utf8')) as CarrinhoGuardado };
      } catch {
        return null;
      }
    }),
  );
  return lidos.filter((l): l is NonNullable<typeof l> => l !== null);
}

/** Muda os lembretes de um carrinho do computador; `mudar` devolve false para não gravar nada. */
async function mudarLembretesNoArquivo(id: string, mudar: (l: LembretesDoCarrinho) => boolean): Promise<boolean> {
  const achado = (await arquivosDeCarrinho()).find((a) => a.c.id === id);
  if (!achado) return false;
  const lembretes = { ...achado.c.lembretes };
  if (!mudar(lembretes)) return false;
  await fs.writeFile(achado.arquivo, JSON.stringify({ ...achado.c, lembretes }, null, 2));
  return true;
}

/** Os carrinhos com e-mail, sem pedido, parados entre 1 hora e 3 dias: os candidatos do agendamento. */
async function candidatos(agora: Date): Promise<CarrinhoLembravel[]> {
  const ate = new Date(agora.getTime() - LEMBRETE_1_DEPOIS_HORAS * HORA_MS);
  const desde = new Date(agora.getTime() - LEMBRETE_ATE_HORAS * HORA_MS);
  if (usarBanco()) {
    const { data, error } = await supabase()
      .from('carrinhos')
      .select('id, email, idioma, itens, pedido_id, criado_em, atualizado_em, carrinhos_lembretes(lembrete_1_em, lembrete_2_em, veio_de)')
      .not('email', 'is', null)
      .is('pedido_id', null)
      .lte('atualizado_em', ate.toISOString())
      .gte('atualizado_em', desde.toISOString())
      .order('atualizado_em', { ascending: true })
      .limit(CANDIDATOS_POR_RODADA);
    if (error) throw erroDoBanco(error);
    return data.map((c) => {
      const l = umSo(c.carrinhos_lembretes as LinhaLembretes | LinhaLembretes[] | null);
      return {
        id: c.id,
        email: normalizar(c.email ?? ''),
        idioma: idiomaOuPadrao(c.idioma),
        itens: (c.itens as unknown as ItemCarrinho[]) ?? [],
        pedidoId: c.pedido_id,
        criadoEm: c.criado_em,
        atualizadoEm: c.atualizado_em,
        lembrete1Em: l?.lembrete_1_em ?? null,
        lembrete2Em: l?.lembrete_2_em ?? null,
        veioDe: l?.veio_de ?? null,
      };
    });
  }
  const lista: CarrinhoLembravel[] = [];
  for (const { arquivo, c } of await arquivosDeCarrinho()) {
    if (!c.email || c.pedidoId || !c.itens?.length) continue;
    const atualizadoEm = c.atualizadoEm ?? c.checkoutEm ?? c.criadoEm;
    if (!atualizadoEm) continue;
    const quando = Date.parse(atualizadoEm);
    if (quando > ate.getTime() || quando < desde.getTime()) continue;
    // carrinho gravado antes do id existir: ganha um agora, para o link assinado
    let id = c.id;
    if (!id) {
      id = randomUUID();
      await fs.writeFile(arquivo, JSON.stringify({ ...c, id }, null, 2));
    }
    lista.push({
      id,
      email: normalizar(c.email),
      idioma: idiomaOuPadrao(c.idioma),
      itens: c.itens,
      pedidoId: null,
      criadoEm: c.criadoEm ?? null,
      atualizadoEm,
      lembrete1Em: c.lembretes?.lembrete1Em ?? null,
      lembrete2Em: c.lembretes?.lembrete2Em ?? null,
      veioDe: c.lembretes?.veioDe ?? null,
    });
  }
  return lista.sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm)).slice(0, CANDIDATOS_POR_RODADA);
}

/** Os e-mails (já em minúsculas) que saíram da lista dos lembretes. */
async function foraDaLista(emails: string[]): Promise<Set<string>> {
  const unicos = [...new Set(emails)];
  if (!unicos.length) return new Set();
  if (usarBanco()) {
    const fora = new Set<string>();
    for (let i = 0; i < unicos.length; i += 100) {
      const { data, error } = await supabase()
        .from('emails_sem_lembrete')
        .select('email')
        .in('email', unicos.slice(i, i + 100));
      if (error) throw erroDoBanco(error);
      for (const linha of data) fora.add(linha.email);
    }
    return fora;
  }
  return new Set(await listaLocal());
}

/**
 * Os pedidos (menos os cancelados) com estes e-mails, feitos a partir de `desde`: é com eles que a regra jaComprou
 * (src/lib/lembretes.ts) vê quem já comprou por outro carrinho. O pedido grava o e-mail em minúsculas (POST /api/pedido),
 * e a busca é pelo e-mail exato, em minúsculas.
 */
async function pedidosDosEmails(emails: string[], desde: Date): Promise<PedidoDoEmail[]> {
  const unicos = [...new Set(emails)];
  if (!unicos.length) return [];
  if (usarBanco()) {
    const lista: PedidoDoEmail[] = [];
    for (let i = 0; i < unicos.length; i += 100) {
      const { data, error } = await supabase()
        .from('pedidos')
        .select('cliente_email, criado_em, status')
        .in('cliente_email', unicos.slice(i, i + 100))
        .neq('status', 'cancelado')
        .gte('criado_em', desde.toISOString());
      if (error) throw erroDoBanco(error);
      for (const p of data) lista.push({ email: p.cliente_email, criadoEm: p.criado_em, status: p.status });
    }
    return lista;
  }
  const alvo = new Set(unicos);
  return (await listarReservas())
    .filter((r) => alvo.has(normalizar(r.cliente.email)) && Date.parse(r.criadaEm) >= desde.getTime())
    .map((r) => ({ email: r.cliente.email, criadoEm: r.criadaEm, status: r.status }));
}

async function listaLocal(): Promise<string[]> {
  try {
    return JSON.parse(await fs.readFile(ARQUIVO_SEM_LEMBRETE, 'utf8')) as string[];
  } catch {
    return [];
  }
}

/** Quantos lembretes já saíram hoje (o dia do Resend, em UTC). */
async function enviadosHoje(agora: Date): Promise<number> {
  const inicio = inicioDoDiaUtc(agora);
  if (usarBanco()) {
    const contar = (coluna: 'lembrete_1_em' | 'lembrete_2_em') =>
      supabase().from('carrinhos_lembretes').select('carrinho_id', { count: 'exact', head: true }).gte(coluna, inicio);
    const [um, dois] = await Promise.all([contar('lembrete_1_em'), contar('lembrete_2_em')]);
    if (um.error) throw erroDoBanco(um.error);
    if (dois.error) throw erroDoBanco(dois.error);
    return (um.count ?? 0) + (dois.count ?? 0);
  }
  return (await arquivosDeCarrinho()).reduce(
    (soma, { c }) => soma + [c.lembretes?.lembrete1Em, c.lembretes?.lembrete2Em].filter((em) => em && em >= inicio).length,
    0,
  );
}

/**
 * Reserva o lembrete `n` deste carrinho ANTES de enviar: de duas rodadas ao mesmo tempo, só uma consegue (a gravação
 * só vale com a coluna ainda vazia). Devolve se conseguiu.
 */
async function marcarLembrete(id: string, n: 1 | 2, agora: Date): Promise<boolean> {
  const em = agora.toISOString();
  if (usarBanco()) {
    const criada = await supabase()
      .from('carrinhos_lembretes')
      .upsert({ carrinho_id: id }, { onConflict: 'carrinho_id', ignoreDuplicates: true });
    if (criada.error) throw erroDoBanco(criada.error);
    const coluna = n === 1 ? 'lembrete_1_em' : 'lembrete_2_em';
    const { data, error } = await supabase()
      .from('carrinhos_lembretes')
      .update(n === 1 ? { lembrete_1_em: em } : { lembrete_2_em: em })
      .eq('carrinho_id', id)
      .is(coluna, null)
      .select('carrinho_id');
    if (error) throw erroDoBanco(error);
    return data.length === 1;
  }
  return mudarLembretesNoArquivo(id, (l) => {
    const campo = n === 1 ? 'lembrete1Em' : 'lembrete2Em';
    if (l[campo]) return false;
    l[campo] = em;
    return true;
  });
}

/** Desfaz a reserva do lembrete que não saiu (falha passageira): a próxima rodada tenta de novo. */
async function desmarcarLembrete(id: string, n: 1 | 2): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase()
      .from('carrinhos_lembretes')
      .update(n === 1 ? { lembrete_1_em: null } : { lembrete_2_em: null })
      .eq('carrinho_id', id);
    if (error) throw erroDoBanco(error);
    return;
  }
  await mudarLembretesNoArquivo(id, (l) => {
    delete l[n === 1 ? 'lembrete1Em' : 'lembrete2Em'];
    return true;
  });
}

/** O carrinho pelo id do link: o código do cookie, o e-mail, os itens e o pedido que ele virou. */
async function carrinhoPorId(
  id: string,
): Promise<{ token: string; email: string | null; itens: ItemCarrinho[]; pedidoId: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (usarBanco()) {
    const { data, error } = await supabase().from('carrinhos').select('token, email, itens, pedido_id').eq('id', id).maybeSingle();
    if (error) throw erroDoBanco(error);
    return data
      ? { token: data.token, email: data.email, itens: (data.itens as unknown as ItemCarrinho[]) ?? [], pedidoId: data.pedido_id }
      : null;
  }
  const achado = (await arquivosDeCarrinho()).find((a) => a.c.id === id);
  return achado
    ? { token: achado.token, email: achado.c.email ?? null, itens: achado.c.itens ?? [], pedidoId: achado.c.pedidoId ?? null }
    : null;
}

/**
 * Entre os carrinhos `ids`, os que têm uma cópia (aberta pelo link "voltar ao carrinho") que já virou pedido: o cliente
 * voltou pelo lembrete e comprou na cópia, então o carrinho de origem também virou pedido.
 */
async function copiasQueViraramPedido(ids: string[]): Promise<Set<string>> {
  const unicos = [...new Set(ids)];
  const viraram = new Set<string>();
  if (!unicos.length) return viraram;
  if (usarBanco()) {
    for (let i = 0; i < unicos.length; i += 100) {
      const { data, error } = await supabase()
        .from('carrinhos_lembretes')
        .select('carrinho_id, veio_de')
        .in('veio_de', unicos.slice(i, i + 100));
      if (error) throw erroDoBanco(error);
      const origemDaCopia = new Map(data.map((l) => [l.carrinho_id, l.veio_de as string]));
      if (!origemDaCopia.size) continue;
      const comPedido = await supabase()
        .from('carrinhos')
        .select('id')
        .in('id', [...origemDaCopia.keys()])
        .not('pedido_id', 'is', null);
      if (comPedido.error) throw erroDoBanco(comPedido.error);
      for (const { id } of comPedido.data) viraram.add(origemDaCopia.get(id) as string);
    }
    return viraram;
  }
  const alvo = new Set(unicos);
  for (const { c } of await arquivosDeCarrinho()) {
    const origem = c.lembretes?.veioDe;
    if (origem && alvo.has(origem) && c.pedidoId) viraram.add(origem);
  }
  return viraram;
}

/** Alguma cópia aberta por uma volta anterior deste carrinho já virou pedido. */
const copiaVirouPedido = async (id: string): Promise<boolean> => (await copiasQueViraramPedido([id])).has(id);

/**
 * Cria a cópia do carrinho para quem voltou pelo link: um carrinho NOVO, com código próprio, só com os itens (sem
 * e-mail, sem pedido, sem a campanha de origem), ligado ao de origem (veio_de) para as estatísticas e para nunca
 * receber lembrete. Devolve o código do cookie da cópia.
 */
async function criarCopia(itens: ItemCarrinho[], origem: string, idioma: Idioma): Promise<string> {
  const token = novoCodigoCarrinho();
  if (usarBanco()) {
    const { data, error } = await supabase()
      .from('carrinhos')
      .insert({ token, itens: itens as unknown as Json, idioma })
      .select('id')
      .single();
    if (error) throw erroDoBanco(error);
    const ligada = await supabase().from('carrinhos_lembretes').insert({ carrinho_id: data.id, veio_de: origem });
    // a cópia já existe e vale: sem a ligação, ela não entra junto com a de origem nas estatísticas (e, se o cliente
    // digitar o e-mail nela, pode receber lembrete)
    if (ligada.error) console.error(`[lembretes] a cópia de ${referenciaDoCarrinho(origem)} ficou sem a ligação: ${ligada.error.message}`);
    return token;
  }
  const agora = new Date().toISOString();
  await fs.mkdir(PASTA_CARRINHOS, { recursive: true });
  await fs.writeFile(
    path.join(PASTA_CARRINHOS, `${token}.json`),
    JSON.stringify({ id: randomUUID(), idioma, itens, criadoEm: agora, atualizadoEm: agora, lembretes: { veioDe: origem } }, null, 2),
  );
  return token;
}

/** Guarda a primeira volta do cliente pelo link do e-mail (as outras não mudam nada). */
async function registrarVolta(id: string, n: 1 | 2, agora: Date): Promise<void> {
  const em = agora.toISOString();
  if (usarBanco()) {
    const criada = await supabase()
      .from('carrinhos_lembretes')
      .upsert({ carrinho_id: id }, { onConflict: 'carrinho_id', ignoreDuplicates: true });
    if (criada.error) throw erroDoBanco(criada.error);
    const { error } = await supabase()
      .from('carrinhos_lembretes')
      .update({ voltou_em: em, voltou_lembrete: n })
      .eq('carrinho_id', id)
      .is('voltou_em', null);
    if (error) throw erroDoBanco(error);
    return;
  }
  await mudarLembretesNoArquivo(id, (l) => {
    if (l.voltouEm) return false;
    l.voltouEm = em;
    l.voltouLembrete = n;
    return true;
  });
}

/** Põe o e-mail na lista de quem não quer lembretes (uma vez só). */
async function tirarDaLista(email: string): Promise<void> {
  const limpo = normalizar(email);
  if (usarBanco()) {
    const { error } = await supabase()
      .from('emails_sem_lembrete')
      .upsert({ email: limpo }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw erroDoBanco(error);
    return;
  }
  const lista = await listaLocal();
  if (lista.includes(limpo)) return;
  await fs.mkdir(path.dirname(ARQUIVO_SEM_LEMBRETE), { recursive: true });
  await fs.writeFile(ARQUIVO_SEM_LEMBRETE, JSON.stringify([...lista, limpo], null, 2));
}

/* ------------------------------------------------------------------ */
/* O agendamento                                                       */

export type MotivoDoResumo = MotivoParaPular | 'limite-do-dia' | 'item-fora-do-site' | 'outro-envio' | 'nao-saiu' | 'fim-do-tempo';

/** Quanto tempo uma rodada envia (a rota tem 60 s; sobra folga para responder). */
const TEMPO_DA_RODADA_MS = 40_000;

export interface ResumoDosLembretes {
  ok: boolean;
  /** Sem RESEND_API_KEY: nada foi lido nem enviado. */
  desligado?: true;
  erro?: string;
  candidatos: number;
  enviados: { primeiro: number; segundo: number };
  pulados: Partial<Record<MotivoDoResumo, number>>;
}

/**
 * Uma rodada do agendamento: olha os carrinhos parados, decide quem recebe o lembrete (src/lib/lembretes.ts), reserva
 * o lembrete, envia e, se não saiu, desfaz a reserva para a próxima rodada. Para quando chega a LEMBRETES_POR_DIA ou
 * quando a cota do Resend (ou a do dia, guardada para os e-mails essenciais) acaba.
 */
export async function enviarLembretes(agora: Date = new Date()): Promise<ResumoDosLembretes> {
  const resumo: ResumoDosLembretes = { ok: true, candidatos: 0, enviados: { primeiro: 0, segundo: 0 }, pulados: {} };
  if (!emailLigado()) {
    console.log('[email] desligado (sem RESEND_API_KEY): lembretes do carrinho');
    return { ...resumo, desligado: true };
  }
  const chave = chaveDosLinks();
  if (!chave) return { ...resumo, ok: false, erro: 'sem CRON_SECRET para assinar os links' };
  const pular = (motivo: MotivoDoResumo) => {
    resumo.pulados[motivo] = (resumo.pulados[motivo] ?? 0) + 1;
  };

  try {
    const lista = await candidatos(agora);
    resumo.candidatos = lista.length;
    if (!lista.length) return resumo;
    const emails = lista.map((c) => c.email);
    const fora = await foraDaLista(emails);
    // quem já comprou por outro carrinho: os pedidos desde o carrinho mais antigo da lista (ou das últimas 72 horas)
    const desde = new Date(
      Math.min(agora.getTime() - JA_COMPROU_HORAS * HORA_MS, ...lista.map((c) => Date.parse(c.criadoEm ?? '') || Number.POSITIVE_INFINITY)),
    );
    const pedidos = await pedidosDosEmails(emails, desde);
    // quem voltou pelo link do lembrete e comprou na cópia (a volta sozinha não para o segundo lembrete)
    const compraramNaCopia = await copiasQueViraramPedido(lista.map((c) => c.id));
    let hoje = await enviadosHoje(agora);
    const site = siteDoEmail();
    const taxas = new Map<Idioma, number | null>();
    // a função do agendamento vive 60 s (maxDuration da rota): o que não couber fica para a próxima rodada
    const fimDaRodada = Date.now() + TEMPO_DA_RODADA_MS;

    for (const c of lista) {
      if (Date.now() > fimDaRodada) {
        pular('fim-do-tempo');
        break;
      }
      const decisao = decidirLembrete(c, agora, {
        descadastrado: fora.has(c.email),
        jaComprou: jaComprou(c.email, c.criadoEm, pedidos, agora),
        copiaVirouPedido: compraramNaCopia.has(c.id),
      });
      if ('pular' in decisao) {
        pular(decisao.pular);
        continue;
      }
      if (hoje >= LEMBRETES_POR_DIA) {
        pular('limite-do-dia');
        continue;
      }
      // cada item precisa valer como está no site agora (o passeio existe, a hora ainda é oferecida)
      const d = dicionario(c.idioma);
      const visiveis = c.itens.map((i) => itemVisivel(i, c.idioma, d, agora));
      if (visiveis.some((v) => v === null)) {
        pular('item-fora-do-site');
        continue;
      }
      const n = decisao.lembrete;
      if (!(await marcarLembrete(c.id, n, agora))) {
        pular('outro-envio');
        continue;
      }

      if (!taxas.has(c.idioma)) taxas.set(c.idioma, c.idioma === 'pt' ? null : await cotacaoDolar().catch(() => null));
      const taxa = taxas.get(c.idioma) ?? null;
      const itens = visiveis as ItemVisivel[];
      // o preço só das formas que o checkout ofereceria agora: o Pix some fora do prazo ou acima do limite dele
      const formas = await formasDoCarrinho(itensPagaveisDoCarrinho(itens), agora);
      const comPix = formas.includes('pix');
      const comCartao = formas.includes('cartao');
      const totalPix = itens.reduce((s, i) => s + i.totalPixCentavos, 0);
      const totalCartao = itens.reduce((s, i) => s + i.totalCentavos, 0);
      const sair = `${urlDoSite()}/api/email/sair?t=${linkDeSair(c.id, c.idioma, chave, c.email)}`;
      const voltar = `${urlDoSite()}/api/carrinho/voltar?t=${linkDeVoltar(c.id, c.idioma, n, chave, agora)}`;
      const mensagemDoEmail = emailLembrete({
        idioma: c.idioma,
        n,
        itens: itens.map((i) => ({
          nome: i.titulo,
          linhas: i.detalhes,
          ...(comPix ? { pix: valorNoIdioma(i.totalPixCentavos, c.idioma, taxa) } : {}),
          ...(comCartao ? { cartao: valorNoIdioma(i.totalCentavos, c.idioma, taxa) } : {}),
        })),
        totais: {
          ...(comPix ? { pix: valorNoIdioma(totalPix, c.idioma, taxa) } : {}),
          ...(comCartao ? { cartao: valorNoIdioma(totalCartao, c.idioma, taxa) } : {}),
        },
        linkVoltar: voltar,
        linkSair: sair,
        site,
      });
      const resultado = await enviarEmail({
        tipo: n === 1 ? 'lembrete-1' : 'lembrete-2',
        referencia: referenciaDoCarrinho(c.id),
        para: c.email,
        assunto: mensagemDoEmail.assunto,
        html: mensagemDoEmail.html,
        texto: mensagemDoEmail.texto,
        // o "cancelar inscrição" do próprio aplicativo de e-mail, num toque (RFC 8058)
        cabecalhos: cabecalhosDeSair(sair),
        chave: `lembrete-${n}/${c.id}`,
      });
      if (saiu(resultado)) {
        if (n === 1) resumo.enviados.primeiro++;
        else resumo.enviados.segundo++;
        hoje++;
        continue;
      }
      pular('nao-saiu');
      if (!falhaDaConta(resultado)) {
        // o Resend recusou ESTE e-mail (o endereço não presta): o lembrete fica marcado, para não tentar para sempre
        continue;
      }
      // sem cota, o Resend fora do ar ou a chave/domínio com problema: a reserva volta e a próxima rodada tenta de novo
      await desmarcarLembrete(c.id, n).catch((e) => console.error(`[lembretes] ${referenciaDoCarrinho(c.id)}: ${mensagem(e)}`));
      break;
    }
    return resumo;
  } catch (e) {
    return { ...resumo, ok: false, erro: mensagem(e) };
  }
}

/* ------------------------------------------------------------------ */
/* Os links do e-mail                                                  */

/**
 * O link "voltar ao carrinho": confere a assinatura e segue a regra de voltarAoCarrinho (src/lib/lembretes.ts). O
 * cookie que volta é SEMPRE o de um carrinho novo, a cópia dos itens: o código do carrinho que recebeu o e-mail nunca
 * sai daqui. O carrinho que já virou pedido manda para "Consultar meu pedido"; o link que não vale, o carrinho vazio ou
 * que sumiu, para o checkout sem cookie.
 */
export async function abrirCarrinhoDoLembrete(
  token: string | null,
  agora: Date = new Date(),
): Promise<{ idioma: Idioma; destino: 'checkout' | 'consultar'; cookie?: string }> {
  const chave = chaveDosLinks();
  const dados = chave ? lerLink(token, 'voltar', chave, agora) : null;
  if (!dados) return { idioma: idiomaDoLink(token), destino: 'checkout' };
  const volta = await voltarAoCarrinho(dados.c, {
    carrinho: carrinhoPorId,
    copiaVirouPedido,
    criarCopia: (itens, origem) => criarCopia(itens, origem, dados.i),
    registrarVolta: (id) =>
      registrarVolta(id, dados.n ?? 1, agora).catch((e) =>
        console.error(`[lembretes] a volta de ${referenciaDoCarrinho(id)} não ficou guardada: ${mensagem(e)}`),
      ),
  });
  return volta.destino === 'checkout' ? { idioma: dados.i, ...volta } : { idioma: dados.i, destino: 'consultar' };
}

/**
 * Confere o link de sair da lista sem mudar nada: é o que o GET faz antes de mostrar a página que pede a confirmação
 * (os filtros de e-mail que abrem os links sozinhos não tiram ninguém da lista).
 */
export function conferirLinkDeSair(token: string | null): { ok: boolean; idioma: Idioma } {
  const chave = chaveDosLinks();
  const dados = chave ? lerLink(token, 'sair', chave) : null;
  return dados ? { ok: true, idioma: dados.i } : { ok: false, idioma: idiomaDoLink(token) };
}

/**
 * O link "sair da lista", já confirmado (o botão da página ou o POST do aplicativo de e-mail): tira da lista o e-mail
 * que recebeu o lembrete, que vai cifrado no link. O link sem ele (de antes) usa o e-mail que o carrinho tem agora.
 */
export async function sairDaListaPeloLink(token: string | null): Promise<{ ok: boolean; idioma: Idioma }> {
  const chave = chaveDosLinks();
  const dados = chave ? lerLink(token, 'sair', chave) : null;
  if (!chave || !dados) return { ok: false, idioma: idiomaDoLink(token) };
  const email = dados.e ? decifrarEmail(dados.e, chave) : ((await carrinhoPorId(dados.c))?.email ?? null);
  if (!email) return { ok: false, idioma: dados.i };
  await tirarDaLista(email);
  console.log(`[lembretes] ${referenciaDoCarrinho(dados.c)}: saiu da lista`);
  return { ok: true, idioma: dados.i };
}

/* ------------------------------------------------------------------ */
/* A guarda do e-mail no carrinho (a política de privacidade)          */

/**
 * Apaga o e-mail dos carrinhos que não viraram pedido e estão parados há mais de 90 dias (DIAS_DO_EMAIL_NO_CARRINHO), no
 * banco e nos arquivos do computador: é o prazo que a política de privacidade promete. Os itens ficam (o funil das
 * estatísticas conta os carrinhos); a lista de quem saiu dos lembretes também (só o e-mail, para não mandar outro).
 * Roda no agendamento diário de /api/saude. Devolve quantos e-mails saíram.
 */
export async function apagarEmailsVencidos(agora: Date = new Date()): Promise<number> {
  const corte = new Date(agora.getTime() - DIAS_DO_EMAIL_NO_CARRINHO * 86_400_000).toISOString();
  if (usarBanco()) {
    const { data, error } = await supabase()
      .from('carrinhos')
      .update({ email: null })
      .is('pedido_id', null)
      .not('email', 'is', null)
      .lt('atualizado_em', corte)
      .select('id');
    if (error) throw erroDoBanco(error);
    return data.length;
  }
  let apagados = 0;
  for (const { arquivo, c } of await arquivosDeCarrinho()) {
    const quando = c.atualizadoEm ?? c.checkoutEm ?? c.criadoEm;
    if (!c.email || c.pedidoId || !quando || quando >= corte) continue;
    const { email: _email, ...semEmail } = c;
    await fs.writeFile(arquivo, JSON.stringify(semEmail, null, 2));
    apagados++;
  }
  return apagados;
}

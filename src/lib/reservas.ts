import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BlobPreconditionFailedError, del, get, head, list, put } from '@vercel/blob';
import type { IdLugar, Malas, Veiculo } from '@/data/transfer';
import type { Idioma } from '@/i18n/config';
import { supabase, supabaseConfigurado } from './banco';
import { codigoValido, gerarCodigo, gerarToken } from './codigo-reserva';
import { deLinhas, paraLinhas, type EventoHistorico, type LinhaItem, type LinhaPedido } from './reservas-banco';
import type { CidadeHospedagem } from './validacao';

/**
 * Banco de reservas.
 * - Na Vercel: o banco de dados (Supabase, src/lib/banco.ts). Cada reserva é um item de um pedido (o
 *   voucher), com o histórico do pedido; o pedido do carrinho tem vários itens e um pagamento só, e o status
 *   vale para todos. As reservas de antes continuam no Vercel Blob (reservas/<VOUCHER>.json), como
 *   cópia de segurança: uma reserva que ainda não estiver no banco é lida de lá e, se alguém mexer nela,
 *   vem para o banco antes. Nada é apagado do Blob.
 * - No computador (npm run dev): arquivos em .data/reservas/, um por voucher (ali, o status muda voucher
 *   a voucher). Com RESERVAS_NO_BANCO=1 no comando, usa o banco de verdade (para testar), e os arquivos
 *   fazem o papel do Blob.
 */

export type StatusReserva = 'pendente' | 'pago' | 'recusado' | 'cancelado' | 'expirado' | 'aguardando_whatsapp' | 'reembolsado';

export type MetodoPagamento = 'pix' | 'cartao' | 'whatsapp';

/** O que toda reserva tem, de passeio ou de transfer. */
interface ReservaBase {
  codigo: string;
  token: string;
  criadaEm: string;
  atualizadaEm: string;
  idioma: Idioma;
  status: StatusReserva;
  /** A data do passeio, ou a da ida do transfer (AAAA-MM-DD). */
  data: string;
  totalCentavos: number;
  /**
   * O total no Pix (com o desconto), nas reservas que terminam pelo WhatsApp: a forma de pagamento ainda
   * não está escolhida, e a equipe cobra este valor no Pix ou o `totalCentavos` no cartão.
   */
  totalPixCentavos?: number;
  /** Só no voucher de um pedido do carrinho com vários itens: aqui, os totais acima são os deste item. */
  pedido?: { codigo: string; totalCentavos: number; totalPixCentavos?: number };
  cliente: { nome: string; email: string; telefone: string };
  observacoes?: string;
  pagamento: {
    metodo: MetodoPagamento;
    pedidoId?: string;
    pixCopiaECola?: string;
    pixExpiraEm?: string;
    cartaoFinal?: string;
    cartaoBandeira?: string;
    motivo?: string;
    pagoEm?: string;
    ultimaConsulta?: string;
  };
  historico: { em: string; evento: string }[];
}

export interface ReservaPasseio extends ReservaBase {
  /** As reservas feitas antes do transfer não têm o tipo: são todas de passeio. */
  tipo?: 'passeio';
  passeio: {
    slug: string;
    nome: string;
    cidade: string;
    unidade: 'pessoa' | 'veiculo' | 'embarcacao';
    /** Opção escolhida (ex.: lancha 2 horas), quando o passeio tem opções. */
    opcao?: { id: string; nome: string };
  };
  /**
   * A hora escolhida no checkout ("HH:MM") e se ela é a da busca na hospedagem ou a da saída.
   * As reservas feitas antes da escolha de horário não têm este campo.
   */
  horario?: { hora: string; busca: boolean };
  /** Adultos e crianças que pagam inteira. */
  adultos: number;
  /** Total de crianças com desconto (meia + grátis). */
  criancas: number;
  criancasMeia?: number;
  criancasGratis?: number;
  unidades: number;
  /** O documento não vem nas reservas do carrinho, que pedem só nome, e-mail e WhatsApp. */
  cliente: ReservaBase['cliente'] & { documentoTipo?: 'cpf' | 'passaporte'; documento?: string };
  hospedagem: { cidade: CidadeHospedagem; hotel: string };
  /** O cliente pegou pela sugestão do carrinho. */
  sugestao?: boolean;
}

/** Uma ponta do trecho: o lugar da lista e, fora dos aeroportos, o hotel, a pousada ou o endereço. */
export interface PontaTransfer {
  lugar: IdLugar;
  endereco?: string;
}

export interface TrechoTransfer {
  saida: PontaTransfer;
  destino: PontaTransfer;
  /** AAAA-MM-DD e HH:MM. */
  data: string;
  hora: string;
  /** O número do voo, quando o trecho sai de um aeroporto ou vai para um (opcional). */
  voo?: string;
  precoCentavos: number;
}

export interface ReservaTransfer extends ReservaBase {
  tipo: 'transfer';
  transfer: {
    veiculo: Veiculo;
    ida: TrechoTransfer;
    volta?: TrechoTransfer;
    passageiros: number;
    malas: Malas;
    /** A idade de cada criança que vai de cadeirinha ou assento de elevação. */
    cadeirinhas: number[];
  };
}

export type Reserva = ReservaPasseio | ReservaTransfer;

export const ehTransfer = (r: Reserva): r is ReservaTransfer => r.tipo === 'transfer';

export { codigoValido, gerarCodigo, gerarToken };

/* ------------------------------------------------------------------ */

interface Armazenamento {
  ler(codigo: string): Promise<{ reserva: Reserva; versao?: string } | null>;
  /** Cria a reserva; retorna false se o código já existir. */
  criar(reserva: Reserva): Promise<boolean>;
  /** Cria os vouchers de um pedido de uma vez; retorna o id do pedido, ou null se algum código já existir. */
  criarPedido(reservas: Reserva[]): Promise<string | null>;
  /** Os vouchers de um pedido com vários itens (nenhum, se o pedido não existir). */
  lerPedido(codigo: string): Promise<Reserva[]>;
  /** Grava por cima, desde que a versão não tenha mudado (quando informada). */
  gravar(reserva: Reserva, versao?: string): Promise<boolean>;
  listar(): Promise<Reserva[]>;
}

const caminhoBlob = (codigo: string) => `reservas/${codigo}.json`;

/** Sem o banco, cada voucher é um arquivo à parte, e o pedido é o código que eles guardam. */
const umArquivoPorVoucher = (a: Pick<Armazenamento, 'criar' | 'listar'>): Pick<Armazenamento, 'criarPedido' | 'lerPedido'> => ({
  async criarPedido(reservas) {
    for (const r of reservas) if (!(await a.criar(r))) return null;
    return reservas[0].pedido?.codigo ?? reservas[0].codigo;
  },
  async lerPedido(codigo) {
    return (await a.listar()).filter((r) => r.pedido?.codigo === codigo);
  },
});

const blob: Armazenamento = {
  async ler(codigo) {
    const r = await get(caminhoBlob(codigo), { access: 'private', useCache: false });
    if (!r || !r.stream) return null;
    const texto = await new Response(r.stream).text();
    return { reserva: JSON.parse(texto) as Reserva, versao: r.blob.etag };
  },
  async criar(reserva) {
    try {
      await put(caminhoBlob(reserva.codigo), JSON.stringify(reserva), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
      });
      return true;
    } catch (e) {
      const existe = await head(caminhoBlob(reserva.codigo)).catch(() => null);
      if (existe) return false;
      throw e;
    }
  },
  async gravar(reserva, versao) {
    try {
      await put(caminhoBlob(reserva.codigo), JSON.stringify(reserva), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        ...(versao ? { ifMatch: versao } : {}),
      });
      return true;
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) return false;
      throw e;
    }
  },
  async listar() {
    const caminhos: string[] = [];
    let cursor: string | undefined;
    do {
      const pagina = await list({ prefix: 'reservas/', limit: 1000, cursor });
      caminhos.push(...pagina.blobs.map((b) => b.pathname));
      cursor = pagina.hasMore ? pagina.cursor : undefined;
    } while (cursor);
    const reservas: Reserva[] = [];
    for (let i = 0; i < caminhos.length; i += 12) {
      const lote = await Promise.all(caminhos.slice(i, i + 12).map((p) => blob.ler(p.replace(/^reservas\//, '').replace(/\.json$/, ''))));
      for (const r of lote) if (r) reservas.push(r.reserva);
    }
    return reservas;
  },
  criarPedido: (reservas) => umArquivoPorVoucher(blob).criarPedido(reservas),
  lerPedido: (codigo) => umArquivoPorVoucher(blob).lerPedido(codigo),
};

const PASTA_LOCAL = path.join(process.cwd(), '.data', 'reservas');

const arquivoLocal: Armazenamento = {
  async ler(codigo) {
    try {
      const texto = await fs.readFile(path.join(PASTA_LOCAL, `${codigo}.json`), 'utf8');
      const reserva = JSON.parse(texto) as Reserva;
      return { reserva, versao: reserva.atualizadaEm };
    } catch {
      return null;
    }
  },
  async criar(reserva) {
    await fs.mkdir(PASTA_LOCAL, { recursive: true });
    try {
      await fs.writeFile(path.join(PASTA_LOCAL, `${reserva.codigo}.json`), JSON.stringify(reserva, null, 2), { flag: 'wx' });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw e;
    }
  },
  async gravar(reserva, versao) {
    if (versao) {
      const atual = await arquivoLocal.ler(reserva.codigo);
      if (atual && atual.versao !== versao) return false;
    }
    await fs.mkdir(PASTA_LOCAL, { recursive: true });
    await fs.writeFile(path.join(PASTA_LOCAL, `${reserva.codigo}.json`), JSON.stringify(reserva, null, 2));
    return true;
  },
  async listar() {
    try {
      const nomes = await fs.readdir(PASTA_LOCAL);
      const lidas = await Promise.all(nomes.filter((n) => n.endsWith('.json')).map((n) => arquivoLocal.ler(n.slice(0, -5))));
      return lidas.filter((r): r is NonNullable<typeof r> => !!r).map((r) => r.reserva);
    } catch {
      return [];
    }
  },
  criarPedido: (reservas) => umArquivoPorVoucher(arquivoLocal).criarPedido(reservas),
  lerPedido: (codigo) => umArquivoPorVoucher(arquivoLocal).lerPedido(codigo),
};

/** O pedido com os itens e o histórico, numa consulta só. */
type PedidoCompleto = LinhaPedido & { itens_pedido: LinhaItem[]; pedidos_historico: EventoHistorico[] };
const PEDIDO_COMPLETO = '*, itens_pedido(*), pedidos_historico(em, evento)';
/** Um voucher com o pedido e o histórico. */
type ItemCompleto = LinhaItem & { pedidos: LinhaPedido & { pedidos_historico: EventoHistorico[] } };
const ITEM_COMPLETO = '*, pedidos!inner(*, pedidos_historico(em, evento))';

/** Um pedido vira uma reserva por voucher. */
const vouchers = (p: PedidoCompleto): Reserva[] => p.itens_pedido.map((i) => deLinhas(p, i, p.pedidos_historico));

const erroDoBanco = (e: { message: string }) => new Error(`Banco de dados: ${e.message}`);

const bancoDeDados: Armazenamento = {
  async ler(codigo) {
    const { data, error } = await supabase().from('itens_pedido').select(ITEM_COMPLETO).eq('voucher_codigo', codigo).maybeSingle();
    if (error) throw erroDoBanco(error);
    if (!data) return null;
    const { pedidos: p, ...item } = data as unknown as ItemCompleto;
    // a versão é o "atualizado_em" exato do banco: a função atualizar_reserva só grava se ele não mudou
    return { reserva: deLinhas(p, item, p.pedidos_historico), versao: p.atualizado_em };
  },
  async criar(reserva) {
    const l = paraLinhas(reserva);
    const { data, error } = await supabase().rpc('criar_reserva', { p_pedido: l.pedido, p_item: l.item, p_historico: l.historico });
    if (error) throw erroDoBanco(error);
    return data === true;
  },
  async criarPedido(reservas) {
    const pedido = crypto.randomUUID();
    const linhas = reservas.map((r) => paraLinhas(r, { pedido, item: crypto.randomUUID() }));
    const { data, error } = await supabase().rpc('criar_pedido', {
      p_pedido: linhas[0].pedido,
      p_itens: linhas.map((l) => l.item),
      p_historico: linhas[0].historico,
    });
    if (error) throw erroDoBanco(error);
    return data === true ? pedido : null;
  },
  async lerPedido(codigo) {
    const { data, error } = await supabase().from('pedidos').select(PEDIDO_COMPLETO).eq('codigo', codigo).maybeSingle();
    if (error) throw erroDoBanco(error);
    return data ? vouchers(data as unknown as PedidoCompleto) : [];
  },
  async gravar(reserva, versao) {
    const l = paraLinhas(reserva);
    const { data, error } = await supabase().rpc('atualizar_reserva', {
      // sem versão, grava por cima
      p_versao: versao ?? (null as unknown as string),
      p_pedido: l.pedido,
      p_item: l.item,
      p_historico: l.historico,
    });
    if (error) throw erroDoBanco(error);
    return data === true;
  },
  async listar() {
    const reservas: Reserva[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase()
        .from('pedidos')
        .select(PEDIDO_COMPLETO)
        .order('criado_em', { ascending: false })
        .range(de, de + 999);
      if (error) throw erroDoBanco(error);
      const pagina = data as unknown as PedidoCompleto[];
      reservas.push(...pagina.flatMap(vouchers));
      if (pagina.length < 1000) return reservas;
    }
  },
};

/** No banco de dados: sempre na Vercel (com o Supabase configurado); no computador, só com RESERVAS_NO_BANCO=1. */
function noBanco(): boolean {
  return supabaseConfigurado() && (Boolean(process.env.VERCEL) || process.env.RESERVAS_NO_BANCO === '1');
}

/** Onde as reservas novas são gravadas e procuradas primeiro. */
function principal(): Armazenamento {
  if (noBanco()) return bancoDeDados;
  if (process.env.BLOB_READ_WRITE_TOKEN) return blob;
  if (!process.env.VERCEL) return arquivoLocal;
  throw new Error('Banco de reservas não configurado: faltam SUPABASE_URL e SUPABASE_SECRET_KEY na Vercel.');
}

/** Onde as reservas moravam antes do banco (o Blob; no computador, os arquivos): só para as que ainda não vieram. */
function anterior(): Armazenamento | null {
  if (!noBanco()) return null;
  if (process.env.BLOB_READ_WRITE_TOKEN) return blob;
  return process.env.VERCEL ? null : arquivoLocal;
}

export function bancoConfigurado(): boolean {
  return noBanco() || Boolean(process.env.BLOB_READ_WRITE_TOKEN) || !process.env.VERCEL;
}

/** Para o painel: onde as reservas estão sendo gravadas agora. */
export function ondeFicamAsReservas(): string {
  if (noBanco()) return 'banco de dados (Supabase)';
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'Vercel Blob';
  return process.env.VERCEL ? 'NÃO configurado' : 'arquivos no computador';
}

/* ------------------------------------------------------------------ */

type CamposGerados = 'codigo' | 'token' | 'criadaEm' | 'atualizadaEm' | 'historico';
/** Os dados de uma reserva nova, de passeio ou de transfer (o resto o banco preenche). */
export type NovaReserva = Omit<ReservaPasseio, CamposGerados> | Omit<ReservaTransfer, CamposGerados>;

export async function criarReserva<T extends NovaReserva>(dados: T): Promise<T & Pick<Reserva, CamposGerados>> {
  const agora = new Date().toISOString();
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const reserva = {
      ...dados,
      codigo: gerarCodigo(),
      token: gerarToken(),
      criadaEm: agora,
      atualizadaEm: agora,
      historico: [{ em: agora, evento: 'Reserva criada' }],
    };
    // A gravação falha se o código já existir: assim nenhum voucher se repete.
    if (await principal().criar(reserva)) return reserva;
  }
  throw new Error('Não foi possível gerar um código de reserva único.');
}

/**
 * Cria o pedido do carrinho: um pagamento e um voucher para cada item, com o mesmo link secreto. Com um
 * item só, o voucher é o próprio pedido, igual a uma reserva avulsa.
 */
export async function criarPedido(itens: NovaReserva[]): Promise<{ id: string; codigo: string; token: string }> {
  const agora = new Date().toISOString();
  const totalCentavos = itens.reduce((s, i) => s + i.totalCentavos, 0);
  const totalPixCentavos = itens.reduce((s, i) => s + (i.totalPixCentavos ?? i.totalCentavos), 0);
  const varios = itens.length > 1;
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const codigo = gerarCodigo();
    const token = gerarToken();
    const reservas = itens.map(
      (dados) =>
        ({
          ...dados,
          codigo: varios ? gerarCodigo() : codigo,
          token,
          criadaEm: agora,
          atualizadaEm: agora,
          historico: [{ em: agora, evento: varios ? `Pedido criado com ${itens.length} itens` : 'Reserva criada' }],
          ...(varios ? { pedido: { codigo, totalCentavos, totalPixCentavos } } : {}),
        }) as Reserva,
    );
    // A gravação falha se algum código já existir: assim nenhum voucher se repete.
    const id = await principal().criarPedido(reservas);
    if (id) return { id, codigo, token };
  }
  throw new Error('Não foi possível gerar um código de pedido único.');
}

/** Os vouchers de um pedido com vários itens, na ordem em que acontecem. Nenhum, se o pedido não existir. */
export async function obterPedido(codigo: string): Promise<Reserva[]> {
  if (!codigoValido(codigo)) return [];
  const quando = (r: Reserva) => `${r.data} ${ehTransfer(r) ? r.transfer.ida.hora : (r.horario?.hora ?? '')}`;
  return (await principal().lerPedido(codigo)).sort((a, b) => quando(a).localeCompare(quando(b)));
}

export async function obterReserva(codigo: string): Promise<Reserva | null> {
  if (!codigoValido(codigo)) return null;
  const r = await principal().ler(codigo);
  if (r) return r.reserva;
  // ainda não veio para o banco: o link antigo continua abrindo pelo Blob
  return (await anterior()?.ler(codigo))?.reserva ?? null;
}

/** Atualiza com controle de concorrência (webhook e consulta de status podem chegar juntos). */
export async function atualizarReserva(codigo: string, alterar: (r: Reserva) => Reserva | null): Promise<Reserva | null> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    let atual = await principal().ler(codigo);
    if (!atual) {
      // ainda só no Blob: vem para o banco antes de mudar (no Blob ela fica como estava)
      const antes = await anterior()?.ler(codigo);
      if (!antes) return null;
      await principal().criar(antes.reserva);
      atual = await principal().ler(codigo);
      if (!atual) return null;
    }
    const nova = alterar(structuredClone(atual.reserva));
    if (!nova) return atual.reserva;
    nova.atualizadaEm = new Date().toISOString();
    if (await principal().gravar(nova, atual.versao)) return nova;
  }
  throw new Error(`Conflito ao atualizar a reserva ${codigo}.`);
}

export async function listarReservas(): Promise<Reserva[]> {
  const todas = await principal().listar();
  return todas.sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

export function registrar(r: Reserva, evento: string): Reserva {
  r.historico = [...(r.historico ?? []), { em: new Date().toISOString(), evento }];
  return r;
}

/**
 * Autoteste do banco (usado por /api/saude): confere no armazenamento real as mesmas regras
 * das reservas — gravação privada, código que não pode ser sobrescrito e atualização condicional.
 */
export async function testarBanco(): Promise<Record<string, boolean | string>> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { modo: process.env.VERCEL ? 'sem-banco' : 'arquivo-local' };
  const caminho = `saude/teste-${gerarToken()}.json`;
  const r: Record<string, boolean | string> = { modo: 'vercel-blob' };
  try {
    await put(caminho, JSON.stringify({ n: 1 }), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json',
    });
    r.grava = true;
    try {
      await put(caminho, JSON.stringify({ n: 2 }), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
      });
      r.naoSobrescreve = false;
    } catch {
      r.naoSobrescreve = true;
    }
    const lido = await get(caminho, { access: 'private', useCache: false });
    const texto = lido?.stream ? await new Response(lido.stream).text() : '';
    r.le = texto.includes('"n":1');
    const etag = lido?.blob.etag ?? '';
    await put(caminho, JSON.stringify({ n: 3 }), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      ifMatch: etag,
    });
    r.atualizaComVersao = true;
    try {
      await put(caminho, JSON.stringify({ n: 4 }), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        ifMatch: etag,
      });
      r.bloqueiaVersaoAntiga = false;
    } catch (e) {
      r.bloqueiaVersaoAntiga = e instanceof BlobPreconditionFailedError;
    }
    r.existe = Boolean(await head(caminho).catch(() => null));
  } catch (e) {
    r.erro = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    await del(caminho).catch(() => null);
  }
  return r;
}

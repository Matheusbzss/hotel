import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BlobPreconditionFailedError, del, get, head, list, put } from '@vercel/blob';
import type { IdLugar, Malas, Veiculo } from '@/data/transfer';
import type { Idioma } from '@/i18n/config';
import { supabase, usarBanco } from './banco';
import { codigoValido, gerarCodigo, gerarToken } from './codigo-reserva';
import { pagosDasReservas, type PedidoPagoRecente } from './emails-pendentes';
import type { Origem } from './origem';
import { provedorDaReserva, quandoAcontece } from './pedidos-painel';
import {
  codigoDoPedido,
  copiarDoPedido,
  deLinhas,
  paraLinhas,
  vouchersDoCodigo,
  type EventoHistorico,
  type LinhaItem,
  type LinhaPedido,
} from './reservas-banco';
import type { CancelamentoSemReembolso } from './sem-reembolso';
import type { LinhaDaConta } from './conta-casa';
import type { CidadeHospedagem } from './validacao';
import { mensagemDoErro } from './erros.ts';

/**
 * Banco de reservas.
 * - Na Vercel: o banco de dados (Supabase, src/lib/banco.ts). Cada reserva é um item de um pedido (o
 *   voucher), com o histórico do pedido; o pedido do carrinho tem vários itens e um pagamento só, e o status
 *   vale para todos. As reservas de antes continuam no Vercel Blob (reservas/<VOUCHER>.json), como
 *   cópia de segurança: uma reserva que ainda não estiver no banco é lida de lá e, se alguém mexer nela,
 *   vem para o banco antes. Nada é apagado do Blob.
 * - No computador (npm run dev): arquivos em .data/reservas/, um por voucher. Ali não existe a linha do
 *   pedido: o que é do pedido (status, pagamento, histórico) fica repetido em cada arquivo, e toda gravação
 *   leva a mudança aos outros vouchers do mesmo pedido (levarAosIrmaos). Com RESERVAS_NO_BANCO=1 no comando,
 *   usa o banco de verdade (para testar), e os arquivos fazem o papel do Blob.
 */

/**
 * O status do pedido (um pagamento, vale para todos os vouchers). 'contestado' é o chargeback aberto na
 * Stripe; 'recusado' e 'aguardando_whatsapp' ficam para os pedidos antigos e para o caminho do WhatsApp.
 * As mudanças que a Stripe pode causar estão em src/lib/pagamento-stripe.ts (podeMudar).
 */
export type StatusReserva =
  'pendente' | 'pago' | 'recusado' | 'cancelado' | 'expirado' | 'aguardando_whatsapp' | 'reembolsado' | 'contestado';

export type MetodoPagamento = 'pix' | 'cartao' | 'whatsapp';

/** Quem processou o pagamento: a Stripe (online), a equipe pelo WhatsApp, ou a Pagar.me (checkout antigo). */
export type Provedor = 'pagarme' | 'stripe' | 'whatsapp';

/**
 * O status de um voucher dentro do pedido (itens_pedido.status). Um item muda sozinho por atualizarItem (no banco,
 * atualizar_item) ou, desde o Pacote 16, pela gravação do próprio voucher com statusItem (atualizarReserva com o código
 * dele; no banco, atualizar_reserva): o 'voucher_da_stripe' do painel.
 */
export type StatusItem = 'ativo' | 'cancelado' | 'reembolsado' | 'usado';

/** O que toda reserva tem, de passeio ou de transfer. */
interface ReservaBase {
  codigo: string;
  token: string;
  criadaEm: string;
  atualizadaEm: string;
  idioma: Idioma;
  status: StatusReserva;
  /**
   * Quem processou o pagamento. As reservas gravadas antes desta coluna não têm o campo: para elas, e para
   * qualquer reserva, use provedorDaReserva(), que deduz pela forma de pagamento.
   */
  provedor?: Provedor;
  /** A sessão de pagamento corrente na Stripe (cs_...). As anteriores ficam no histórico. */
  pagamentoExternoId?: string;
  /** O pagamento na Stripe (pi_...): é por ele que se reembolsa. */
  paymentIntentId?: string;
  /** Quanto já voltou para o cliente, em centavos (reembolso total ou de um item só). Ausente = nada. */
  reembolsoCentavos?: number;
  /**
   * O status deste voucher quando difere do que o status do pedido diria (ex.: um passeio reembolsado
   * sozinho num pedido pago). Ausente = acompanha o pedido: ativo, ou cancelado/reembolsado com ele.
   */
  statusItem?: StatusItem;
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
  /** De onde o cliente veio, pelos links dos anúncios. */
  origem?: Origem;
  /** `pais` é o do endereço informado na Stripe (ISO de 2 letras), quando o pagamento foi online. */
  cliente: { nome: string; email: string; telefone: string; pais?: string };
  observacoes?: string;
  pagamento: {
    metodo: MetodoPagamento;
    /** O id do pedido na Pagar.me (checkout antigo). Na Stripe os ids ficam em pagamentoExternoId e paymentIntentId. */
    pedidoId?: string;
    pixCopiaECola?: string;
    pixExpiraEm?: string;
    cartaoFinal?: string;
    cartaoBandeira?: string;
    /** O país do cartão (ISO de 2 letras): o suporte sabe se foi cartão de fora. */
    cartaoPais?: string;
    /** O motivo da recusa por extenso (checkout antigo). */
    motivo?: string;
    /** O `decline_code` da Stripe da última recusa do cartão; src/lib/recusas.ts traduz para a chave do dicionário. */
    motivoCodigo?: string;
    /** Quanto o cliente viu na moeda dele (Adaptive Pricing), na menor unidade dela: centavos no dólar, pesos inteiros no CLP. */
    apresentado?: { moeda: string; valorCentavos: number };
    pagoEm?: string;
    /**
     * O que a Stripe recebeu pelo pedido inteiro, em centavos de real, gravado só quando é DIFERENTE do que o pedido
     * esperava (Pacote 23: aplicarSessao e reativarPedidoRetido, src/lib/pagamento-stripe.ts). Ausente = recebeu o
     * esperado. Quem lê é recebidoPelaStripe (src/lib/pedidos-painel.ts). Sem migração: mora no JSON `pagamento`.
     */
    recebidoCentavos?: number;
    ultimaConsulta?: string;
    /**
     * O pagamento que chegou com o pedido já cancelado e nunca pago (Pacote 22, decisão do dono de 23/11/2026): não volta
     * sozinho ao cliente; fica parado na Stripe até a equipe decidir no painel se devolve ou reativa o pedido
     * (pagamentoParaReter, src/lib/pagamento-stripe.ts). Sem migração: mora no JSON `pagamento`, nos arquivos e no banco.
     */
    retido?: PagamentoRetido;
    /**
     * Os cancelamentos sem reembolso feitos pela equipe no painel (Pacote 33): o pedido continua pago e os vouchers
     * listados ficam 'cancelado', com o motivo aqui. Sem migração: mora no JSON `pagamento`, nos arquivos e no banco. Quem
     * lê é src/lib/sem-reembolso.ts.
     */
    semReembolso?: CancelamentoSemReembolso[];
    /**
     * O que o pedido cobra HOJE em cada forma, em centavos, gravado na criação (Etapa 7): só nos pedidos com casa, em que
     * a casa cobra o sinal e não o total. É o valor esperado do pagamento (valorEsperadoDoPedido, src/lib/pedidos-painel.ts):
     * sem ele, o sinal pago daria o aviso de valor diferente. Ausente nos pedidos de sempre: o esperado continua o total.
     * Sem migração: mora no JSON `pagamento`, nos arquivos e no banco.
     */
    cobrar?: { cartao: number; pix: number };
  };
  historico: { em: string; evento: string }[];
}

/**
 * O pagamento parado de um pedido cancelado (pagamento.retido): o que a sessão paga relida na Stripe disse na hora em que
 * ele chegou, para a reativação gravar o pagamento como um pagamento normal, e a decisão da equipe no painel.
 */
export interface PagamentoRetido {
  paymentIntentId: string;
  /** A sessão paga (cs_…). */
  sessaoId: string;
  /** O total que a sessão cobrou, em centavos de real. */
  valorCentavos: number;
  forma?: 'pix' | 'cartao';
  /** A hora da cobrança que deu certo ou, sem ela na leitura, a hora em que o site viu o pagamento. */
  pagoEm: string;
  cartao?: { bandeira: string; final: string; pais?: string };
  apresentado?: { moeda: string; valorCentavos: number };
  clientePais?: string;
  /**
   * O que a equipe decidiu no painel. 'devolver' sem `reembolsoId` é a devolução começada e ainda sem a resposta da
   * Stripe (o mesmo botão completa, com a mesma chave de idempotência); 'reativar' fecha a decisão de vez.
   */
  decisao?: { acao: 'devolver' | 'reativar'; em: string; reembolsoId?: string };
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
  /** A cidade e o hotel; `aInformar`: o cliente marcou "Ainda não sei" e o hotel fica vazio (src/lib/hospedagem.ts). */
  hospedagem: { cidade: CidadeHospedagem; hotel: string; aInformar?: true };
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

/**
 * Uma estadia numa casa de temporada (Etapa 7), paga com o sinal no site e o restante na chegada. `data` é a entrada (às
 * 15h) e `saida`, o dia da saída (até as 12h; a noite dele não conta). Os totais de ReservaBase são os da estadia inteira
 * (no cartão e no Pix); o que se paga no site é o sinal, guardado na compra nas duas formas: a conta nunca é refeita depois
 * (se um dia o sinal mudar de 50%, as reservas antigas não mudam). As linhas da conta vão para o voucher, o e-mail e o
 * painel. Sem endereço: a equipe manda a localização pelo WhatsApp depois do pagamento.
 */
export interface ReservaCasa extends ReservaBase {
  tipo: 'casa';
  /** A casa como estava na compra: o nome em português e a cidade (o slug da lista das casas). */
  casa: { id: string; slug: string; nome: string; cidade: string };
  /** O dia da saída (AAAA-MM-DD). */
  saida: string;
  hospedes: number;
  /** O sinal pago no site, no cartão e no Pix (sobre o total com o desconto), guardados na compra. */
  sinalCentavos: number;
  sinalPixCentavos: number;
  /** As linhas da conta (LinhaDaConta, src/lib/conta-casa.ts): as noites do mesmo tipo e da mesma diária juntas. */
  linhas: LinhaDaConta[];
}

export type Reserva = ReservaPasseio | ReservaTransfer | ReservaCasa;

export const ehTransfer = (r: Reserva): r is ReservaTransfer => r.tipo === 'transfer';
export const ehCasa = (r: Reserva): r is ReservaCasa => r.tipo === 'casa';
/** As reservas de passeio antigas não têm o tipo: tudo que não é transfer nem casa é passeio. */
export const ehPasseio = (r: Reserva): r is ReservaPasseio => r.tipo !== 'transfer' && r.tipo !== 'casa';

export { codigoValido, gerarCodigo, gerarToken, provedorDaReserva };

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

/**
 * Sem o banco, cada voucher é um arquivo à parte, e o pedido é o código que eles guardam: o do pedido do carrinho ou, num
 * pedido de um item só, o do próprio voucher (vouchersDoCodigo, a mesma busca do banco por pedidos.codigo).
 */
const umArquivoPorVoucher = (a: Pick<Armazenamento, 'criar' | 'listar'>): Pick<Armazenamento, 'criarPedido' | 'lerPedido'> => ({
  async criarPedido(reservas) {
    for (const r of reservas) if (!(await a.criar(r))) return null;
    return codigoDoPedido(reservas[0]);
  },
  async lerPedido(codigo) {
    return vouchersDoCodigo(await a.listar(), codigo);
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

/** Onde as reservas novas são gravadas e procuradas primeiro. */
function principal(): Armazenamento {
  if (usarBanco()) return bancoDeDados;
  if (process.env.BLOB_READ_WRITE_TOKEN) return blob;
  if (!process.env.VERCEL) return arquivoLocal;
  throw new Error('Banco de reservas não configurado: faltam SUPABASE_URL e SUPABASE_SECRET_KEY na Vercel.');
}

/** Onde as reservas moravam antes do banco (o Blob; no computador, os arquivos): só para as que ainda não vieram. */
function anterior(): Armazenamento | null {
  if (!usarBanco()) return null;
  if (process.env.BLOB_READ_WRITE_TOKEN) return blob;
  return process.env.VERCEL ? null : arquivoLocal;
}

export function bancoConfigurado(): boolean {
  return usarBanco() || Boolean(process.env.BLOB_READ_WRITE_TOKEN) || !process.env.VERCEL;
}

/** Para o painel: onde as reservas estão sendo gravadas agora. */
export function ondeFicamAsReservas(): string {
  if (usarBanco()) return 'banco de dados (Supabase)';
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'Vercel Blob';
  return process.env.VERCEL ? 'NÃO configurado' : 'arquivos no computador';
}

/* ------------------------------------------------------------------ */

type CamposGerados = 'codigo' | 'token' | 'criadaEm' | 'atualizadaEm' | 'historico';
/** Os dados de uma reserva nova, de passeio, de transfer ou de casa (o resto o banco preenche). */
export type NovaReserva = Omit<ReservaPasseio, CamposGerados> | Omit<ReservaTransfer, CamposGerados> | Omit<ReservaCasa, CamposGerados>;

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

/**
 * Os vouchers de um pedido, na ordem em que acontecem (um só, num pedido de um item: o voucher é o pedido, nos arquivos
 * como no banco). Nenhum, se o pedido não existir.
 */
export async function obterPedido(codigo: string): Promise<Reserva[]> {
  if (!codigoValido(codigo)) return [];
  return (await principal().lerPedido(codigo)).sort((a, b) => quandoAcontece(a).localeCompare(quandoAcontece(b)));
}

export async function obterReserva(codigo: string): Promise<Reserva | null> {
  if (!codigoValido(codigo)) return null;
  const r = await principal().ler(codigo);
  if (r) return r.reserva;
  // ainda não veio para o banco: o link antigo continua abrindo pelo Blob
  return (await anterior()?.ler(codigo))?.reserva ?? null;
}

/**
 * A reserva que representa um pedido, pelo código do pedido: o próprio voucher, num pedido de um item só,
 * ou o primeiro voucher (na ordem da viagem) de um pedido com vários. Aceita também o código de um voucher.
 * É por aqui que o webhook da Stripe acha o pedido pelo `metadata.codigo` da sessão.
 */
export async function obterReservaDoPedido(codigo: string): Promise<Reserva | null> {
  if (!codigoValido(codigo)) return null;
  return (await obterReserva(codigo)) ?? (await obterPedido(codigo))[0] ?? null;
}

/**
 * Atualiza com controle de concorrência (webhook e consulta de status podem chegar juntos). Sem o banco, o que
 * foi gravado num voucher de um pedido com vários itens segue para os outros (levarAosIrmaos, logo abaixo).
 */
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
    if (await principal().gravar(nova, atual.versao)) {
      await levarAosIrmaos(nova);
      return nova;
    }
  }
  throw new Error(`Conflito ao atualizar a reserva ${codigo}.`);
}

/**
 * Sem o banco, cada voucher de um pedido é um arquivo, e o que é do pedido (status, pagamento, histórico) fica
 * repetido em todos. Depois de gravar um, leva a mudança aos irmãos: copiarDoPedido (reservas-banco.ts) diz o
 * que é do pedido e o que é só do voucher. Sem isto, o pedido com vários itens pago pelo webhook ficava pago num
 * voucher só, e o PDF dos outros respondia 409. No banco não precisa: lá o pedido é uma linha só.
 * A reserva já está gravada quando isto roda: uma falha aqui fica no registro do servidor e não desfaz nem
 * repete nada (quem chamou segue com a reserva gravada); a próxima gravação do pedido leva tudo de novo.
 */
async function levarAosIrmaos(gravada: Reserva): Promise<void> {
  if (usarBanco() || !gravada.pedido) return;
  const pedido = gravada.pedido.codigo;
  try {
    const irmaos = (await principal().lerPedido(pedido)).filter((r) => r.codigo !== gravada.codigo);
    for (const { codigo } of irmaos) {
      let feito = false;
      for (let tentativa = 0; tentativa < 5 && !feito; tentativa++) {
        // relido a cada tentativa, com a versão: outra gravação pode ter chegado ao irmão no meio do caminho
        const atual = await principal().ler(codigo);
        const copia = atual ? copiarDoPedido(atual.reserva, gravada) : null;
        feito = !atual || !copia || (await principal().gravar(copia, atual.versao));
      }
      if (!feito) throw new Error(`Conflito ao atualizar a reserva ${codigo}.`);
    }
  } catch (e) {
    console.error(
      `[reservas] o voucher ${gravada.codigo} foi gravado, mas a cópia para os outros do pedido ${pedido} falhou: ${mensagemDoErro(e)}`,
    );
  }
}

/**
 * Muda o status de UM voucher só (ex.: o passeio da chuva reembolsado num pedido de três), sem mexer nos
 * outros nem no status do pedido, e grava o evento no histórico. No banco é a função atualizar_item; no
 * computador (um arquivo por voucher) o item é marcado na própria reserva, e o evento entra também no histórico
 * dos outros vouchers do pedido (o histórico é do pedido, como no banco). Devolve false se o voucher não existir.
 */
export async function atualizarItem(voucher: string, status: StatusItem, evento: string): Promise<boolean> {
  if (!codigoValido(voucher)) return false;
  if (usarBanco()) {
    const { data, error } = await supabase().rpc('atualizar_item', { p_voucher: voucher, p_status: status, p_evento: evento });
    if (error) throw erroDoBanco(error);
    return data === true;
  }
  const r = await atualizarReserva(voucher, (reserva) => {
    reserva.statusItem = status;
    return registrar(reserva, evento);
  });
  return r !== null;
}

export async function listarReservas(): Promise<Reserva[]> {
  const todas = await principal().listar();
  return todas.sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

/**
 * Os pedidos pagos que viraram pagos desde `desde` (o agendamento do e-mail do pagamento aprovado que não saiu,
 * src/lib/emails-pendentes.ts): um por pedido, só o código, o status, as horas (do pagamento, da reativação no painel e
 * da última gravação) e o texto do histórico, sem dado do cliente. No banco, uma consulta estreita, sem migração: o
 * status 'pago' e a última gravação desde `desde` (o pedido que virou pago desde então foi gravado desde então, também o
 * reativado no painel, cuja hora do pagamento é a da cobrança antiga); o corte das 48 horas pela hora em que virou pago
 * fica com faltaOEmailDoPagamento. Nos arquivos e no Blob, a lista de sempre, filtrada por pagosDasReservas (o pedido de
 * vários itens aparece uma vez, pelo código do pedido).
 */
export async function listarPagosDesde(desde: Date): Promise<PedidoPagoRecente[]> {
  if (usarBanco()) {
    const { data, error } = await supabase()
      .from('pedidos')
      .select(
        'codigo, status, pago_em, atualizado_em, reativacao:pagamento->retido->decisao->>acao, reativado_em:pagamento->retido->decisao->>em, pedidos_historico(evento)',
      )
      .eq('status', 'pago')
      .gte('atualizado_em', desde.toISOString())
      .order('atualizado_em', { ascending: false })
      .limit(500);
    if (error) throw erroDoBanco(error);
    const linhas = data as unknown as (Pick<LinhaPedido, 'codigo' | 'status' | 'pago_em' | 'atualizado_em'> & {
      reativacao: string | null;
      reativado_em: string | null;
      pedidos_historico: Pick<EventoHistorico, 'evento'>[] | null;
    })[];
    return linhas.map((p) => ({
      codigo: p.codigo,
      status: p.status as StatusReserva,
      ...(p.pago_em ? { pagoEm: p.pago_em } : {}),
      ...(p.reativacao === 'reativar' && p.reativado_em ? { reativadoEm: p.reativado_em } : {}),
      atualizadaEm: p.atualizado_em,
      eventos: (p.pedidos_historico ?? []).map((h) => h.evento),
    }));
  }
  return pagosDasReservas(await principal().listar(), desde);
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

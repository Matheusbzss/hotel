import { randomBytes, randomInt } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BlobPreconditionFailedError, del, get, head, list, put } from '@vercel/blob';
import type { Idioma } from '@/i18n/config';
import type { CidadeHospedagem } from './validacao';

/**
 * Banco de reservas.
 * - Na Vercel: Vercel Blob em modo PRIVADO (variável BLOB_READ_WRITE_TOKEN, criada ao conectar o
 *   Blob Store ao projeto). Cada reserva é um JSON em reservas/<VOUCHER>.json.
 * - No computador (npm run dev): arquivos em .data/reservas/.
 */

export type StatusReserva = 'pendente' | 'pago' | 'recusado' | 'cancelado' | 'expirado' | 'aguardando_whatsapp' | 'reembolsado';

export type MetodoPagamento = 'pix' | 'cartao' | 'whatsapp';

export interface Reserva {
  codigo: string;
  token: string;
  criadaEm: string;
  atualizadaEm: string;
  idioma: Idioma;
  status: StatusReserva;
  passeio: {
    slug: string;
    nome: string;
    cidade: string;
    unidade: 'pessoa' | 'veiculo' | 'embarcacao';
    /** Opção escolhida (ex.: lancha 2 horas), quando o passeio tem opções. */
    opcao?: { id: string; nome: string };
  };
  data: string;
  /** Adultos e crianças que pagam inteira. */
  adultos: number;
  /** Total de crianças com desconto (meia + grátis). */
  criancas: number;
  criancasMeia?: number;
  criancasGratis?: number;
  unidades: number;
  totalCentavos: number;
  /** Quanto vai para o parceiro (sem margem), para controle interno. */
  custoParceiroCentavos: number;
  cliente: {
    nome: string;
    email: string;
    telefone: string;
    documentoTipo: 'cpf' | 'passaporte';
    documento: string;
  };
  hospedagem: { cidade: CidadeHospedagem; hotel: string };
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

const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Gera um código no formato ON-7K3P9Q (sem 0/O/1/I para não confundir). */
export function gerarCodigo(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return `ON-${s}`;
}

export function gerarToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Aceita também o prefixo VH- das reservas feitas antes da troca de marca. */
export function codigoValido(codigo: string): boolean {
  return /^(ON|VH)-[2-9A-HJ-NP-Z]{6}$/.test(codigo);
}

/* ------------------------------------------------------------------ */

interface Armazenamento {
  ler(codigo: string): Promise<{ reserva: Reserva; versao?: string } | null>;
  /** Cria a reserva; retorna false se o código já existir. */
  criar(reserva: Reserva): Promise<boolean>;
  /** Grava por cima, desde que a versão não tenha mudado (quando informada). */
  gravar(reserva: Reserva, versao?: string): Promise<boolean>;
  listar(): Promise<Reserva[]>;
}

const caminhoBlob = (codigo: string) => `reservas/${codigo}.json`;

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
};

export function bancoConfigurado(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) || !process.env.VERCEL;
}

function banco(): Armazenamento {
  if (process.env.BLOB_READ_WRITE_TOKEN) return blob;
  if (!process.env.VERCEL) return arquivoLocal;
  throw new Error('Banco de reservas não configurado: conecte um Blob Store (privado) ao projeto na Vercel.');
}

/* ------------------------------------------------------------------ */

export type NovaReserva = Omit<Reserva, 'codigo' | 'token' | 'criadaEm' | 'atualizadaEm' | 'historico'>;

export async function criarReserva(dados: NovaReserva): Promise<Reserva> {
  const agora = new Date().toISOString();
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const reserva: Reserva = {
      ...dados,
      codigo: gerarCodigo(),
      token: gerarToken(),
      criadaEm: agora,
      atualizadaEm: agora,
      historico: [{ em: agora, evento: 'Reserva criada' }],
    };
    // A gravação falha se o código já existir: assim nenhum voucher se repete.
    if (await banco().criar(reserva)) return reserva;
  }
  throw new Error('Não foi possível gerar um código de reserva único.');
}

export async function obterReserva(codigo: string): Promise<Reserva | null> {
  if (!codigoValido(codigo)) return null;
  const r = await banco().ler(codigo);
  return r?.reserva ?? null;
}

/** Atualiza com controle de concorrência (webhook e consulta de status podem chegar juntos). */
export async function atualizarReserva(codigo: string, alterar: (r: Reserva) => Reserva | null): Promise<Reserva | null> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const atual = await banco().ler(codigo);
    if (!atual) return null;
    const nova = alterar(structuredClone(atual.reserva));
    if (!nova) return atual.reserva;
    nova.atualizadaEm = new Date().toISOString();
    if (await banco().gravar(nova, atual.versao)) return nova;
  }
  throw new Error(`Conflito ao atualizar a reserva ${codigo}.`);
}

export async function listarReservas(): Promise<Reserva[]> {
  const todas = await banco().listar();
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

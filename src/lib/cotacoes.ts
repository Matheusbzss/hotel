import 'server-only';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Idioma } from '@/i18n/config';
import { supabase, usarBanco } from './banco';
import type { Json, Tables } from './banco-tipos';
import type { StatusCotacao, TipoCotacao, TrajetoCotacao } from './cotacao';
import type { Origem } from './origem';

/** As cotações: no banco (tabela cotacoes) na Vercel; no computador, arquivos em .data/cotacoes/. */

export interface Cotacao {
  id: string;
  tipo: TipoCotacao;
  nome: string;
  email: string;
  telefone?: string;
  idioma: Idioma;
  mensagem?: string;
  trajeto?: TrajetoCotacao;
  /** A campanha do anúncio de onde o cliente veio. */
  origem?: Origem;
  status: StatusCotacao;
  criadaEm: string;
}

export type NovaCotacao = Omit<Cotacao, 'id' | 'status' | 'criadaEm'>;

const PASTA = path.join(process.cwd(), '.data', 'cotacoes');
const erroDoBanco = (e: { message: string }) => new Error(`Banco de dados: ${e.message}`);

const deLinha = (l: Tables<'cotacoes'>): Cotacao => ({
  id: l.id,
  tipo: l.tipo as TipoCotacao,
  nome: l.nome,
  email: l.email,
  telefone: l.telefone ?? undefined,
  idioma: l.idioma as Idioma,
  mensagem: l.mensagem ?? undefined,
  trajeto: (l.dados as { trajeto?: TrajetoCotacao }).trajeto,
  origem: l.origem_utm as Origem,
  status: l.status as StatusCotacao,
  criadaEm: new Date(l.criado_em).toISOString(),
});

async function dosArquivos(): Promise<Cotacao[]> {
  const nomes = await fs.readdir(PASTA).catch(() => []);
  return Promise.all(nomes.map(async (n) => JSON.parse(await fs.readFile(path.join(PASTA, n), 'utf8')) as Cotacao));
}

export async function criarCotacao(nova: NovaCotacao): Promise<void> {
  if (usarBanco()) {
    const { trajeto, telefone, mensagem, origem, ...resto } = nova;
    const { error } = await supabase()
      .from('cotacoes')
      .insert({
        ...resto,
        telefone: telefone ?? null,
        mensagem: mensagem ?? null,
        dados: (trajeto ? { trajeto } : {}) as Json,
        origem_utm: (origem ?? {}) as Json,
      });
    if (error) throw erroDoBanco(error);
    return;
  }
  if (process.env.VERCEL) throw new Error('Banco de cotações não configurado: faltam SUPABASE_URL e SUPABASE_SECRET_KEY na Vercel.');
  const cotacao: Cotacao = { ...nova, id: randomUUID(), status: 'nova', criadaEm: new Date().toISOString() };
  await fs.mkdir(PASTA, { recursive: true });
  await fs.writeFile(path.join(PASTA, `${cotacao.id}.json`), JSON.stringify(cotacao, null, 2));
}

/** As cotações, da mais nova para a mais antiga. */
export async function listarCotacoes(): Promise<Cotacao[]> {
  if (usarBanco()) {
    const { data, error } = await supabase().from('cotacoes').select('*').order('criado_em', { ascending: false }).limit(1000);
    if (error) throw erroDoBanco(error);
    return data.map(deLinha);
  }
  return (await dosArquivos()).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

/** Para o aviso do painel. */
export async function contarCotacoesNovas(): Promise<number> {
  if (usarBanco()) {
    const { count, error } = await supabase().from('cotacoes').select('id', { count: 'exact', head: true }).eq('status', 'nova');
    if (error) throw erroDoBanco(error);
    return count ?? 0;
  }
  return (await dosArquivos()).filter((c) => c.status === 'nova').length;
}

export async function mudarStatusCotacao(id: string, status: StatusCotacao): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase().from('cotacoes').update({ status }).eq('id', id);
    if (error) throw erroDoBanco(error);
    return;
  }
  const cotacao = (await dosArquivos()).find((c) => c.id === id);
  if (cotacao) await fs.writeFile(path.join(PASTA, `${id}.json`), JSON.stringify({ ...cotacao, status }, null, 2));
}

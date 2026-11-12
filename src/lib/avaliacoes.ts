import 'server-only';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IdiomaConteudo } from '@/i18n/conteudo';
import type { Avaliacao, Origem, Sobre } from './avaliacao';
import { supabase, usarBanco } from './banco';
import type { Tables } from './banco-tipos';

/** As avaliações: no banco (tabela avaliacoes) na Vercel; no computador, arquivos em .data/avaliacoes/. */

export type NovaAvaliacao = Omit<Avaliacao, 'id' | 'publicada'>;

const PASTA = path.join(process.cwd(), '.data', 'avaliacoes');
const erroDoBanco = (e: { message: string }) => new Error(`Banco de dados: ${e.message}`);

const deLinha = (l: Tables<'avaliacoes'>): Avaliacao => ({
  id: l.id,
  nome: l.nome,
  pais: l.pais ?? undefined,
  cidade: l.cidade ?? undefined,
  foto: l.foto ?? undefined,
  titulo: l.titulo ?? undefined,
  produtoSlug: l.produto_slug ?? undefined,
  sobre: l.sobre as Sobre,
  lugar: l.lugar ?? undefined,
  nota: l.nota ?? undefined,
  texto: l.texto,
  idioma: (l.idioma as IdiomaConteudo | null) ?? undefined,
  origem: l.origem as Origem,
  origemUrl: l.origem_url ?? undefined,
  data: l.data_avaliacao,
  publicada: l.publicada,
});

async function dosArquivos(): Promise<Avaliacao[]> {
  const nomes = await fs.readdir(PASTA).catch(() => []);
  const lidas = await Promise.all(nomes.map(async (n) => JSON.parse(await fs.readFile(path.join(PASTA, n), 'utf8')) as Avaliacao));
  return lidas.sort((a, b) => b.data.localeCompare(a.data));
}

/** Toda avaliação nova começa escondida: quem publica é o dono, no painel. */
export async function criarAvaliacao(nova: NovaAvaliacao): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase()
      .from('avaliacoes')
      .insert({
        nome: nova.nome,
        pais: nova.pais ?? null,
        cidade: nova.cidade ?? null,
        foto: nova.foto ?? null,
        titulo: nova.titulo ?? null,
        produto_slug: nova.produtoSlug ?? null,
        sobre: nova.sobre ?? 'agencia',
        lugar: nova.lugar ?? null,
        nota: nova.nota ?? null,
        texto: nova.texto,
        idioma: nova.idioma ?? null,
        origem: nova.origem,
        origem_url: nova.origemUrl ?? null,
        data_avaliacao: nova.data,
      });
    if (error) throw erroDoBanco(error);
    return;
  }
  if (process.env.VERCEL) throw new Error('Banco de avaliações não configurado: faltam SUPABASE_URL e SUPABASE_SECRET_KEY na Vercel.');
  const avaliacao: Avaliacao = { ...nova, id: randomUUID(), publicada: false };
  await fs.mkdir(PASTA, { recursive: true });
  await fs.writeFile(path.join(PASTA, `${avaliacao.id}.json`), JSON.stringify(avaliacao, null, 2));
}

/** Para o painel: todas, das mais novas para as mais antigas. */
export async function listarAvaliacoes(): Promise<Avaliacao[]> {
  if (!usarBanco()) return dosArquivos();
  const { data, error } = await supabase().from('avaliacoes').select('*').order('data_avaliacao', { ascending: false }).limit(1000);
  if (error) throw erroDoBanco(error);
  return data.map(deLinha);
}

/** Para o site: só as publicadas. */
export async function avaliacoesPublicadas(): Promise<Avaliacao[]> {
  if (!usarBanco()) return (await dosArquivos()).filter((a) => a.publicada);
  const { data, error } = await supabase()
    .from('avaliacoes')
    .select('*')
    .eq('publicada', true)
    .order('data_avaliacao', { ascending: false });
  if (error) throw erroDoBanco(error);
  return data.map(deLinha);
}

export async function publicarAvaliacao(id: string, publicada: boolean): Promise<void> {
  if (usarBanco()) {
    const { error } = await supabase().from('avaliacoes').update({ publicada }).eq('id', id);
    if (error) throw erroDoBanco(error);
    return;
  }
  const avaliacao = (await dosArquivos()).find((a) => a.id === id);
  if (avaliacao) await fs.writeFile(path.join(PASTA, `${id}.json`), JSON.stringify({ ...avaliacao, publicada }, null, 2));
}

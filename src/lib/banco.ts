import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './banco-tipos';

/**
 * Banco de dados (Supabase, projeto orla-nativa): todo o acesso passa por aqui.
 * - Só no servidor. A chave secreta (SUPABASE_SECRET_KEY) passa por cima das travas de acesso do banco,
 *   então nunca vai para o navegador nem para variável NEXT_PUBLIC_. O "server-only" barra a montagem
 *   do site se um componente do navegador importar este arquivo.
 * - Variáveis: SUPABASE_URL e SUPABASE_SECRET_KEY, no .env.local e na Vercel.
 */

export type Banco = SupabaseClient<Database>;

export function supabaseConfigurado(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/** No banco de dados: sempre na Vercel (com o Supabase configurado); no computador, só com RESERVAS_NO_BANCO=1. */
export function usarBanco(): boolean {
  return supabaseConfigurado() && (Boolean(process.env.VERCEL) || process.env.RESERVAS_NO_BANCO === '1');
}

// sem resposta em 10 s, desiste (o banco fora do ar não pode travar a página nem o checkout)
const comPrazo: typeof fetch = (url, init) => {
  const prazo = AbortSignal.timeout(10_000);
  return fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, prazo]) : prazo });
};

let cliente: Banco | null = null;

export function supabase(): Banco {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) throw new Error('Banco não configurado: faltam SUPABASE_URL e SUPABASE_SECRET_KEY.');
  cliente = createClient<Database>(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: comPrazo },
  });
  return cliente;
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e)));

/**
 * Autoteste do banco (usado por /api/saude e pelo agendamento diário da Vercel): grava uma linha de
 * teste na tabela saude, lê de volta e apaga em seguida. Rodando todo dia, também impede que o plano
 * grátis do Supabase pause o projeto por falta de uso.
 */
export async function testarSupabase(): Promise<Record<string, boolean | string | number>> {
  if (!supabaseConfigurado()) return { modo: 'sem-supabase' };
  const r: Record<string, boolean | string | number> = { modo: 'supabase' };
  const inicio = Date.now();
  let id: string | undefined;
  try {
    const gravado = await supabase().from('saude').insert({ criado_em: new Date().toISOString() }).select('id').single();
    if (gravado.error) throw gravado.error;
    id = gravado.data.id;
    r.grava = true;
    const lido = await supabase().from('saude').select('id').eq('id', id).maybeSingle();
    if (lido.error) throw lido.error;
    r.le = lido.data?.id === id;
  } catch (e) {
    r.erro = mensagem(e);
  } finally {
    if (id) {
      const apagado = await supabase().from('saude').delete().eq('id', id).select('id');
      r.apaga = !apagado.error && apagado.data.length === 1;
      if (apagado.error && !r.erro) r.erro = mensagem(apagado.error);
    }
    r.ms = Date.now() - inicio;
  }
  return r;
}

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_ADMIN, adminConfigurado, sessaoValida } from '@/lib/admin-auth';
import { supabase as bancoDeDados, supabaseConfigurado, testarSupabase } from '@/lib/banco';
import { idadeDaCotacaoDias } from '@/lib/dolar';
import { pagarmeConfigurado } from '@/lib/pagarme';
import { testarBanco } from '@/lib/reservas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function iguais(recebido: string | null, esperado: string | undefined): boolean {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** O câmbio atrasa sem estragar nada por até 3 dias úteis; para ficar simples, o aviso vem com mais de 5 dias corridos. */
const CAMBIO_ATRASO_MAXIMO_DIAS = 5;

/** A cotação do dólar guardada (tabela cambio_dolar): a data, a idade em dias e se está em dia. */
async function cambioDolar(): Promise<Record<string, boolean | string | number>> {
  if (!supabaseConfigurado()) return { modo: 'sem-supabase' };
  try {
    const { data: linha, error } = await bancoDeDados()
      .from('cambio_dolar')
      .select('data_ptax, fonte')
      .order('data_ptax', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!linha) return { ok: false, erro: 'nenhuma cotação guardada' };
    const idadeDias = idadeDaCotacaoDias(linha.data_ptax);
    return { ok: idadeDias <= CAMBIO_ATRASO_MAXIMO_DIAS, data: linha.data_ptax, idadeDias, fonte: linha.fonte };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Verificação de saúde: banco de reservas (Blob), banco de dados (Supabase), câmbio do dólar, pagamento
 * e configurações.
 * Abre para o admin logado, com ?token=PAGARME_WEBHOOK_TOKEN ou para o agendamento diário da Vercel
 * (vercel.json), que manda "Authorization: Bearer CRON_SECRET".
 */
export async function GET(req: Request) {
  const loja = await cookies();
  const cron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined;
  const autorizado =
    sessaoValida(loja.get(COOKIE_ADMIN)?.value) ||
    iguais(new URL(req.url).searchParams.get('token'), process.env.PAGARME_WEBHOOK_TOKEN) ||
    iguais(req.headers.get('authorization'), cron);
  if (!autorizado) return NextResponse.json({ ok: false }, { status: 401 });
  const [banco, supabase, cambio] = await Promise.all([testarBanco(), testarSupabase(), cambioDolar()]);
  const ok = !banco.erro && !supabase.erro && cambio.ok !== false;
  // fica nos registros da Vercel: é por eles que se confere o agendamento diário
  console.log(`saude ok=${ok} ${JSON.stringify({ banco, supabase, cambio })}`);
  return NextResponse.json(
    {
      ok,
      banco,
      supabase,
      cambio,
      pagamentoOnline: pagarmeConfigurado(),
      adminConfigurado: adminConfigurado(),
      pixelConfigurado: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
      regiao: process.env.VERCEL_REGION ?? null,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

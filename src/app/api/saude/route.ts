import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_ADMIN, adminConfigurado, chamadaDoAgendamento, sessaoValida } from '@/lib/admin-auth';
import { supabase as bancoDeDados, supabaseConfigurado, testarSupabase } from '@/lib/banco';
import { idadeDaCotacaoDias } from '@/lib/dolar';
import { emailLigado } from '@/lib/email/enviar';
import { modoPagamentoOnline } from '@/lib/formas-pagamento';
import { limparLimites } from '@/lib/limite-ip';
import { testarBanco } from '@/lib/reservas';
import { modoStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

/** A limpeza das janelas vencidas do limite por IP (tabela limites_ip): só no agendamento diário. */
async function limpezaDosLimites(): Promise<Record<string, boolean | string | number>> {
  try {
    return { ok: true, apagadas: await limparLimites() };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * O cadastro dos hóspedes das casas sai do banco 30 dias depois da saída, ou logo que a estadia é cancelada ou
 * devolvida (função apagar_hospedes_vencidos, Etapa 7): só no agendamento diário. Antes da migração das casas a função
 * não existe (PGRST202) e ainda não há cadastro nenhum para apagar: fica só o aviso, sem marcar a verificação como falha.
 */
async function limpezaDosHospedes(): Promise<Record<string, boolean | string | number>> {
  if (!supabaseConfigurado()) return { modo: 'sem-supabase' };
  try {
    const { data, error } = await bancoDeDados().rpc('apagar_hospedes_vencidos');
    if (error?.code === 'PGRST202') return { ok: true, apagados: 0, aviso: 'função apagar_hospedes_vencidos ainda não está no banco' };
    if (error) throw new Error(error.message);
    return { ok: true, apagados: data };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Verificação de saúde: banco de reservas (Blob), banco de dados (Supabase), câmbio do dólar, pagamento e
 * configurações. Abre só para o admin logado ou para o agendamento diário da Vercel (vercel.json), que manda
 * "Authorization: Bearer CRON_SECRET" e também limpa o limite por IP e apaga o cadastro vencido dos hóspedes das
 * casas. Nenhum valor de chave sai daqui: da Stripe, só o modo (desligado, teste ou produção), pelo prefixo da chave.
 */
export async function GET(req: Request) {
  const loja = await cookies();
  const agendamento = chamadaDoAgendamento(req);
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value) && !agendamento) return NextResponse.json({ ok: false }, { status: 401 });
  const [banco, supabase, cambio, limites, hospedes] = await Promise.all([
    testarBanco(),
    testarSupabase(),
    cambioDolar(),
    agendamento ? limpezaDosLimites() : Promise.resolve(undefined),
    agendamento ? limpezaDosHospedes() : Promise.resolve(undefined),
  ]);
  const ok = !banco.erro && !supabase.erro && cambio.ok !== false && limites?.ok !== false && hospedes?.ok !== false;
  // fica nos registros da Vercel: é por eles que se confere o agendamento diário
  console.log(`saude ok=${ok} ${JSON.stringify({ banco, supabase, cambio, limites, hospedes })}`);
  return NextResponse.json(
    {
      ok,
      banco,
      supabase,
      cambio,
      ...(limites ? { limites } : {}),
      ...(hospedes ? { hospedes } : {}),
      stripe: modoStripe(),
      pagamentoOnline: modoPagamentoOnline(),
      // os e-mails automáticos (Etapa 6): ligados só com a chave do Resend; o valor da chave nunca sai daqui
      email: emailLigado() ? 'ligado' : 'desligado',
      adminConfigurado: adminConfigurado(),
      pixelConfigurado: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
      regiao: process.env.VERCEL_REGION ?? null,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

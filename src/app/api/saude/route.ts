import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_ADMIN, adminConfigurado, sessaoValida } from '@/lib/admin-auth';
import { testarSupabase } from '@/lib/banco';
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

/**
 * Verificação de saúde: banco de reservas (Blob), banco de dados (Supabase), pagamento e configurações.
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
  const [banco, supabase] = await Promise.all([testarBanco(), testarSupabase()]);
  const ok = !banco.erro && !supabase.erro;
  // fica nos registros da Vercel: é por eles que se confere o agendamento diário
  console.log(`saude ok=${ok} ${JSON.stringify({ banco, supabase })}`);
  return NextResponse.json(
    {
      ok,
      banco,
      supabase,
      pagamentoOnline: pagarmeConfigurado(),
      adminConfigurado: adminConfigurado(),
      pixelConfigurado: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
      regiao: process.env.VERCEL_REGION ?? null,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_ADMIN, adminConfigurado, sessaoValida } from '@/lib/admin-auth';
import { pagarmeConfigurado } from '@/lib/pagarme';
import { testarBanco } from '@/lib/reservas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenConfere(token: string | null): boolean {
  const esperado = process.env.PAGARME_WEBHOOK_TOKEN;
  if (!esperado || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verificação de saúde: banco de reservas, pagamento e configurações (para o admin). */
export async function GET(req: Request) {
  const loja = await cookies();
  const autorizado = sessaoValida(loja.get(COOKIE_ADMIN)?.value) || tokenConfere(new URL(req.url).searchParams.get('token'));
  if (!autorizado) return NextResponse.json({ ok: false }, { status: 401 });
  const banco = await testarBanco();
  return NextResponse.json(
    {
      ok: !banco.erro,
      banco,
      pagamentoOnline: pagarmeConfigurado(),
      adminConfigurado: adminConfigurado(),
      pixelConfigurado: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
      regiao: process.env.VERCEL_REGION ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sincronizarReserva } from '@/lib/pagamentos';
import { codigoValido, obterReserva } from '@/lib/reservas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook da Pagar.me (eventos order.* e charge.*).
 * URL a cadastrar no painel: https://SEU-DOMINIO/api/webhooks/pagarme?token=<PAGARME_WEBHOOK_TOKEN>
 * O corpo do evento não é usado como verdade: a reserva é sempre conferida na API da Pagar.me.
 */
function iguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function autorizado(req: Request): boolean {
  const esperado = process.env.PAGARME_WEBHOOK_TOKEN;
  if (!esperado) return false;
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (token && iguais(token, esperado)) return true;
  // alternativa: autenticação básica configurada no painel (usuário qualquer, senha = token)
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    const [, senha = ''] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    return iguais(senha, esperado);
  }
  return false;
}

interface Evento {
  id?: string;
  type?: string;
  data?: { id?: string; code?: string; order?: { id?: string; code?: string } };
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ ok: false }, { status: 401 });
  let evento: Evento;
  try {
    evento = (await req.json()) as Evento;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const codigo = evento.data?.order?.code ?? evento.data?.code;
  if (!codigo || !codigoValido(codigo)) return NextResponse.json({ ok: true, ignorado: true });
  const reserva = await obterReserva(codigo);
  if (!reserva) return NextResponse.json({ ok: true, ignorado: true });
  try {
    const atualizada = await sincronizarReserva(reserva, 'webhook');
    return NextResponse.json({ ok: true, status: atualizada.status });
  } catch (e) {
    console.error('[webhook] falha ao sincronizar', codigo, e);
    // 500 faz a Pagar.me tentar de novo mais tarde
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { COOKIE_ADMIN, adminConfigurado, criarSessao, senhaCorreta } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const senha = String(form?.get('senha') ?? '');
  const destino = new URL('/admin', req.url);
  if (!adminConfigurado()) {
    destino.searchParams.set('erro', 'config');
    return NextResponse.redirect(destino, 303);
  }
  if (!senhaCorreta(senha)) {
    await new Promise((r) => setTimeout(r, 800));
    destino.searchParams.set('erro', 'senha');
    return NextResponse.redirect(destino, 303);
  }
  const sessao = criarSessao();
  const res = NextResponse.redirect(destino, 303);
  res.cookies.set(COOKIE_ADMIN, sessao.valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: sessao.expira,
  });
  return res;
}

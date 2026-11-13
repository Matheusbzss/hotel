import { NextResponse } from 'next/server';
import { COOKIE_ADMIN, adminConfigurado, criarSessao, senhaCorreta } from '@/lib/admin-auth';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';

export const runtime = 'nodejs';

/**
 * No máximo 10 tentativas de senha a cada 15 minutos por IP, certas ou erradas: quem tenta adivinhar a senha
 * do painel não tem como acelerar. Somado à espera de 800 ms a cada senha errada.
 */
const TENTATIVAS_POR_IP = 10;
const JANELA_SEGUNDOS = 15 * 60;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const senha = String(form?.get('senha') ?? '');
  const destino = new URL('/admin', req.url);
  if (!adminConfigurado()) {
    destino.searchParams.set('erro', 'config');
    return NextResponse.redirect(destino, 303);
  }
  if (!(await permitir(chaveDoLimite('login', ipDaRequisicao(req.headers)), TENTATIVAS_POR_IP, JANELA_SEGUNDOS))) {
    destino.searchParams.set('erro', 'limite');
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

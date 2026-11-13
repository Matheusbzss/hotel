import { NextResponse } from 'next/server';
import { rota } from '@/i18n/config';
import { abrirCarrinhoDoLembrete } from '@/lib/carrinho-lembretes';
import { COOKIE_CARRINHO, OPCOES_COOKIE_CARRINHO } from '@/lib/carrinho-servidor';
import { idiomaDoLink } from '@/lib/email/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * O botão "Voltar ao carrinho" do lembrete (?t=link assinado): devolve o carrinho como estava, no cookie, e leva ao
 * checkout no idioma do e-mail. Link vencido, adulterado ou de um carrinho que já virou pedido pago leva ao checkout
 * sem mexer no cookie (o carrinho aparece vazio, com o caminho para os passeios). O link nunca fica no endereço da
 * página: a resposta é um redirecionamento.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('t');
  const destino = (idioma: Parameters<typeof rota>[0]) => new URL(rota(idioma, '/checkout'), req.url);
  try {
    const { idioma, cookie } = await abrirCarrinhoDoLembrete(token);
    const resposta = NextResponse.redirect(destino(idioma), 303);
    if (cookie) resposta.cookies.set(COOKIE_CARRINHO, cookie, OPCOES_COOKIE_CARRINHO);
    resposta.headers.set('Cache-Control', 'no-store');
    resposta.headers.set('Referrer-Policy', 'no-referrer');
    return resposta;
  } catch (e) {
    console.error(`[lembretes] o link de voltar ao carrinho falhou: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.redirect(destino(idiomaDoLink(token)), 303);
  }
}

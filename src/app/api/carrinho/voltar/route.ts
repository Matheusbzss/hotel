import { NextResponse } from 'next/server';
import { rota } from '@/i18n/config';
import { abrirCarrinhoDoLembrete } from '@/lib/carrinho-lembretes';
import { COOKIE_CARRINHO, OPCOES_COOKIE_CARRINHO } from '@/lib/carrinho-servidor';
import { idiomaDoLink } from '@/lib/email/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * O botão "Voltar ao carrinho" do lembrete (?t=link assinado). Leva ao checkout no idioma do e-mail com o cookie de um
 * carrinho NOVO, com os mesmos itens: o código do carrinho que recebeu o e-mail nunca é entregue (quem abre um link
 * encaminhado não divide o carrinho nem o pedido do cliente; src/lib/lembretes.ts, voltarAoCarrinho). O carrinho que
 * já virou pedido leva a "Consultar meu pedido", sem cookie. Link vencido ou adulterado, carrinho vazio ou que sumiu:
 * o checkout, sem mexer no cookie (o carrinho aparece vazio, com o caminho para os passeios). O link nunca fica no
 * endereço da página: a resposta é um redirecionamento.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('t');
  const checkout = (idioma: Parameters<typeof rota>[0]) => new URL(rota(idioma, '/checkout'), req.url);
  try {
    const volta = await abrirCarrinhoDoLembrete(token);
    const destino = volta.destino === 'consultar' ? new URL(rota(volta.idioma, '/consultar-pedido'), req.url) : checkout(volta.idioma);
    const resposta = NextResponse.redirect(destino, 303);
    if (volta.cookie) resposta.cookies.set(COOKIE_CARRINHO, volta.cookie, OPCOES_COOKIE_CARRINHO);
    resposta.headers.set('Cache-Control', 'no-store');
    resposta.headers.set('Referrer-Policy', 'no-referrer');
    return resposta;
  } catch (e) {
    console.error(`[lembretes] o link de voltar ao carrinho falhou: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.redirect(checkout(idiomaDoLink(token)), 303);
  }
}

import { NextResponse } from 'next/server';
import { rota } from '@/i18n/config';
import { sairDaListaPeloLink } from '@/lib/carrinho-lembretes';
import { idiomaDoLink } from '@/lib/email/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Sair da lista dos lembretes do carrinho, em um clique (?t=link assinado):
 * - GET: o link do fim do e-mail. Tira o e-mail da lista e leva à página que confirma (/sair-da-lista), sem o link
 *   no endereço; link que não vale leva à mesma página com o aviso e o e-mail da equipe.
 * - POST: o "cancelar inscrição" do próprio aplicativo de e-mail (cabeçalho List-Unsubscribe-Post, RFC 8058).
 * Os e-mails dos pedidos continuam: a lista vale só para os lembretes.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('t');
  let resultado: { ok: boolean; idioma: Parameters<typeof rota>[0] };
  try {
    resultado = await sairDaListaPeloLink(token);
  } catch (e) {
    console.error(`[lembretes] sair da lista falhou: ${mensagem(e)}`);
    resultado = { ok: false, idioma: idiomaDoLink(token) };
  }
  const destino = new URL(rota(resultado.idioma, '/sair-da-lista'), req.url);
  destino.searchParams.set(resultado.ok ? 'pronto' : 'erro', '1');
  const resposta = NextResponse.redirect(destino, 303);
  resposta.headers.set('Cache-Control', 'no-store');
  resposta.headers.set('Referrer-Policy', 'no-referrer');
  return resposta;
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get('t');
  try {
    const { ok } = await sairDaListaPeloLink(token);
    return NextResponse.json({ ok }, { status: ok ? 200 : 400, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(`[lembretes] sair da lista falhou: ${mensagem(e)}`);
    return NextResponse.json({ ok: false }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

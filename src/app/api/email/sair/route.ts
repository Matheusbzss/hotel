import { NextResponse, type NextRequest } from 'next/server';
import { isIdioma, rota } from '@/i18n/config';
import { conferirLinkDeSair, sairDaListaPeloLink } from '@/lib/carrinho-lembretes';
import { idiomaDoLink } from '@/lib/email/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SEM_CACHE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

/**
 * O link assinado, guardado entre o GET (o link do e-mail) e o POST do botão da página de confirmação: só para esta
 * rota, só do próprio site (SameSite=Lax: um formulário de outro site não o leva) e por um dia. Assim o link nunca
 * fica no endereço nem no HTML da página.
 */
const COOKIE_SAIR = 'on_sair';
const OPCOES_COOKIE_SAIR = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/email/sair',
  maxAge: 60 * 60 * 24,
};

const pagina = (req: NextRequest, idioma: Parameters<typeof rota>[0], estado: 'confirmar' | 'pronto' | 'erro') => {
  const destino = new URL(rota(idioma, '/sair-da-lista'), req.url);
  destino.searchParams.set(estado, '1');
  return destino;
};

/**
 * Sair da lista dos lembretes do carrinho (?t=link assinado):
 * - GET: o link do fim do e-mail. NÃO tira ninguém da lista (os filtros de e-mail das empresas e de alguns provedores
 *   abrem os links sozinhos para conferir se são seguros): confere o link, guarda-o no cookie desta rota e leva à
 *   página que pede a confirmação (/sair-da-lista?confirmar=1); o link que não vale leva à mesma página com o aviso e
 *   o e-mail da equipe.
 * - POST com ?t=: o "cancelar inscrição" do próprio aplicativo de e-mail (cabeçalho List-Unsubscribe-Post, RFC 8058),
 *   em um toque: tira da lista na hora e responde em JSON.
 * - POST sem ?t=: o botão "Sim, sair da lista" da página, com o link do cookie: tira da lista e volta para a página
 *   com ?pronto=1 (ou ?erro=1).
 * Sai da lista o e-mail que recebeu o lembrete (cifrado no link). Os e-mails dos pedidos continuam: a lista vale só
 * para os lembretes.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t');
  const { ok, idioma } = conferirLinkDeSair(token);
  const resposta = NextResponse.redirect(pagina(req, idioma, ok ? 'confirmar' : 'erro'), { status: 303, headers: SEM_CACHE });
  if (ok && token) resposta.cookies.set(COOKIE_SAIR, token, OPCOES_COOKIE_SAIR);
  return resposta;
}

export async function POST(req: NextRequest) {
  const doAplicativo = req.nextUrl.searchParams.get('t');
  if (doAplicativo) {
    try {
      const { ok } = await sairDaListaPeloLink(doAplicativo);
      return NextResponse.json({ ok }, { status: ok ? 200 : 400, headers: SEM_CACHE });
    } catch (e) {
      console.error(`[lembretes] sair da lista falhou: ${mensagem(e)}`);
      return NextResponse.json({ ok: false }, { status: 500, headers: SEM_CACHE });
    }
  }
  const token = req.cookies.get(COOKIE_SAIR)?.value ?? null;
  // sem o cookie (venceu, ou o botão foi tocado em outro aparelho), a página de erro fala o idioma da página do botão
  const daPagina = (await req.formData().catch(() => null))?.get('idioma');
  const idiomaDaPagina = typeof daPagina === 'string' && isIdioma(daPagina) ? daPagina : undefined;
  let resultado: { ok: boolean; idioma: Parameters<typeof rota>[0] };
  try {
    resultado = await sairDaListaPeloLink(token);
  } catch (e) {
    console.error(`[lembretes] sair da lista falhou: ${mensagem(e)}`);
    resultado = { ok: false, idioma: idiomaDoLink(token) };
  }
  if (!token && idiomaDaPagina) resultado = { ...resultado, idioma: idiomaDaPagina };
  const resposta = NextResponse.redirect(pagina(req, resultado.idioma, resultado.ok ? 'pronto' : 'erro'), {
    status: 303,
    headers: SEM_CACHE,
  });
  // o link já serviu: o cookie sai
  if (token) resposta.cookies.set(COOKIE_SAIR, '', { ...OPCOES_COOKIE_SAIR, maxAge: 0 });
  return resposta;
}

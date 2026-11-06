import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { dicionario } from '@/i18n';
import { isIdioma, type Idioma } from '@/i18n/config';
import { MAXIMO_ITENS } from '@/lib/carrinho';
import {
  COOKIE_CARRINHO,
  codigoCarrinhoValido,
  conferirEscolha,
  gravarCarrinho,
  itensQueValem,
  itensVisiveis,
  lerCarrinho,
  novoCodigoCarrinho,
  sugestoesVisiveis,
} from '@/lib/carrinho-servidor';
import { emailValido } from '@/lib/validacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEM_CACHE = { 'Cache-Control': 'no-store' };
const idiomaDe = (v: unknown): Idioma => (typeof v === 'string' && isIdioma(v) ? v : 'pt');

/** O carrinho fica guardado 60 dias, só no cookie deste site (o navegador não lê o código). */
const OPCOES_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 60,
};

async function resposta(codigo: string | undefined, idioma: Idioma) {
  const { itens } = await lerCarrinho(codigo);
  const d = dicionario(idioma);
  return NextResponse.json(
    { ok: true, itens: itensVisiveis(itens, idioma, d), sugestoes: sugestoesVisiveis(itens, idioma, d) },
    { headers: SEM_CACHE },
  );
}

function falha(erro: string, status: number, e?: unknown) {
  if (e) console.error(`[carrinho] ${erro}`, e);
  return NextResponse.json({ ok: false, erro }, { status, headers: SEM_CACHE });
}

/** O carrinho do cliente, pelo cookie, com os textos e os preços no idioma. */
export async function GET(req: Request) {
  const idioma = idiomaDe(new URL(req.url).searchParams.get('idioma'));
  try {
    return await resposta((await cookies()).get(COOKIE_CARRINHO)?.value, idioma);
  } catch (e) {
    return falha('banco', 503, e);
  }
}

/** Adiciona um item (ou troca o que está sendo mudado): confere com as regras do checkout e grava. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { escolha?: unknown; idioma?: unknown; substituir?: unknown } | null;
  const idioma = idiomaDe(corpo?.idioma);
  const conferida = conferirEscolha(corpo?.escolha);
  if (!conferida.ok) return falha(conferida.erro, 400);
  try {
    const loja = await cookies();
    const cookie = loja.get(COOKIE_CARRINHO)?.value;
    const guardado = await lerCarrinho(cookie);
    // sem carrinho, ou o carrinho já virou um pedido: começa um novo
    const codigo = codigoCarrinhoValido(cookie) && !guardado.pedidoId ? cookie : novoCodigoCarrinho();
    const atuais = itensQueValem(guardado.itens);
    const novo = { id: randomUUID(), escolha: conferida.escolha };
    // o "Mudar" troca o item no mesmo lugar
    const lugar = atuais.findIndex((i) => i.id === corpo?.substituir);
    if (lugar < 0 && atuais.length >= MAXIMO_ITENS) return falha('cheio', 400);
    const itens = lugar < 0 ? [...atuais, novo] : atuais.map((i, n) => (n === lugar ? novo : i));
    await gravarCarrinho(codigo, { itens, idioma });
    loja.set(COOKIE_CARRINHO, codigo, OPCOES_COOKIE);
    return await resposta(codigo, idioma);
  } catch (e) {
    return falha('banco', 503, e);
  }
}

/** Tira um item do carrinho (?id=). */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const idioma = idiomaDe(url.searchParams.get('idioma'));
  const id = url.searchParams.get('id') ?? '';
  try {
    const codigo = (await cookies()).get(COOKIE_CARRINHO)?.value;
    const atual = await lerCarrinho(codigo);
    if (codigo && atual.itens.some((i) => i.id === id)) await gravarCarrinho(codigo, { itens: atual.itens.filter((i) => i.id !== id) });
    return await resposta(codigo, idioma);
  } catch (e) {
    return falha('banco', 503, e);
  }
}

/** Guarda o e-mail que o cliente digitou no checkout (para lembrar quem não terminou, na Fase 5). */
export async function PATCH(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase() : '';
  if (!emailValido(email)) return falha('email', 400);
  try {
    const codigo = (await cookies()).get(COOKIE_CARRINHO)?.value;
    const atual = await lerCarrinho(codigo);
    if (codigo && atual.itens.length && !atual.pedidoId) await gravarCarrinho(codigo, { email });
    return NextResponse.json({ ok: true }, { headers: SEM_CACHE });
  } catch (e) {
    return falha('banco', 503, e);
  }
}

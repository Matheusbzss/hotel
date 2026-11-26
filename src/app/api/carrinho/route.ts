import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { dicionario } from '@/i18n';
import { isIdioma, type Idioma } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { MAXIMO_ITENS } from '@/lib/carrinho';
import {
  COOKIE_CARRINHO,
  OPCOES_COOKIE_CARRINHO,
  carrinhoReaproveitavel,
  codigoCarrinhoValido,
  conferirEscolha,
  gravarCarrinho,
  itensQueValem,
  itensVisiveis,
  lerCarrinho,
  marcarCheckout,
  novoCodigoCarrinho,
  pedidoPagavel,
  sugestoesVisiveis,
  type CarrinhoGuardado,
} from '@/lib/carrinho-servidor';
import { SEM_CASAS, cruzaComAMesmaCasa, ehEscolhaCasa, type ContextoDasCasas } from '@/lib/casa-no-carrinho';
import { contextoDoCarrinho } from '@/lib/casas-carrinho';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';
import { soCampanha } from '@/lib/origem';
import { origemDaVisita } from '@/lib/origem-servidor';
import { casasAbertasPara } from '@/lib/reserva-casas';
import { emailValido } from '@/lib/validacao';
import { mensagemDoErro } from '@/lib/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEM_CACHE = { 'Cache-Control': 'no-store' };
const idiomaDe = (v: unknown): Idioma => (typeof v === 'string' && isIdioma(v) ? v : 'pt');

/** Até quantos itens um mesmo IP pode adicionar em 10 minutos (um cliente de verdade não passa de uns 20). */
const LIMITE_POR_IP = 60;
const JANELA_SEGUNDOS = 600;

/** O carrinho fica guardado 60 dias, só no cookie deste site (o mesmo do link dos lembretes, /api/carrinho/voltar). */
const OPCOES_COOKIE = OPCOES_COOKIE_CARRINHO;

type Loja = Awaited<ReturnType<typeof cookies>>;

/** O visitante tem o cookie do painel: no modo RESERVA_CASAS=admin, só ele reserva as casas. */
const ehAdmin = (loja: Loja) => sessaoValida(loja.get(COOKIE_ADMIN)?.value);

/**
 * As noites presas pelo próprio pedido do visitante, por casa (pelo slug): a página da casa as trata como livres para ele
 * (o "Mudar" depois de fechar o formulário da Stripe; crítica de 26/11, furo 9). Só as datas, nada do pedido.
 */
function noitesDoPedido(contexto: ContextoDasCasas): Record<string, string[]> | undefined {
  const lista = [...contexto.casas.entries()]
    .filter(([, c]) => c.proprias.length)
    .map(([slug, c]): [string, string[]] => [slug, [...c.proprias]]);
  return lista.length ? Object.fromEntries(lista) : undefined;
}

/**
 * O carrinho como o cliente vê. Enquanto o pedido que ele virou espera o pagamento na Stripe, os itens continuam
 * e `pedido` traz o código e o token para "continuar o pagamento". Pago (ou fechado), o cookie é apagado aqui: o
 * webhook da Stripe não alcança o navegador. `casasAbertas`: a reserva das casas vale para este visitante (o botão da
 * página da casa, que é estática, aparece para o admin no modo 'admin' por aqui). Com casa no carrinho, o contexto das
 * casas é lido antes de conferir (as noites ocupadas de agora, sem as do próprio pedido).
 */
async function resposta(loja: Loja, codigo: string | undefined, idioma: Idioma, lido?: CarrinhoGuardado) {
  const c = lido ?? (await lerCarrinho(codigo));
  if (c.pedidoId && !carrinhoReaproveitavel(c)) loja.delete(COOKIE_CARRINHO);
  const d = dicionario(idioma);
  const admin = ehAdmin(loja);
  const [contexto, casasAbertas] = await Promise.all([contextoDoCarrinho(c, { admin }), casasAbertasPara({ admin }).catch(() => false)]);
  const proprias = noitesDoPedido(contexto);
  return NextResponse.json(
    {
      ok: true,
      itens: itensVisiveis(c.itens, idioma, d, contexto),
      sugestoes: sugestoesVisiveis(c.itens, idioma, d, contexto),
      ...(c.pedido && pedidoPagavel(c.pedido.status) ? { pedido: c.pedido } : {}),
      casasAbertas,
      ...(proprias ? { noitesDoPedido: proprias } : {}),
    },
    { headers: SEM_CACHE },
  );
}

function falha(erro: string, status: number, e?: unknown, extra: Record<string, unknown> = {}) {
  if (e) console.error(`[carrinho] ${erro}: ${mensagemDoErro(e)}`);
  return NextResponse.json({ ok: false, erro, ...extra }, { status, headers: SEM_CACHE });
}

/** O carrinho do cliente, pelo cookie, com os textos e os preços no idioma. */
export async function GET(req: Request) {
  const idioma = idiomaDe(new URL(req.url).searchParams.get('idioma'));
  try {
    const loja = await cookies();
    return await resposta(loja, loja.get(COOKIE_CARRINHO)?.value, idioma);
  } catch (e) {
    return falha('banco', 503, e);
  }
}

/**
 * Adiciona um item (ou troca o que está sendo mudado): confere com as regras do checkout e grava. O carrinho é lido
 * ANTES de conferir (crítica de 26/11, furo 2): o contexto das casas nasce com os itens dele e a escolha nova, e assim a
 * primeira casa de um carrinho vazio ou só de passeio entra, e pôr um passeio num carrinho com casa mantém a casa. A
 * casa recusada pelas noites (a ocupada, o fim de semana, o pacote, o mínimo) volta com as noites ocupadas de agora
 * (`ocupadas`), para o calendário da página se atualizar. A mesma casa duas vezes com noites que se cruzam é
 * 'ja-no-carrinho' (nenhuma noite está ocupada: é a casa que já está no carrinho dele; revisão de 26/11, achado 10), menos
 * a que está sendo trocada no "Mudar".
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { escolha?: unknown; idioma?: unknown; substituir?: unknown } | null;
  const idioma = idiomaDe(corpo?.idioma);
  // o passeio e o transfer são conferidos antes de tudo, como sempre (não precisam do contexto das casas)
  if (!ehEscolhaCasa(corpo?.escolha)) {
    const antes = conferirEscolha(corpo?.escolha, SEM_CASAS);
    if (!antes.ok) return falha(antes.erro, 400);
  }
  try {
    // um robô não enche o banco de carrinhos: no máximo LIMITE_POR_IP itens por IP a cada 10 minutos
    if (!(await permitir(chaveDoLimite('carrinho', ipDaRequisicao(req.headers)), LIMITE_POR_IP, JANELA_SEGUNDOS)))
      return falha('limite', 429);
    const loja = await cookies();
    const cookie = loja.get(COOKIE_CARRINHO)?.value;
    const guardado = await lerCarrinho(cookie);
    const contexto = await contextoDoCarrinho(guardado, { admin: ehAdmin(loja), nova: corpo?.escolha });
    const conferida = conferirEscolha(corpo?.escolha, contexto);
    if (!conferida.ok) return falha(conferida.erro, 400, undefined, conferida.ocupadas ? { ocupadas: conferida.ocupadas } : {});
    // sem carrinho, ou o carrinho virou um pedido fechado: começa um novo (com o pedido ainda em aberto, continua no mesmo)
    const codigo = codigoCarrinhoValido(cookie) && carrinhoReaproveitavel(guardado) ? cookie : novoCodigoCarrinho();
    const atuais = itensQueValem(guardado.itens, contexto);
    const outros = atuais.filter((i) => i.id !== corpo?.substituir);
    if (
      conferida.escolha.tipo === 'casa' &&
      cruzaComAMesmaCasa(
        conferida.escolha,
        outros.map((i) => i.escolha),
      )
    ) {
      return falha('ja-no-carrinho', 400);
    }
    const novo = { id: randomUUID(), escolha: conferida.escolha };
    // o "Mudar" troca o item no mesmo lugar
    const lugar = atuais.findIndex((i) => i.id === corpo?.substituir);
    if (lugar < 0 && atuais.length >= MAXIMO_ITENS) return falha('cheio', 400);
    const itens = lugar < 0 ? [...atuais, novo] : atuais.map((i, n) => (n === lugar ? novo : i));
    await gravarCarrinho(codigo, { itens, idioma, origem: soCampanha(await origemDaVisita()) });
    loja.set(COOKIE_CARRINHO, codigo, OPCOES_COOKIE);
    return await resposta(loja, codigo, idioma);
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
    const loja = await cookies();
    const codigo = loja.get(COOKIE_CARRINHO)?.value;
    const atual = await lerCarrinho(codigo);
    if (codigo && atual.itens.some((i) => i.id === id)) await gravarCarrinho(codigo, { itens: atual.itens.filter((i) => i.id !== id) });
    return await resposta(loja, codigo, idioma);
  } catch (e) {
    return falha('banco', 503, e);
  }
}

/**
 * Guarda que o cliente abriu o checkout (para o funil das estatísticas) ou o e-mail que ele digitou lá
 * (para o lembrete do carrinho abandonado, src/lib/carrinho-lembretes.ts).
 */
export async function PATCH(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { email?: unknown; checkout?: unknown } | null;
  const abriuCheckout = corpo?.checkout === true;
  const email = typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase() : '';
  if (!abriuCheckout && !emailValido(email)) return falha('email', 400);
  try {
    const codigo = (await cookies()).get(COOKIE_CARRINHO)?.value;
    if (abriuCheckout) {
      await marcarCheckout(codigo);
    } else {
      const atual = await lerCarrinho(codigo);
      if (codigo && atual.itens.length && !atual.pedidoId) await gravarCarrinho(codigo, { email });
    }
    return NextResponse.json({ ok: true }, { headers: SEM_CACHE });
  } catch (e) {
    return falha('banco', 503, e);
  }
}

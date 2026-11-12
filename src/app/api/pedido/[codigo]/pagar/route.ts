import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { FORMAS_PAGAMENTO, formasDisponiveis, type FormaPagamento } from '@/lib/formas-pagamento';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';
import { podeAbrirSessao } from '@/lib/pagamento-stripe';
import { itensPagaveis, tokenConfere } from '@/lib/reserva-publica';
import { PedidoFechado, abrirSessaoDoPedido, vouchersDoPedido } from '../../pedido-stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Até quantas sessões novas um mesmo IP pode pedir em 10 minutos. */
const LIMITE_POR_IP = 20;
const JANELA_SEGUNDOS = 600;
const SEM_CACHE = { 'Cache-Control': 'no-store' };

const Esquema = z.object({
  /** O token do link privado do pedido. */
  t: z.string().min(1).max(64),
  forma: z.enum(FORMAS_PAGAMENTO as [FormaPagamento, ...FormaPagamento[]]),
});

function erro(campo: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, erro: campo, ...extra }, { status, headers: SEM_CACHE });
}

/**
 * Uma sessão de pagamento nova para um pedido que ainda não foi pago: "pagar de novo" depois de a sessão vencer,
 * ou "cartão recusado? pague com Pix". Exige o token do link privado (comparado em tempo constante); só para
 * pedido pendente ou expirado; a sessão anterior, se ainda aberta, é expirada assim que a nova fica gravada no
 * pedido (abrirSessaoDoPedido explica a ordem). Devolve o `clientSecret` do checkout embutido. O status não muda
 * aqui (um pedido expirado volta a pendente ao gravar a sessão nova); pago, só pelo webhook.
 * Erros: 400 dados, 404 'nao-encontrado' (sem pedido ou sem o token certo), 409 'status', 403 'forma' (com as
 * formas que ainda valem), 429 'limite', 502 'stripe'.
 */
export async function POST(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const r = Esquema.safeParse(await req.json().catch(() => null));
  if (!r.success) return erro(r.error.issues[0]?.path.join('.') || 'dados', 400);
  const agora = new Date();
  try {
    if (!(await permitir(chaveDoLimite('pagar', ipDaRequisicao(req.headers)), LIMITE_POR_IP, JANELA_SEGUNDOS, agora)))
      return erro('limite', 429);

    const vouchers = await vouchersDoPedido(codigo);
    const pedido = vouchers[0];
    // sem pedido ou sem o token certo, a resposta é a mesma: nada a dizer sobre o código
    if (!pedido || !tokenConfere(pedido, r.data.t)) return erro('nao-encontrado', 404);
    if (!podeAbrirSessao(pedido.status)) return erro('status', 409, { status: pedido.status });

    // as formas que ainda valem para estes itens (o interruptor, a Stripe e o prazo de cada forma: o Pix até 2 h antes do
    // primeiro item; o cartão até 30 minutos antes)
    const admin = sessaoValida((await cookies()).get(COOKIE_ADMIN)?.value);
    const formas = await formasDisponiveis(itensPagaveis(vouchers), agora, { admin });
    if (!formas.includes(r.data.forma)) return erro('forma', 403, { formas });

    const sessao = await abrirSessaoDoPedido(vouchers, r.data.forma, agora);
    return NextResponse.json(
      { ok: true, codigo: sessao.codigo, forma: sessao.forma, clientSecret: sessao.clientSecret },
      { headers: SEM_CACHE },
    );
  } catch (e) {
    // pago em outra aba (ou cancelado) enquanto a sessão nova nascia: a página do pedido mostra o estado de verdade
    if (e instanceof PedidoFechado) return erro('status', 409, { status: e.status });
    console.error(`[pagar] a sessão de pagamento do pedido ${codigo} não pôde ser criada: ${e instanceof Error ? e.message : String(e)}`);
    return erro('stripe', 502);
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desistenciaPedida, limparMotivo, linhaDaDesistencia, podeDesistir } from '@/lib/desistencia';
import { agendarAvisosDaDesistencia } from '@/lib/email/pedidos';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';
import { tokenConfere } from '@/lib/reserva-publica';
import { atualizarReserva, registrar } from '@/lib/reservas';
import { vouchersDoPedido } from '../../pedido-stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// os dois e-mails (o do cliente e o da equipe) saem depois da resposta, no tempo que sobra da função
export const maxDuration = 30;

/** Até quantos pedidos de desistência um mesmo IP manda em 10 minutos (um por pedido basta; o resto é robô). */
const LIMITE_POR_IP = 10;
const JANELA_SEGUNDOS = 600;
const SEM_CACHE = { 'Cache-Control': 'no-store' };

const Esquema = z.object({
  /** O token do link privado do pedido. */
  t: z.string().min(1).max(64),
  /** O motivo, se o cliente quiser dizer: vai para o histórico numa linha só, cortado em 500 letras, entre « ». */
  motivo: z.string().max(2000).optional(),
});

function erro(campo: string, status: number) {
  return NextResponse.json({ ok: false, erro: campo }, { status, headers: SEM_CACHE });
}

/**
 * O pedido de desistência da compra pelo próprio site (Decreto 7.962/2013, art. 5º, § 1º; src/lib/desistencia.ts).
 * Exige o token do link privado (comparado em tempo constante); só para pedido pago pela Stripe cujo primeiro serviço
 * ainda não começou. Grava no histórico do pedido a linha de aviso (o painel destaca e conta no topo), responde na
 * hora e, só na primeira vez, manda depois da resposta (§ 4º: confirmação imediata do recebimento) o e-mail ao cliente,
 * no endereço do pedido, com a data e a hora do recebimento, e o aviso à equipe (EMAIL_RESPOSTA). Sem RESEND_API_KEY, os
 * e-mails não saem, e ficam a confirmação na tela e a faixa do painel. Não reembolsa nada: a equipe responde por e-mail
 * e reembolsa pela política de cancelamento. Um pedido de desistência só: o repetido responde 200 com `repetido: true`,
 * não grava de novo e não manda e-mail.
 * Erros: 400 dados, 404 'nao-encontrado' (sem pedido ou sem o token certo), 409 'status' (não foi pago pela Stripe, ou
 * o primeiro serviço já começou), 429 'limite', 503 'banco'.
 */
export async function POST(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const r = Esquema.safeParse(await req.json().catch(() => null));
  if (!r.success) return erro(r.error.issues[0]?.path.join('.') || 'dados', 400);
  const agora = new Date();
  try {
    if (!(await permitir(chaveDoLimite('desistir', ipDaRequisicao(req.headers)), LIMITE_POR_IP, JANELA_SEGUNDOS, agora)))
      return erro('limite', 429);

    const vouchers = await vouchersDoPedido(codigo);
    const pedido = vouchers[0];
    // sem pedido ou sem o token certo, a resposta é a mesma: nada a dizer sobre o código
    if (!pedido || !tokenConfere(pedido, r.data.t)) return erro('nao-encontrado', 404);
    if (desistenciaPedida(pedido)) return NextResponse.json({ ok: true, repetido: true }, { headers: SEM_CACHE });
    if (!podeDesistir(vouchers, agora)) return erro('status', 409);

    // o prazo dos 7 dias conta da compra: o pagamento (ou, sem a data dele, a criação do pedido)
    const linha = linhaDaDesistencia(r.data.motivo, { compraEm: pedido.pagamento.pagoEm ?? pedido.criadaEm, agora });
    const trava = { repetido: false };
    await atualizarReserva(pedido.codigo, (atual) => {
      // dois envios quase juntos: o segundo relê o pedido, acha a linha do primeiro e não grava de novo
      if (desistenciaPedida(atual)) {
        trava.repetido = true;
        return null;
      }
      return registrar(atual, linha);
    });
    const codigoDoPedido = pedido.pedido?.codigo ?? pedido.codigo;
    if (!trava.repetido) {
      // só o código no registro do servidor: o motivo (escrito pelo cliente) fica no histórico do pedido
      console.info(`[desistir] pedido de desistência recebido: ${codigoDoPedido}`);
      agendarAvisosDaDesistencia(codigoDoPedido, limparMotivo(r.data.motivo));
    }
    return NextResponse.json({ ok: true, ...(trava.repetido ? { repetido: true } : {}) }, { headers: SEM_CACHE });
  } catch (e) {
    console.error(`[desistir] o pedido de desistência do pedido ${codigo} não foi gravado: ${e instanceof Error ? e.message : String(e)}`);
    return erro('banco', 503);
  }
}

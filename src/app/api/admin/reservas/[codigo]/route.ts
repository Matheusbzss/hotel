import { NextResponse } from 'next/server';
import { pedidoRecusado } from '@/lib/admin-auth';
import { avisarCompra } from '@/lib/avisar-compra';
import { formatarCifra } from '@/lib/cifra';
import { agendarEmailDoPedido } from '@/lib/email/pedidos';
import { valorDoItem } from '@/lib/formas-pagamento';
import { podeMudar } from '@/lib/pagamento-stripe';
import type { ErroDoPainel } from '@/lib/pedidos-painel';
import { atualizarReserva, provedorDaReserva, registrar, type MetodoPagamento, type StatusReserva } from '@/lib/reservas';
import { criarReembolso, reembolsosDoPagamento } from '@/lib/stripe';
import { cancelarPedidoAberto, vouchersDoPedido } from '../../../pedido/pedido-stripe';
import { reembolsoEmVigor } from '../../../webhooks/stripe/eventos';

export const runtime = 'nodejs';

/**
 * As ações manuais do painel, para os pedidos do WhatsApp e os antigos: a equipe cobra fora do site e marca aqui.
 * Num pedido da Stripe nenhuma delas marca pago: o status vem do webhook.
 */
const ACOES_MANUAIS: Record<string, { status: StatusReserva; evento: string; metodo?: MetodoPagamento }> = {
  marcar_pago: { status: 'pago', evento: 'Marcada como paga no admin' },
  // no WhatsApp, a forma de pagamento só se decide agora: ela define quanto entrou
  pago_pix: { status: 'pago', evento: 'Marcada como paga no Pix, no admin', metodo: 'pix' },
  pago_cartao: { status: 'pago', evento: 'Marcada como paga no cartão, no admin', metodo: 'cartao' },
  cancelar: { status: 'cancelado', evento: 'Cancelada no admin' },
  reembolsado: { status: 'reembolsado', evento: 'Marcada como reembolsada no admin (fora da Stripe)' },
};

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * As ações do painel sobre um pedido (o código pode ser o do pedido ou o de qualquer voucher dele):
 * - 'reembolsar' (total) e 'reembolsar_item' (um voucher, pelo valor do item na forma paga) pedem o reembolso à
 *   Stripe e só registram o pedido no histórico: o status muda quando o webhook charge.refunded confirmar;
 * - num pedido da Stripe, marcar pago é recusado, cancelar só vale enquanto ninguém pagou (a sessão é
 *   expirada) e "marcar reembolsado" só depois de pago (a devolução feita por outro meio); as ações manuais
 *   continuam valendo para os pedidos do WhatsApp e os antigos.
 * Os botões do painel mandam o código do voucher no endereço; no 'reembolsar_item', é ele o voucher devolvido.
 * Quem clica é uma pessoa, num formulário: toda ação recusada volta para o painel com ?erro= e um código curto,
 * que a página troca por uma frase fixa na faixa vermelha (ERROS_DO_PAINEL; nunca o texto que veio no endereço,
 * nem uma resposta em JSON, que o navegador abriria como texto cru). O que a Stripe respondeu fica só no registro
 * do servidor. Só a falta de login responde de outro jeito (pedidoRecusado).
 */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/reservas/[codigo]'>) {
  const recusa = await pedidoRecusado(req);
  if (recusa) return recusa;
  const { codigo } = await ctx.params;
  const form = await req.formData();
  const acao = String(form.get('acao'));
  const filtro = form.get('filtro');
  const voltar = (erro?: ErroDoPainel) => {
    const volta = new URL('/admin', req.url);
    if (filtro) volta.searchParams.set('status', String(filtro));
    if (erro) volta.searchParams.set('erro', erro);
    return NextResponse.redirect(volta, 303);
  };

  // o status, o pagamento e o histórico do pedido ficam no voucher que o representa (o primeiro da viagem): é o que
  // o webhook e a consulta à Stripe atualizam, qualquer que seja o voucher no endereço
  const vouchers = await vouchersDoPedido(codigo);
  const alvo = vouchers[0];
  if (!alvo) return voltar('nao-encontrado');
  const daStripe = provedorDaReserva(alvo) === 'stripe';
  const codigoDoPedido = alvo.pedido?.codigo ?? alvo.codigo;

  if (acao === 'reembolsar' || acao === 'reembolsar_item') {
    if (!daStripe || !alvo.paymentIntentId) return voltar('sem-pagamento-stripe');
    if (!podeMudar(alvo.status, 'reembolsado')) return voltar('status-nao-reembolsa');
    try {
      if (acao === 'reembolsar') {
        const re = await criarReembolso(alvo.paymentIntentId);
        await atualizarReserva(alvo.codigo, (r) =>
          registrar(r, `Reembolso total (${cifra(re.amount)}) solicitado na Stripe (${re.id}): o status muda quando a Stripe confirmar`),
        );
        return voltar();
      }
      // o voucher vem no campo "voucher" ou, como nos botões do painel, no próprio endereço (/api/admin/reservas/<voucher>)
      const voucher = String(form.get('voucher') || codigo).trim();
      const item = vouchers.find((v) => v.codigo === voucher);
      if (!item) return voltar('voucher-de-fora');
      if (item.statusItem === 'reembolsado' || item.statusItem === 'cancelado') return voltar('item-ja-devolvido');
      // o valor do item na forma em que o pedido foi pago (no Pix, com o desconto; na casa, o sinal)
      const forma = alvo.pagamento.metodo === 'pix' ? 'pix' : 'cartao';
      const centavos = valorDoItem(
        { tipo: item.tipo ?? 'passeio', totalCentavos: item.totalCentavos, totalPixCentavos: item.totalPixCentavos },
        forma,
      );
      // um reembolso deste item já em vigor na Stripe (concluído ou ainda a caminho): não se devolve duas vezes. A
      // chave de idempotência da Stripe só protege por 24 horas; o reembolso que falhou deixa o botão livre
      const reembolsos = await reembolsosDoPagamento(alvo.paymentIntentId);
      if (reembolsos.some((feito) => feito.metadata?.referencia === voucher && reembolsoEmVigor(feito.status))) {
        return voltar('item-com-reembolso');
      }
      const re = await criarReembolso(alvo.paymentIntentId, centavos, voucher);
      await atualizarReserva(alvo.codigo, (r) =>
        registrar(
          r,
          `Reembolso do item ${voucher} (${cifra(re.amount)}) solicitado na Stripe (${re.id}): o item muda quando a Stripe confirmar`,
        ),
      );
      return voltar();
    } catch (e) {
      console.error(`[admin] o reembolso do pedido ${codigoDoPedido} falhou: ${mensagem(e)}`);
      return voltar('stripe-falhou');
    }
  }

  const manual = ACOES_MANUAIS[acao];
  if (!manual) return voltar('acao-desconhecida');
  if (daStripe) {
    // o pagamento online só vira pago pelo webhook da Stripe, nunca à mão
    if (manual.status === 'pago') return voltar('so-pelo-aviso');
    if (manual.status === 'cancelado') {
      const r = await cancelarPedidoAberto(codigoDoPedido, 'Cancelado no admin');
      // já pago: cancelar não devolve o dinheiro; o caminho é o reembolso
      if (r && r.status !== 'cancelado') return voltar('ja-pago');
      return voltar();
    }
    // "reembolsado à mão" num pedido da Stripe só depois de pago: é a devolução feita por outro meio (o reembolso
    // na Stripe falhou, por exemplo); antes disso não há o que devolver
    if (!podeMudar(alvo.status, manual.status)) return voltar('acao-nao-vale');
  }

  let virouPago = false;
  const atualizada = await atualizarReserva(alvo.codigo, (r) => {
    virouPago = manual.status === 'pago' && r.status !== 'pago';
    r.status = manual.status;
    // quem cobrou continua sendo a equipe: sem isto, anotar "Pix" ou "cartão" numa reserva do WhatsApp fazia o
    // painel mostrar o checkout antigo, que é o que uma forma online sem provedor gravado quer dizer
    if (provedorDaReserva(r) === 'whatsapp') r.provedor = 'whatsapp';
    if (manual.metodo) r.pagamento.metodo = manual.metodo;
    if (manual.status === 'pago' && !r.pagamento.pagoEm) r.pagamento.pagoEm = new Date().toISOString();
    return registrar(r, manual.evento);
  });
  if (virouPago && atualizada) {
    await avisarCompra(atualizada);
    // o e-mail do pagamento aprovado, com os vouchers (Etapa 6), depois da resposta; uma vez só por pedido
    agendarEmailDoPedido('pagamento-aprovado', codigoDoPedido);
  }
  return voltar();
}

import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { pedidoRecusado } from '@/lib/admin-auth';
import { avisarCompra } from '@/lib/avisar-compra';
import { formatarCifra } from '@/lib/cifra';
import { desistenciaParaResponder, desistenciaRespondida, linhaDaDesistenciaRespondida } from '@/lib/desistencia';
import { agendarEmailDoPedido } from '@/lib/email/pedidos';
import { valorDoItem } from '@/lib/formas-pagamento';
import { podeMudar } from '@/lib/pagamento-stripe';
import {
  valorDoVoucherPorFora,
  valorRecebido,
  voucherAtivo,
  voucherCabeNoQueResta,
  voucherPago,
  type ErroDoPainel,
} from '@/lib/pedidos-painel';
import {
  inicioDoReembolsoResolvido,
  linhaDaDevolucaoPorOutroMeio,
  linhaDoReembolsoSemMudarVoucher,
  linhaDoVoucherDevolvidoPorOutroMeio,
  linhaDoVoucherLigado,
  reembolsosFalhos,
  reembolsosSemVoucher,
  vouchersDevolvidosPorOutroMeio,
} from '@/lib/reembolsos-a-resolver';
import {
  atualizarItem,
  atualizarReserva,
  provedorDaReserva,
  registrar,
  type MetodoPagamento,
  type Reserva,
  type StatusReserva,
} from '@/lib/reservas';
import { criarReembolso, reembolsosDoPagamento } from '@/lib/stripe';
import { cancelarPedidoAberto, vouchersDoPedido } from '../../../pedido/pedido-stripe';
import {
  avisosDeReembolsoSemVoucher,
  reembolsoEmVigor,
  reembolsosForaDoSite,
  stripeDevolveuMenos,
  type ReembolsoForaDoSite,
} from '../../../webhooks/stripe/eventos';

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

/** O valor de um voucher na forma em que o pedido foi pago (no Pix, com o desconto; na casa, o sinal). */
const valorDoVoucher = (pedido: Reserva, item: Reserva): number =>
  valorDoItem(
    { tipo: item.tipo ?? 'passeio', totalCentavos: item.totalCentavos, totalPixCentavos: item.totalPixCentavos },
    pedido.pagamento.metodo === 'pix' ? 'pix' : 'cartao',
  );

/** O reembolso feito direto na Stripe sem voucher (a linha de aviso no histórico) ainda espera a resposta da equipe. */
const semVoucherAberto = (pedido: Pick<Reserva, 'historico'>, id: string): boolean =>
  reembolsosSemVoucher(pedido.historico).some((s) => s.id === id && !s.resolvido);

/**
 * Os reembolsos em vigor que o site não pediu (feitos direto na Stripe, na lista relida agora) e que a equipe ainda não
 * ligou a um voucher nem anotou como desconto (o pedido reembolsado inteiro também os resolve: reembolsosSemVoucher).
 */
function reembolsosSemDono(reembolsos: Stripe.Refund[], vouchers: readonly Reserva[], pedido: Reserva): ReembolsoForaDoSite[] {
  const resolvido = (id: string) =>
    reembolsosSemVoucher(pedido.historico).some((s) => s.id === id && s.resolvido) ||
    pedido.historico.some((h) => h.evento.startsWith(inicioDoReembolsoResolvido(id)));
  const codigos = vouchers.map((v) => v.codigo);
  return reembolsosForaDoSite(reembolsos, codigos).filter((f) => !resolvido(f.reembolsoId));
}

/**
 * As ações do painel sobre um pedido (o código pode ser o do pedido ou o de qualquer voucher dele):
 * - 'reembolsar' (total) e 'reembolsar_item' (um voucher, pelo valor inteiro do item na forma paga, e só quando ele
 *   cabe no que ainda resta do pagamento: voucherCabeNoQueResta, a mesma regra do botão do painel) pedem o reembolso à
 *   Stripe e só registram o pedido no histórico: o status muda quando o webhook charge.refunded confirmar. Antes de
 *   qualquer pedido à Stripe: o pedido contestado é recusado (contestado-nao-reembolsa); a caixa "Confirmo" tem de vir
 *   marcada (falta-confirmar); no 'reembolsar_item', antes de qualquer chamada à Stripe, o voucher é conferido: sem nada
 *   a devolver deste pagamento, nada-a-devolver; o voucher que vale mais do que resta, voucher-maior-que-o-resto
 *   (devolver só ele levaria tudo o que resta, e a Stripe trataria como reembolso total, invalidando todos os vouchers:
 *   quem quer isso usa "Reembolsar tudo"); depois, os reembolsos do pagamento são relidos na Stripe e, com MENOS
 *   devolvido lá do que o pedido registra (um reembolso falhou ou foi cancelado), nada é pedido (stripe-devolveu-menos).
 *   No 'reembolsar_item', um reembolso de parte feito direto na Stripe, sem voucher e sem resposta da equipe, também
 *   segura (as linhas de aviso que faltam são gravadas antes da resposta reembolso-sem-voucher). A Stripe que recusa um
 *   pagamento contestado (charge_disputed: o aviso da contestação ainda não chegou) volta como contestado-nao-reembolsa;
 * - os reembolsos que a equipe resolve sem chamar a Stripe (16/11), nenhum devolve dinheiro: 'devolvido_por_fora' (o
 *   reembolso que falhou já foi devolvido por outro meio: só a linha que fecha o aviso), 'voucher_por_fora' (depois de
 *   uma falha, um voucher ainda pago devolvido por outro meio: o valor entra no que voltou, o voucher deixa de valer e,
 *   sem voucher pago sobrando, o pedido vira reembolsado), 'voucher_da_stripe' (o reembolso feito direto na Stripe sem
 *   voucher era deste voucher: ele deixa de valer, sem novo reembolso) e 'reembolso_sem_voucher' (era um desconto: só
 *   a linha). As três primeiras pedem a caixa "Confirmo";
 * - num pedido da Stripe, marcar pago é recusado, cancelar só vale enquanto ninguém pagou (a sessão é
 *   expirada) e "marcar reembolsado" continua sem botão no painel e só vale depois de pago. Ela NÃO é o caminho do
 *   reembolso que falhou: invalida todos os vouchers e não soma o valor devolvido (como no ON-A8RVZN); esse caminho é
 *   'devolvido_por_fora' e 'voucher_por_fora'. As ações manuais continuam valendo para os pedidos do WhatsApp e os
 *   antigos;
 * - 'desistencia_respondida': o pedido de desistência pelo site foi respondido (src/lib/desistencia.ts), sem reembolso
 *   ou com o resto do pedido seguindo pago depois do reembolso de uma parte: só a linha no histórico, que tira o pedido
 *   da faixa do topo.
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
  // a caixa "Confirmo" dos botões que devolvem dinheiro ou tiram a validade de um voucher (decisão do dono de 16/11): o
  // navegador não envia o formulário sem ela marcada, e a rota confere de novo
  const confirmou = form.get('confirmo') === 'sim';
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
    // com a contestação aberta o reembolso não é feito pelo site: a Stripe recusa o pagamento contestado, e no pedido de
    // informação do banco a equipe decide no painel dela
    if (alvo.status === 'contestado') return voltar('contestado-nao-reembolsa');
    if (!podeMudar(alvo.status, 'reembolsado')) return voltar('status-nao-reembolsa');
    if (!confirmou) return voltar('falta-confirmar');
    // o que ainda resta do pagamento: o que entrou menos o que já voltou ou tem de voltar (a conta do painel); sem nada a
    // devolver, a recusa do voucher vem antes de qualquer chamada à Stripe
    const restante = vouchers.reduce((soma, v) => soma + valorRecebido(v), 0) - (alvo.reembolsoCentavos ?? 0);
    if (acao === 'reembolsar_item' && restante <= 0) return voltar('nada-a-devolver');
    // o reembolso de um voucher só: o voucher vem no campo "voucher" ou, como nos botões do painel, no próprio endereço
    // (/api/admin/reservas/<voucher>), e é conferido aqui, antes de qualquer chamada à Stripe
    const voucher = String(form.get('voucher') || codigo).trim();
    const item = vouchers.find((v) => v.codigo === voucher);
    // o valor inteiro do voucher na forma paga: nunca limitado ao que resta (a regra do botão "Reembolsar só o voucher …")
    const centavos = item ? valorDoVoucher(alvo, item) : 0;
    if (acao === 'reembolsar_item') {
      if (!item) return voltar('voucher-de-fora');
      if (item.statusItem === 'reembolsado' || item.statusItem === 'cancelado') return voltar('item-ja-devolvido');
      if (centavos <= 0) return voltar('nada-a-devolver');
      // o voucher que vale mais do que resta: devolver só ele levaria tudo o que resta, a Stripe trataria como reembolso
      // total e o pedido inteiro, com todos os vouchers, passaria a reembolsado. No ON-4KPC6F do teste de 15/11 (R$ 396,00
      // pagos e R$ 308,00 já devolvidos), pedir os R$ 242,00 do voucher fez a Stripe recusar com um erro genérico, e
      // pedir só os R$ 88,00 que restavam invalidaria os dois vouchers. Quem quer isso usa "Reembolsar tudo"
      if (!voucherCabeNoQueResta(centavos, restante)) return voltar('voucher-maior-que-o-resto');
    }
    try {
      // os reembolsos do pagamento relidos na Stripe, antes de qualquer pedido novo: com MENOS devolvido lá do que o
      // pedido registra (um reembolso falhou ou foi cancelado), o site não pede outro. "Reembolsar tudo" vai à Stripe
      // sem valor, e devolveria mais do que o painel mostra
      const reembolsos = await reembolsosDoPagamento(alvo.paymentIntentId);
      if (stripeDevolveuMenos(reembolsos, alvo.reembolsoCentavos ?? 0)) return voltar('stripe-devolveu-menos');
      if (acao === 'reembolsar') {
        const re = await criarReembolso(alvo.paymentIntentId);
        await atualizarReserva(alvo.codigo, (r) =>
          registrar(r, `Reembolso total (${cifra(re.amount)}) solicitado na Stripe (${re.id}): o status muda quando a Stripe confirmar`),
        );
        return voltar();
      }
      // um reembolso deste item já em vigor na Stripe (concluído ou ainda a caminho): não se devolve duas vezes. A
      // chave de idempotência da Stripe só protege por 24 horas; o reembolso que falhou deixa o botão livre
      if (reembolsos.some((feito) => feito.metadata?.referencia === voucher && reembolsoEmVigor(feito.status))) {
        return voltar('item-com-reembolso');
      }
      // um reembolso de parte feito direto na Stripe, sem dizer de qual voucher e ainda sem resposta da equipe, pode ter
      // sido deste: nada sai antes de a equipe dizer de qual foi. A lista relida vale mesmo sem o aviso do charge.refunded
      // no pedido: as linhas de aviso que faltam são gravadas agora (com a conferência dentro da trava), e a faixa e os
      // botões "Foi o voucher …" aparecem quando o painel volta
      const semDono = vouchers.length > 1 ? reembolsosSemDono(reembolsos, vouchers, alvo) : [];
      if (semDono.length) {
        await atualizarReserva(alvo.codigo, (r) => {
          const faltam = avisosDeReembolsoSemVoucher(r, { doPedido: true, total: false, foraDoSite: semDono }, vouchers.length);
          if (!faltam.length) return null;
          for (const linha of faltam) registrar(r, linha);
          return r;
        });
        return voltar('reembolso-sem-voucher');
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
      // a cobrança já foi contestada na Stripe e o aviso da contestação ainda não chegou ao site: a Stripe recusa
      if (e instanceof Stripe.errors.StripeError && e.code === 'charge_disputed') {
        console.error(`[admin] o reembolso do pedido ${codigoDoPedido} foi recusado: o pagamento está contestado na Stripe`);
        return voltar('contestado-nao-reembolsa');
      }
      console.error(`[admin] o reembolso do pedido ${codigoDoPedido} falhou: ${mensagem(e)}`);
      return voltar('stripe-falhou');
    }
  }

  // o pedido de desistência pelo site respondido pela equipe: sem reembolso (a política não devolve) ou com o resto do
  // pedido seguindo pago depois do reembolso de uma parte. Só a linha no histórico, que tira o pedido da faixa do topo do
  // painel; o status e o pagamento não mudam. A regra é a da faixa (os vouchers do pedido: sobra pelo menos um pago), e a
  // linha leva o valor já devolvido relido dentro da trava; repetir não grava de novo
  if (acao === 'desistencia_respondida') {
    if (!desistenciaParaResponder(vouchers)) return voltar('acao-nao-vale');
    await atualizarReserva(alvo.codigo, (r) =>
      desistenciaRespondida(r) ? null : registrar(r, linhaDaDesistenciaRespondida(r.reembolsoCentavos ?? 0)),
    );
    return voltar();
  }

  // um reembolso que falhou na Stripe e que a equipe já devolveu por outro meio: só a linha que fecha o aviso. O status,
  // o voucher e o valor devolvido não mudam (o valor que falhou já está contado). Repetir não grava de novo: a
  // conferência é dentro da trava de versão
  if (acao === 'devolvido_por_fora') {
    const id = String(form.get('reembolso') ?? '');
    if (!daStripe || !reembolsosFalhos(alvo.historico).some((f) => f.id === id)) return voltar('acao-nao-vale');
    if (!confirmou) return voltar('falta-confirmar');
    await atualizarReserva(alvo.codigo, (r) => {
      const falho = reembolsosFalhos(r.historico).find((f) => f.id === id);
      return falho && !falho.devolvido ? registrar(r, linhaDaDevolucaoPorOutroMeio(falho)) : null;
    });
    return voltar();
  }

  // depois de um reembolso que falhou o site não pede outro à Stripe: um voucher ainda pago que a equipe devolveu por
  // outro meio deixa de valer aqui. Primeiro a gravação com trava, que soma o valor uma vez só (o do voucher, nunca mais
  // do que resta do pagamento) com a linha e, sem voucher pago sobrando, leva o pedido a reembolsado; depois o voucher.
  // Se a função for cortada entre as duas, o segundo clique completa sem somar de novo
  if (acao === 'voucher_por_fora') {
    if (!daStripe || alvo.status !== 'pago' || !reembolsosFalhos(alvo.historico).length) return voltar('acao-nao-vale');
    const voucher = String(form.get('voucher') ?? '').trim();
    const item = vouchers.find((v) => v.codigo === voucher);
    if (!item) return voltar('voucher-de-fora');
    if (!voucherPago(item)) return voltar('item-ja-devolvido');
    // um reembolso feito direto na Stripe sem voucher pode ter sido deste: primeiro a equipe diz de qual foi
    if (vouchers.length > 1 && reembolsosSemVoucher(alvo.historico).some((s) => !s.resolvido)) return voltar('reembolso-sem-voucher');
    const valor = valorDoVoucher(alvo, item);
    const recebido = vouchers.reduce((soma, v) => soma + valorRecebido(v), 0);
    // nada mais a devolver deste pagamento: não há o que registrar (a não ser completar o voucher já gravado)
    const jaGravado = vouchersDevolvidosPorOutroMeio(alvo.historico).some((v) => v.voucher === voucher);
    if (!jaGravado && valorDoVoucherPorFora(valor, recebido - (alvo.reembolsoCentavos ?? 0)) <= 0) return voltar('acao-nao-vale');
    if (!confirmou) return voltar('falta-confirmar');
    const ultimo = !vouchers.some((v) => v.codigo !== voucher && voucherPago(v));
    // num objeto, e não numa variável solta, para o TypeScript não achar que o valor nunca muda (ele muda lá dentro)
    const gravado: { linha?: boolean } = {};
    await atualizarReserva(alvo.codigo, (r) => {
      gravado.linha = vouchersDevolvidosPorOutroMeio(r.historico).some((v) => v.voucher === voucher);
      if (gravado.linha || r.status !== 'pago') return null;
      const centavos = valorDoVoucherPorFora(valor, recebido - (r.reembolsoCentavos ?? 0));
      if (centavos <= 0) return null;
      r.reembolsoCentavos = (r.reembolsoCentavos ?? 0) + centavos;
      if (ultimo && podeMudar(r.status, 'reembolsado')) r.status = 'reembolsado';
      gravado.linha = true;
      return registrar(r, linhaDoVoucherDevolvidoPorOutroMeio(voucher, centavos));
    });
    if (gravado.linha) await atualizarItem(voucher, 'reembolsado', `Item ${voucher} marcado como devolvido no painel (por outro meio)`);
    return voltar();
  }

  // o reembolso de parte feito direto na Stripe, sem dizer de qual voucher: a equipe diz de qual foi. O voucher deixa de
  // valer, sem novo reembolso e sem mudar o valor devolvido (o dinheiro já foi contado quando o aviso chegou)
  if (acao === 'voucher_da_stripe') {
    const id = String(form.get('reembolso') ?? '');
    const voucher = String(form.get('voucher') ?? '').trim();
    if (!daStripe || alvo.status !== 'pago' || !semVoucherAberto(alvo, id)) return voltar('acao-nao-vale');
    const item = vouchers.find((v) => v.codigo === voucher);
    if (!item) return voltar('voucher-de-fora');
    // só o voucher ativo, como os botões do painel (o usado já aconteceu: aí é um desconto)
    if (!voucherAtivo(item)) return voltar(voucherPago(item) ? 'acao-nao-vale' : 'item-ja-devolvido');
    if (!confirmou) return voltar('falta-confirmar');
    await atualizarItem(voucher, 'reembolsado', linhaDoVoucherLigado(id, voucher));
    return voltar();
  }

  // ... ou que nenhum voucher muda (foi um desconto): só a linha, uma vez
  if (acao === 'reembolso_sem_voucher') {
    const id = String(form.get('reembolso') ?? '');
    if (!daStripe || alvo.status !== 'pago' || !semVoucherAberto(alvo, id)) return voltar('acao-nao-vale');
    await atualizarReserva(alvo.codigo, (r) => (semVoucherAberto(r, id) ? registrar(r, linhaDoReembolsoSemMudarVoucher(id)) : null));
    return voltar();
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
    // "reembolsado à mão" num pedido da Stripe continua sem botão no painel e só vale depois de pago (antes disso não há
    // o que devolver). NÃO é o caminho do reembolso que falhou: invalida todos os vouchers e não soma o valor devolvido
    // (como no ON-A8RVZN); esse caminho é 'devolvido_por_fora' e 'voucher_por_fora'
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

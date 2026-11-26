import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { pedidoRecusado, segredoDoPainelCriado } from '@/lib/admin-auth';
import { avisarCompra } from '@/lib/avisar-compra';
import {
  alcanceDoEmail,
  aplicarCancelamento,
  cancelamentoJaFeito,
  cancelamentosDosVouchers,
  conferirNaTrava,
  linhaDaTravaDosSeteDias,
  motivoCombinaComAData,
  motivoDoFormulario,
  planoDoCancelamento,
  registroDoCancelamento,
  travaDaDesistencia,
  voucherACompletar,
  vouchersACompletar,
  type ConferenciaNaTrava,
  type EscolhaDoCancelamento,
} from '@/lib/cancelar-sem-reembolso';
import { calendarioMudou } from '@/lib/casas';
import { desistenciaParaResponder, desistenciaRespondida, linhaDaDesistenciaRespondida } from '@/lib/desistencia';
import {
  agendarAvisoDoPedidoPago,
  agendarEmailDoCancelamento,
  agendarEmailDoPedido,
  agendarEmailDoReembolso,
  agendarEmailSemReembolso,
} from '@/lib/email/pedidos';
import { valorDoItem } from '@/lib/formas-pagamento';
import { interpretarSessao, pedidoPago, podeMudar, reativarPedidoRetido } from '@/lib/pagamento-stripe';
import {
  acaoDoRetidoOferecida,
  acaoDoRetidoRepetida,
  acaoManualOferecida,
  acaoManualPedeConfirmacao,
  acaoManualRepetida,
  buscaDoPainel,
  concluirDevolucaoDoRetido,
  desfazerDevolucaoDoRetido,
  irmaosAindaCancelados,
  linhaDaReativacao,
  marcaOVoucherPorFora,
  marcarDevolucaoDoRetido,
  pagoPeloRetidoReativado,
  pedidoNuncaPago,
  reativarRetidoEscondido,
  recebidoDoPedido,
  ultimoVoucherDoPedido,
  valorDoVoucherPorFora,
  voltaAoPainel,
  voucherAtivo,
  voucherCabeNoQueResta,
  voucherDaStripeAindaLiga,
  voucherPago,
  type ErroDoPainel,
} from '@/lib/pedidos-painel';
import {
  horaDoVoucherDevolvidoPorOutroMeio,
  inicioDoReembolsoResolvido,
  linhaDaDevolucaoPorOutroMeio,
  linhaDoReembolsoSemMudarVoucher,
  linhaDoReembolsoSolicitado,
  linhaDoVoucherDevolvidoPorOutroMeio,
  linhaDoVoucherLigado,
  reembolsoNoHistorico,
  reembolsosFalhos,
  reembolsosSemVoucher,
  vouchersDevolvidosPorOutroMeio,
} from '@/lib/reembolsos-a-resolver';
import { linhaDoCancelamento } from '@/lib/email/marcas';
import { hotelDoPainel, passoDoHotel } from '@/lib/hospedagem';
import { transferenciaDoPixOferecida } from '@/lib/resumo-do-painel';
import {
  atualizarItem,
  atualizarReserva,
  ehCasa,
  ehPasseio,
  ehTransfer,
  provedorDaReserva,
  registrar,
  type MetodoPagamento,
  type Reserva,
  type StatusReserva,
} from '@/lib/reservas';
import { criarReembolso, obterSessao, reembolsosDoPagamento } from '@/lib/stripe';
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

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * O valor de um voucher na forma em que o pedido foi pago (no Pix, com o desconto; na casa, o sinal GUARDADO na compra:
 * crítica de 26/11, furo 19, para o reembolso de um voucher nunca passar do sinal pago, mesmo se a regra do sinal mudar).
 */
const valorDoVoucher = (pedido: Reserva, item: Reserva): number =>
  valorDoItem(
    {
      tipo: item.tipo ?? 'passeio',
      totalCentavos: item.totalCentavos,
      totalPixCentavos: item.totalPixCentavos,
      ...(ehCasa(item) ? { sinalCentavos: item.sinalCentavos, sinalPixCentavos: item.sinalPixCentavos } : {}),
    },
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
 * "Devolver R$ … ao cliente" no pedido cancelado com o pagamento parado (Pacote 22). Três passos, para o duplo toque e a
 * aba antiga não gravarem nada e as duas ações se excluírem: (1) dentro da trava, a marca da decisão de devolver ANTES de
 * pedir à Stripe (marcarDevolucaoDoRetido: a reativação deixa de valer); (2) o reembolso do pagamento inteiro, com a
 * chave de idempotência dos outros reembolsos (criarReembolso, referência "total"), ou o que já existe na Stripe com essa
 * referência; (3) dentro da trava, o id do reembolso e a linha do pedido à Stripe, uma vez (concluirDevolucaoDoRetido). Se
 * a Stripe não devolver, a marca sai e o pedido volta à escolha. O pedido continua cancelado; o resto é como nos outros
 * reembolsos: o charge.refunded confirma, e o refund.failed leva ao "Falta devolver …". Devolve o erro do painel, ou null.
 */
async function devolverPagamentoRetido(alvo: Reserva, codigoDoPedido: string): Promise<ErroDoPainel | null> {
  const pi = alvo.pagamento.retido?.paymentIntentId;
  if (!pi) return 'acao-nao-vale';
  // num objeto, e não numa variável solta, para o TypeScript não achar que o valor nunca muda (ele muda lá dentro)
  const marca: { resultado?: ReturnType<typeof marcarDevolucaoDoRetido>; repetida?: boolean } = {};
  await atualizarReserva(alvo.codigo, (r) => {
    marca.resultado = marcarDevolucaoDoRetido(r, pi, new Date().toISOString());
    marca.repetida = acaoDoRetidoRepetida(r, 'devolver_retido');
    return marca.resultado === 'gravar' ? r : null;
  });
  if (marca.resultado === 'nao-vale') return marca.repetida ? null : 'acao-nao-vale';
  let reembolso: Stripe.Refund;
  try {
    const feitos = await reembolsosDoPagamento(pi);
    reembolso = feitos.find((f) => f.metadata?.referencia === 'total' && reembolsoEmVigor(f.status)) ?? (await criarReembolso(pi));
  } catch (e) {
    // nada foi devolvido: a escolha volta (os dois botões)
    await atualizarReserva(alvo.codigo, (r) => (desfazerDevolucaoDoRetido(r, pi) ? r : null)).catch((e2) =>
      console.error(`[admin] não deu para desfazer a devolução começada do pedido ${codigoDoPedido}: ${mensagem(e2)}`),
    );
    if (e instanceof Stripe.errors.StripeError && e.code === 'charge_disputed') {
      console.error(`[admin] a devolução do pagamento parado do pedido ${codigoDoPedido} foi recusada: o pagamento está contestado`);
      return 'contestado-nao-reembolsa';
    }
    console.error(`[admin] a devolução do pagamento parado do pedido ${codigoDoPedido} falhou: ${mensagem(e)}`);
    return 'stripe-falhou';
  }
  const agoraIso = new Date().toISOString();
  await atualizarReserva(alvo.codigo, (r) => {
    const linha = concluirDevolucaoDoRetido(r, pi, { id: reembolso.id, centavos: reembolso.amount }, agoraIso);
    if (linha === null) return null;
    return linha ? registrar(r, linha) : r;
  });
  return null;
}

/**
 * "Reativar o pedido (fica pago)" no pedido cancelado com o pagamento parado (Pacote 22): o pagamento é relido na Stripe
 * (a sessão continua paga por ele e nada foi devolvido dele; a verdade é a Stripe, nunca o que o pedido guardou), e só
 * então, dentro da trava, com a regra conferida de novo no pedido relido, o pedido vira pago com esse pagamento
 * (reativarPedidoRetido: a forma, o valor, o pagamento, a hora da cobrança; os avisos de valor diferente e de pagamento
 * depois do horário). Só a requisição que gravou manda o aviso de compra e o e-mail do pagamento aprovado (pedidoPago,
 * como um pagamento normal): o duplo toque e a aba antiga não gravam nada. Devolve o erro do painel, ou null.
 */
async function reativarPagamentoRetido(alvo: Reserva, vouchers: readonly Reserva[]): Promise<ErroDoPainel | null> {
  const retido = alvo.pagamento.retido;
  if (!retido) return 'acao-nao-vale';
  let leitura: ReturnType<typeof interpretarSessao>;
  try {
    const [sessao, reembolsos] = await Promise.all([obterSessao(retido.sessaoId), reembolsosDoPagamento(retido.paymentIntentId)]);
    leitura = interpretarSessao(sessao);
    const devolvido = reembolsos.some((f) => reembolsoEmVigor(f.status));
    if (leitura.status !== 'pago' || leitura.paymentIntentId !== retido.paymentIntentId || devolvido) return 'acao-nao-vale';
  } catch (e) {
    console.error(`[admin] não deu para reler o pagamento parado do pedido ${alvo.pedido?.codigo ?? alvo.codigo}: ${mensagem(e)}`);
    return 'stripe-fora';
  }
  const outros = vouchers.filter((v) => v.codigo !== alvo.codigo);
  // num objeto, e não numa variável solta (ele muda lá dentro): a cada volta da trava a leitura recomeça
  const gravado: { reativou?: boolean; repetida?: boolean } = {};
  const reativada = await atualizarReserva(alvo.codigo, (r) => {
    gravado.reativou = false;
    gravado.repetida = acaoDoRetidoRepetida(r, 'reativar_retido');
    // Etapa 7: o pedido com casa nunca se reativa por aqui (reativarRetidoEscondido; a rota já recusou antes)
    if (reativarRetidoEscondido(vouchers)) return null;
    if (!acaoDoRetidoOferecida(r, 'reativar_retido') || r.pagamento.retido?.paymentIntentId !== retido.paymentIntentId) return null;
    for (const linha of reativarPedidoRetido(r, outros, new Date(), linhaDaReativacao)) registrar(r, linha);
    gravado.reativou = true;
    return r;
  });
  if (!gravado.reativou) return gravado.repetida ? null : 'acao-nao-vale';
  await religarIrmaos(alvo);
  // o aviso de compra (a Meta) e o e-mail do pagamento aprovado com os vouchers, uma vez, como num pagamento normal
  if (reativada) await pedidoPago(reativada, leitura);
  return null;
}

/**
 * Os vouchers irmãos do pedido reativado voltam a valer. No banco, cancelar levou TODOS os itens a 'cancelado', e gravar o
 * pedido como pago só atualiza o item deste voucher: os outros vouchers do pedido voltam a valer aqui. A releitura vem
 * DEPOIS da gravação: com o pedido ainda cancelado o banco não devolve o statusItem; com ele pago, o irmão parado aparece
 * com 'cancelado'. Nos arquivos nenhum irmão tem statusItem 'cancelado' (o cancelamento só muda o status) e o laço não faz
 * nada. Uma falha não desfaz a reativação: o voucher que não voltou continua 'cancelado' e volta no toque repetido em
 * "Reativar o pedido (fica pago)" (Pacote 25, achado B3), que roda este mesmo laço; só o irmão ainda cancelado muda. O
 * voucher que a equipe cancelou sem reembolso depois da reativação (Pacote 33) nunca volta por aqui: irmaosAindaCancelados
 * o deixa de fora, e o formulário antigo de "Reativar" não o faz valer de novo.
 */
async function religarIrmaos(alvo: Reserva): Promise<void> {
  const releitura = await vouchersDoPedido(alvo.pedido?.codigo ?? alvo.codigo);
  for (const v of irmaosAindaCancelados(releitura, alvo.codigo)) {
    try {
      await atualizarItem(v.codigo, 'ativo', `Voucher ${v.codigo} volta a valer com o pedido reativado`);
    } catch (e) {
      console.error(`[admin] o voucher ${v.codigo} não voltou a valer na reativação do pedido: ${mensagem(e)}`);
    }
  }
}

/**
 * O cancelamento sem reembolso (Pacote 33), depois da primeira gravação: cada voucher que o cancelamento gravado lista e
 * que ainda vale fica 'cancelado', numa gravação do próprio voucher, com a trava de versão do pedido e a conferência de novo
 * lá dentro (voucherACompletar: o pedido ainda pago, o voucher ainda valendo e listado). O pedido continua pago (no banco,
 * atualizar_reserva só leva o status de um item aos outros quando o pedido inteiro é cancelado ou reembolsado). O voucher
 * já cancelado, ou o pedido que mudou no meio-tempo, não grava nada. false: algum voucher não ficou cancelado (a rede, o
 * banco): o cancelamento gravado espera o toque seguinte, que completa sem gravar outro.
 */
async function completarCancelados(lista: readonly Reserva[], codigoDoPedido: string): Promise<boolean> {
  let completou = true;
  for (const v of lista) {
    try {
      await atualizarReserva(v.codigo, (x) => {
        if (!voucherACompletar(x)) return null;
        x.statusItem = 'cancelado';
        return x;
      });
    } catch (e) {
      completou = false;
      console.error(`[admin] o voucher ${v.codigo} do cancelamento sem reembolso do pedido ${codigoDoPedido} não ficou cancelado: ${mensagem(e)}`);
    }
  }
  return completou;
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
 *   uma falha, ou, desde o Pacote 33, no Pix pago há mais de 90 dias que a Stripe não devolve mais e a equipe devolveu
 *   por transferência: transferenciaDoPixOferecida, src/lib/resumo-do-painel.ts; um voucher ainda pago devolvido por
 *   outro meio: o valor entra no que voltou, o voucher deixa de valer e, sem voucher pago nem cancelado sem reembolso
 *   sobrando, o pedido vira reembolsado), 'voucher_da_stripe' (o reembolso feito direto na Stripe sem
 *   voucher era deste voucher: ele deixa de valer, sem novo reembolso) e 'reembolso_sem_voucher' (era um desconto: só
 *   a linha). As três primeiras pedem a caixa "Confirmo";
 * - num pedido da Stripe, marcar pago é recusado, cancelar só vale enquanto ninguém pagou (a sessão é
 *   expirada) e "marcar reembolsado" continua sem botão no painel e só vale depois de pago. Ela NÃO é o caminho do
 *   reembolso que falhou: invalida todos os vouchers e não soma o valor devolvido (como no ON-A8RVZN); esse caminho é
 *   'devolvido_por_fora' e 'voucher_por_fora'. As ações manuais continuam valendo para os pedidos do WhatsApp e os
 *   antigos, menos "marcar reembolsado" num pedido que nunca foi pago (pedidoNuncaPago: o do WhatsApp cancelado antes de
 *   pagar), recusado com acao-nao-vale. Fora da Stripe, cada ação manual só vale a partir do estado em que o painel a
 *   oferece (acaoManualOferecida, src/lib/pedidos-painel.ts, a regra única dos botões da página), conferido dentro da
 *   trava de versão, com o pedido relido, depois da ação repetida: a aba antiga do painel que ainda mostra "Pago no Pix"
 *   num pedido já cancelado ou reembolsado, ou "Cancelar" num reembolsado, volta com acao-nao-vale, sem gravar nada, sem
 *   aviso de compra e sem e-mail (reteste de 22/11: o ON-ZELYQN, cancelado, virou pago pela aba antiga, e o e-mail do
 *   pagamento aprovado foi agendado). No pedido da Stripe nada muda: valem as conferências de sempre, acima;
 * - 'devolver_retido' e 'reativar_retido' (Pacote 22, decisão do dono de 23/11/2026): o pagamento que chegou para um
 *   pedido cancelado e ficou parado na Stripe (pagamento.retido). Devolver pede à Stripe o reembolso desse pagamento (o
 *   pedido continua cancelado); reativar relê o pagamento na Stripe e deixa o pedido pago com ele, com o aviso de compra e
 *   o e-mail com os vouchers uma vez. As duas pedem a caixa "Confirmo", valem pela regra da página (acaoDoRetidoOferecida),
 *   conferida de novo dentro da trava, e se excluem; o duplo toque e a aba antiga não gravam nada;
 * - 'desistencia_respondida': o pedido de desistência pelo site foi respondido (src/lib/desistencia.ts), sem reembolso
 *   ou com o resto do pedido seguindo pago depois do reembolso de uma parte: só a linha no histórico, que tira o pedido
 *   da faixa do topo.
 * Os botões do painel mandam o código do voucher no endereço; no 'reembolsar_item', é ele o voucher devolvido.
 * O botão é um formulário simples: o duplo toque, ou a aba antiga do painel, manda a mesma ação de novo. Cada ação confere
 * outra vez dentro da trava de versão do pedido, e a repetida não grava nada e volta como a que deu certo (rodada com o
 * banco de 17/11): a ação manual que já está feita (acaoManualRepetida), o reembolso que a Stripe devolve igual pela chave
 * de idempotência (reembolsoNoHistorico), o voucher por outro meio (marcaOVoucherPorFora) e o voucher da Stripe
 * (voucherDaStripeAindaLiga); a desistência e as duas linhas de fecho já conferiam assim.
 * Quem clica é uma pessoa, num formulário: toda ação recusada volta para o painel com ?erro= e um código curto,
 * que a página troca por uma frase fixa na faixa vermelha (ERROS_DO_PAINEL; nunca o texto que veio no endereço,
 * nem uma resposta em JSON, que o navegador abriria como texto cru). O que a Stripe respondeu fica só no registro
 * do servidor. Só a falta de login responde de outro jeito (pedidoRecusado). Toda volta, com sucesso ou com erro, leva
 * o filtro de status e a busca em que a equipe estava (voltaAoPainel): até o reteste de 22/11 a busca se perdia a cada
 * ação.
 */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/reservas/[codigo]'>) {
  const recusa = await pedidoRecusado(req);
  if (recusa) return recusa;
  const { codigo } = await ctx.params;
  const form = await req.formData();
  const acao = String(form.get('acao'));
  const filtro = form.get('filtro');
  // a busca em que a equipe estava (o campo escondido "q" dos botões do painel): sem as pontas e cortada no máximo que a
  // caixa da busca aceita
  const busca = buscaDoPainel(form.get('q'));
  // a caixa "Confirmo" dos botões que devolvem dinheiro ou tiram a validade de um voucher (decisão do dono de 16/11): o
  // navegador não envia o formulário sem ela marcada, e a rota confere de novo
  const confirmou = form.get('confirmo') === 'sim';
  // Pacote 33: a segunda caixa, "Estou ciente", da trava dos 7 dias do arrependimento (o cancelamento sem reembolso e a
  // desistência respondida sem reembolso); a rota confere de novo se a trava vale, com o pedido lido agora
  const ciente = form.get('ciente') === 'sim';
  // a volta ao painel, com sucesso ou com erro: o filtro de status e a busca voltam juntos (voltaAoPainel, que escreve
  // tudo pelo URLSearchParams), e o pedido continua na tela depois da ação
  const voltar = (erro?: ErroDoPainel) =>
    NextResponse.redirect(voltaAoPainel(req.url, { filtro: filtro ? String(filtro) : undefined, busca, erro }), 303);

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
    // o que ainda resta do pagamento: o que entrou (o que a Stripe recebeu de verdade, recebidoDoPedido) menos o que já
    // voltou ou tem de voltar (a conta do painel); sem nada a devolver, a recusa do voucher vem antes de qualquer chamada à Stripe
    const restante = recebidoDoPedido(vouchers) - (alvo.reembolsoCentavos ?? 0);
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
        // o segundo toque (o duplo clique, a aba antiga do painel) recebe da Stripe o mesmo reembolso, pela chave de
        // idempotência: com o id dele já no histórico, a linha não é gravada de novo
        await atualizarReserva(alvo.codigo, (r) =>
          reembolsoNoHistorico(r.historico, re.id) ? null : registrar(r, linhaDoReembolsoSolicitado({ id: re.id, centavos: re.amount })),
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
      // como no "Reembolsar tudo": o segundo toque recebe o mesmo reembolso, e a linha não é gravada de novo
      await atualizarReserva(alvo.codigo, (r) =>
        reembolsoNoHistorico(r.historico, re.id)
          ? null
          : registrar(r, linhaDoReembolsoSolicitado({ id: re.id, centavos: re.amount, voucher })),
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
    // Pacote 33: a trava dos 7 dias. A desistência que chegou dentro dos 7 dias do arrependimento, respondida sem reembolso
    // nenhum, pede a caixa "Estou ciente" (o painel avisa em vermelho que o cliente tem direito ao dinheiro de volta), e a
    // linha da trava fica no histórico, junto com a da resposta. Relida dentro da trava de versão: o valor devolvido só
    // cresce, então a trava só pode sumir no meio-tempo, nunca aparecer
    if (travaDaDesistencia(alvo) && !ciente) return voltar('falta-ciente');
    await atualizarReserva(alvo.codigo, (r) => {
      if (desistenciaRespondida(r)) return null;
      registrar(r, linhaDaDesistenciaRespondida(r.reembolsoCentavos ?? 0));
      const trava = travaDaDesistencia(r);
      return trava ? registrar(r, linhaDaTravaDosSeteDias(trava, 'desistencia')) : r;
    });
    return voltar();
  }

  // Pacote 33 (FASE-5, Etapa 2, passos 2 e 3 do plano de 25/11): cancelar SEM reembolso o pedido inteiro
  // ('cancelar_sem_reembolso') ou um voucher só de um pedido com vários itens ('cancelar_item_sem_reembolso', o campo
  // `voucher`), pela tela de resumo do painel. Nenhum dinheiro sai: nada da Stripe é chamado, e o caminho do dinheiro de
  // sempre não muda. O pedido continua 'pago' e só os vouchers ficam 'cancelado', com o motivo no JSON do pagamento
  // (src/lib/sem-reembolso.ts): com o pedido 'cancelado', a reentrega do aviso do pagamento faria o site devolver o
  // dinheiro sozinho. A regra é a da tela (planoDoCancelamento, src/lib/cancelar-sem-reembolso.ts), conferida aqui e de
  // novo dentro da trava de versão; a caixa "Confirmo", o motivo (o texto só no "outro", até 200 letras; os dois da política
  // só quando combinam com a data do serviço) e, dentro dos 7 dias do arrependimento com o serviço ainda por começar, ou
  // com a desistência pedida pelo site dentro dos 7 dias, a caixa "Estou ciente", com a linha da trava no histórico.
  // Primeiro, o que um cancelamento já gravado deixou pela metade (a função cortada entre as gravações, ou outro toque
  // ainda gravando) é completado, sem gravar outro; o toque repetido volta como o que deu certo. A primeira gravação é a
  // do primeiro voucher a cancelar (o cancelamento, as linhas e o voucher, juntos); depois, os outros vouchers, um por um.
  // Por fim, o e-mail ao cliente ("Pedido cancelado" ou "Voucher cancelado", sem reembolso), depois da resposta, uma vez
  if (acao === 'cancelar_sem_reembolso' || acao === 'cancelar_item_sem_reembolso') {
    // só com o segredo do painel criado na Vercel (decisão P14 do dono: antes dos botões novos de dinheiro); sem ele, o
    // painel nem mostra o botão, e o formulário antigo ou montado à mão volta sem gravar nada
    if (!segredoDoPainelCriado()) return voltar('acao-nao-vale');
    const agora = new Date();
    const escolha: EscolhaDoCancelamento =
      acao === 'cancelar_item_sem_reembolso' ? { acao, voucher: String(form.get('voucher') ?? '').trim().toUpperCase() } : { acao };
    // o que ficou pela metade: completado (com a caixa, como toda gravação), e o e-mail de cada cancelamento completado
    const pendentes = vouchersACompletar(vouchers);
    if (pendentes.length) {
      if (!confirmou) return voltar('falta-confirmar');
      if (!(await completarCancelados(pendentes, codigoDoPedido))) return voltar('cancelamento-pela-metade');
      for (const c of cancelamentosDosVouchers(alvo, pendentes)) agendarEmailSemReembolso(codigoDoPedido, alcanceDoEmail(c));
    }
    // o toque repetido (o duplo toque, a aba antiga): a escolha já está gravada
    if (cancelamentoJaFeito(alvo, escolha)) return voltar();
    const depois = vouchers.map((v) => (pendentes.includes(v) ? { ...v, statusItem: 'cancelado' as const } : v));
    const plano = planoDoCancelamento(depois, escolha, agora);
    if (!plano.ok) return voltar(plano.erro);
    if (!confirmou) return voltar('falta-confirmar');
    const motivo = motivoDoFormulario(form.get('motivo'), form.get('texto'));
    if (!motivo.ok) return voltar(motivo.erro);
    // o motivo que a data do serviço não deixa (o "fora da política" a mais de 24 horas do início, o "não compareceu"
    // antes dele): a tela não mostra, e o formulário antigo ou montado à mão também não passa
    if (!motivoCombinaComAData(motivo.motivo, plano.cancelar, agora)) return voltar('motivo-fora-da-data');
    if (plano.trava && !ciente) return voltar('falta-ciente');
    const registro = registroDoCancelamento(
      escolha,
      plano.cancelar.map((v) => v.codigo),
      motivo,
      agora,
      Boolean(plano.trava),
    );
    const [primeiro, ...resto] = plano.cancelar;
    // num objeto, e não numa variável solta (ele muda lá dentro): a cada volta da trava a conferência recomeça
    const lido: { conferencia?: ConferenciaNaTrava } = {};
    await atualizarReserva(primeiro.codigo, (r) => {
      const conferencia = conferirNaTrava(r, depois, escolha, registro, agora, ciente);
      lido.conferencia = conferencia;
      if (conferencia.resultado !== 'gravar') return null;
      for (const linha of aplicarCancelamento(r, registro, conferencia.trava)) registrar(r, linha);
      return r;
    });
    const resultado = lido.conferencia?.resultado ?? 'nao-encontrado';
    if (resultado === 'repetida') return voltar();
    if (resultado !== 'gravar') return voltar(resultado);
    if (!(await completarCancelados(resto, codigoDoPedido))) return voltar('cancelamento-pela-metade');
    agendarEmailSemReembolso(codigoDoPedido, alcanceDoEmail(registro));
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
  // do que resta do pagamento) com a linha e, sem voucher pago nem cancelado sem reembolso sobrando, leva o pedido a
  // reembolsado; depois o voucher,
  // só por quem gravou a linha: o duplo toque e a aba antiga acham a linha já gravada e não gravam nada (atualizar_item
  // sempre grava a linha dele). Se a função for cortada entre as duas, outro clique completa sem somar de novo, quando a
  // linha já tem mais de um minuto (marcaOVoucherPorFora)
  if (acao === 'voucher_por_fora') {
    // vale depois de um reembolso que falhou e, desde o Pacote 33 (D1), no Pix pago há mais de 90 dias, que a Stripe não
    // devolve mais: a política promete devolver por transferência, e a tela de resumo oferece este mesmo botão pela mesma
    // regra (transferenciaDoPixOferecida), conferida de novo dentro da trava, abaixo
    const agora = new Date();
    // com os vouchers do pedido: um reembolso pedido à Stripe e ainda sem a confirmação dela tira a transferência (dentro
    // da trava, o pedido é relido; um voucher lido aqui e ainda 'ativo' só segura mais, nunca menos)
    const porForaVale = (r: Reserva) => reembolsosFalhos(r.historico).length > 0 || transferenciaDoPixOferecida(r, agora, vouchers);
    if (!daStripe || alvo.status !== 'pago' || !porForaVale(alvo)) return voltar('acao-nao-vale');
    const voucher = String(form.get('voucher') ?? '').trim();
    const item = vouchers.find((v) => v.codigo === voucher);
    if (!item) return voltar('voucher-de-fora');
    if (!voucherPago(item)) return voltar('item-ja-devolvido');
    // um reembolso feito direto na Stripe sem voucher pode ter sido deste: primeiro a equipe diz de qual foi
    if (vouchers.length > 1 && reembolsosSemVoucher(alvo.historico).some((s) => !s.resolvido)) return voltar('reembolso-sem-voucher');
    const valor = valorDoVoucher(alvo, item);
    const recebido = recebidoDoPedido(vouchers);
    // nada mais a devolver deste pagamento: não há o que registrar (a não ser completar o voucher já gravado)
    const jaGravado = vouchersDevolvidosPorOutroMeio(alvo.historico).some((v) => v.voucher === voucher);
    if (!jaGravado && valorDoVoucherPorFora(valor, recebido - (alvo.reembolsoCentavos ?? 0)) <= 0) return voltar('acao-nao-vale');
    if (!confirmou) return voltar('falta-confirmar');
    // o último: nenhum outro voucher pago e nenhum cancelado sem reembolso (Pacote 33: o dinheiro dele ficou, o pedido
    // continua pago e conta como venda, decisão P3, como pelo reembolso da Stripe de um voucher só)
    const ultimo = ultimoVoucherDoPedido(vouchers, voucher);
    // num objeto, e não numa variável solta, para o TypeScript não achar que o valor nunca muda (ele muda lá dentro). A
    // cada volta da trava (a gravação que esbarra noutra relê o pedido) a leitura recomeça: `escreveu` só fica na volta
    // que gravou a linha, e `linhaEm` é a hora da linha que outra requisição já gravou
    const gravado: { escreveu?: boolean; linhaEm?: string; foraDaRegra?: boolean } = {};
    await atualizarReserva(alvo.codigo, (r) => {
      gravado.escreveu = false;
      gravado.linhaEm = horaDoVoucherDevolvidoPorOutroMeio(r.historico, voucher);
      if (gravado.linhaEm !== undefined || r.status !== 'pago') return null;
      // relido (Pacote 33): um reembolso pedido à Stripe no meio-tempo tira a transferência do Pix fora do prazo, e nada é
      // gravado
      gravado.foraDaRegra = !porForaVale(r);
      if (gravado.foraDaRegra) return null;
      const centavos = valorDoVoucherPorFora(valor, recebido - (r.reembolsoCentavos ?? 0));
      if (centavos <= 0) return null;
      r.reembolsoCentavos = (r.reembolsoCentavos ?? 0) + centavos;
      if (ultimo && podeMudar(r.status, 'reembolsado')) r.status = 'reembolsado';
      gravado.escreveu = true;
      return registrar(r, linhaDoVoucherDevolvidoPorOutroMeio(voucher, centavos));
    });
    if (gravado.foraDaRegra) return voltar('acao-nao-vale');
    if (marcaOVoucherPorFora(gravado, new Date(), item)) {
      await atualizarItem(voucher, 'reembolsado', `Item ${voucher} marcado como devolvido no painel (por outro meio)`);
    }
    return voltar();
  }

  // o reembolso de parte feito direto na Stripe, sem dizer de qual voucher: a equipe diz de qual foi. O voucher deixa de
  // valer, sem novo reembolso e sem mudar o valor devolvido (o dinheiro já foi contado quando o aviso chegou). A marca do
  // voucher e a linha saem numa gravação só, a do próprio voucher, com a trava de versão do pedido e a conferência de
  // novo lá dentro (voucherDaStripeAindaLiga): o segundo toque, a aba antiga do painel ou o botão de outro voucher para o
  // mesmo reembolso não gravam nada. Antes era o atualizar_item, sem trava, que sempre grava a linha: dois toques rápidos
  // passavam pelas conferências daqui antes de o primeiro chegar ao banco
  if (acao === 'voucher_da_stripe') {
    const id = String(form.get('reembolso') ?? '');
    const voucher = String(form.get('voucher') ?? '').trim();
    if (!daStripe || alvo.status !== 'pago' || !semVoucherAberto(alvo, id)) return voltar('acao-nao-vale');
    const item = vouchers.find((v) => v.codigo === voucher);
    if (!item) return voltar('voucher-de-fora');
    // só o voucher ativo, como os botões do painel (o usado já aconteceu: aí é um desconto)
    if (!voucherAtivo(item)) return voltar(voucherPago(item) ? 'acao-nao-vale' : 'item-ja-devolvido');
    if (!confirmou) return voltar('falta-confirmar');
    await atualizarReserva(voucher, (r) => {
      if (!voucherDaStripeAindaLiga(r, id)) return null;
      r.statusItem = 'reembolsado';
      return registrar(r, linhaDoVoucherLigado(id, voucher));
    });
    // Pacote 28: agora se sabe de qual voucher foi o reembolso feito direto na Stripe: o e-mail do reembolso ao cliente,
    // depois da resposta, um por reembolso (o repetido não sai de novo: a marca e a chave de idempotência)
    agendarEmailDoReembolso(codigoDoPedido, id);
    return voltar();
  }

  // ... ou que nenhum voucher muda (foi um desconto): só a linha, uma vez
  if (acao === 'reembolso_sem_voucher') {
    const id = String(form.get('reembolso') ?? '');
    if (!daStripe || alvo.status !== 'pago' || !semVoucherAberto(alvo, id)) return voltar('acao-nao-vale');
    await atualizarReserva(alvo.codigo, (r) => (semVoucherAberto(r, id) ? registrar(r, linhaDoReembolsoSemMudarVoucher(id)) : null));
    // Pacote 28: anotado como desconto (nenhum voucher muda): o e-mail do reembolso de parte do valor, uma vez
    agendarEmailDoReembolso(codigoDoPedido, id);
    return voltar();
  }

  // o pagamento que chegou para o pedido cancelado e ficou parado na Stripe (Pacote 22): devolver ao cliente ou reativar o
  // pedido. A regra é a mesma dos botões da página (acaoDoRetidoOferecida); a ação já feita volta como a que deu certo,
  // sem gravar nada, e a que não vale mais (a outra já escolhida, o pedido mudou) volta com acao-nao-vale
  // Etapa 7: o pedido com casa não se reativa (as datas podem já ser de outra pessoa); só devolver (reativarRetidoEscondido,
  // a mesma regra que esconde o botão na página). O formulário de uma aba antiga volta com a frase, sem gravar nada
  if (acao === 'reativar_retido' && reativarRetidoEscondido(vouchers)) return voltar('reativar-com-casa');
  if (acao === 'devolver_retido' || acao === 'reativar_retido') {
    if (!daStripe || !acaoDoRetidoOferecida(alvo, acao)) {
      const repetida = acaoDoRetidoRepetida(alvo, acao);
      // o toque repetido em "Reativar" com o pedido já pago pelo parado: o voucher irmão que ficou 'cancelado' (a volta dele
      // falhou na primeira vez) volta a valer agora, pelo mesmo laço; a resposta continua a da ação repetida (B3)
      if (
        repetida &&
        daStripe &&
        acao === 'reativar_retido' &&
        pagoPeloRetidoReativado(alvo) &&
        irmaosAindaCancelados(vouchers, alvo.codigo).length
      ) {
        await religarIrmaos(alvo).catch((e) =>
          console.error(`[admin] não deu para refazer a volta dos vouchers do pedido ${codigoDoPedido}: ${mensagem(e)}`),
        );
      }
      return voltar(repetida ? undefined : 'acao-nao-vale');
    }
    if (!confirmou) return voltar('falta-confirmar');
    const erro =
      acao === 'devolver_retido' ? await devolverPagamentoRetido(alvo, codigoDoPedido) : await reativarPagamentoRetido(alvo, vouchers);
    return voltar(erro ?? undefined);
  }

  // Pacote 29 (decisão do dono de 25/11): o hotel de quem marcou "Ainda não sei" no checkout, gravado depois pela equipe no
  // campo do painel. Vale para todos os passeios do pedido que estão a informar (a hospedagem é uma só no checkout); o
  // transfer não entra (o endereço dele é obrigatório no próprio formulário). Uma linha só no histórico do pedido. Não muda
  // status, pagamento nem voucher; o voucher e a página do pedido passam a mostrar o nome. O segundo toque, com o hotel já
  // gravado igual, volta como deu certo. Tudo é decidido com cada passeio relido dentro da trava de versão (passoDoHotel),
  // nunca com a lista lida no começo da requisição: no duplo clique, as duas requisições leem antes de a primeira gravar
  // (revisão do Pacote 29). Segunda revisão: o pedido que já tem outro hotel gravado (duas pessoas, ou duas abas, com nomes
  // diferentes ao mesmo tempo) volta com hotel-ja-informado e nada muda, nem nos passeios seguintes: o primeiro nome que
  // chegou vale para o pedido inteiro. E a linha do histórico vai só com o primeiro passeio do pedido: sem o banco (os
  // arquivos do computador e o Blob), cada voucher guarda uma cópia do histórico, e o segundo toque, lendo o segundo
  // passeio antes de a cópia chegar, gravava a mesma linha outra vez
  if (acao === 'hotel') {
    const hotel = hotelDoPainel(form.get('hotel'));
    if (!hotel) return voltar('hotel-invalido');
    const primeiroPasseio = vouchers.find((v) => ehPasseio(v))?.codigo;
    let gravados = 0;
    let jaEstava = false;
    let outroHotel = false;
    for (const v of vouchers) {
      // só o passeio tem hotel: o transfer e a casa ficam de fora
      if (!ehPasseio(v)) continue;
      let gravou = false;
      let igual = false;
      let outro = false;
      await atualizarReserva(v.codigo, (x) => {
        gravou = false;
        igual = false;
        outro = false;
        if (!ehPasseio(x)) return null;
        const passo = passoDoHotel(x.hospedagem, x.historico, hotel);
        if (passo.tipo === 'ja-estava') igual = true;
        if (passo.tipo === 'outro-hotel') outro = true;
        if (passo.tipo !== 'gravar') return null;
        x.hospedagem = passo.hospedagem;
        gravou = true;
        return passo.linha && v.codigo === primeiroPasseio ? registrar(x, passo.linha) : x;
      });
      if (gravou) gravados++;
      if (igual) jaEstava = true;
      if (outro) {
        outroHotel = true;
        break;
      }
    }
    if (outroHotel) return voltar('hotel-ja-informado');
    return voltar(gravados > 0 || jaEstava ? undefined : 'acao-nao-vale');
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
      // Pacote 28: o e-mail "Pedido cancelado" ao cliente, depois da resposta e uma vez por pedido. A regra
      // (emailDoCancelamentoSai) confere na hora do envio que foi o painel que cancelou e que não há dinheiro a devolver
      if (r) agendarEmailDoCancelamento(codigoDoPedido);
      // Etapa 7: o cancelamento soltou as datas da casa (cancelarPedidoAberto, pela sessão): as páginas das casas refazem
      // o calendário (calendarioMudou só nas rotas; um erro dele fica no registro)
      if (r && vouchers.some(ehCasa)) calendarioMudou();
      return voltar();
    }
    // "reembolsado à mão" num pedido da Stripe continua sem botão no painel e só vale depois de pago (antes disso não há
    // o que devolver). NÃO é o caminho do reembolso que falhou: invalida todos os vouchers e não soma o valor devolvido
    // (como no ON-A8RVZN); esse caminho é 'devolvido_por_fora' e 'voucher_por_fora'
    if (!podeMudar(alvo.status, manual.status)) return voltar('acao-nao-vale');
  }
  // "Marcar reembolsado" num pedido fora da Stripe que nunca foi pago (o do WhatsApp cancelado antes de pagar): não há o
  // que devolver. O painel não mostra mais o botão nesse pedido (naoPagoNoPainel, a mesma regra); a aba antiga do painel,
  // que ainda o mostra, volta com acao-nao-vale e nada é gravado (reteste de 17-18/11, pergunta 11). O pedido pago, mesmo
  // cancelado depois, continua podendo ser marcado
  if (!daStripe && manual.status === 'reembolsado' && pedidoNuncaPago(alvo)) return voltar('acao-nao-vale');
  // Pacote 33 (D2; decisão do dono de 16/11): "Cancelar" no pedido que já foi pago e "Marcar reembolsado" pedem a caixa
  // "Confirmo" (os vouchers deixam de valer); só o cancelamento do pedido que ninguém pagou fica com um toque. Conferida
  // aqui e de novo dentro da trava (o pedido que virou pago no meio-tempo, por outra aba, passa a pedir a caixa)
  if (acaoManualPedeConfirmacao(alvo, acao) && !confirmou) return voltar('falta-confirmar');

  let virouPago = false;
  let virouCancelado = false;
  // a ação que o painel não oferece no estado em que o pedido está: decidida a cada volta da trava, com o pedido relido
  let foraDeHora = false;
  // a ação que, com o pedido relido, passou a pedir a caixa "Confirmo" e veio sem ela (Pacote 33, D2)
  let semConfirmar = false;
  const atualizada = await atualizarReserva(alvo.codigo, (r) => {
    virouPago = manual.status === 'pago' && r.status !== 'pago';
    virouCancelado = manual.status === 'cancelado' && r.status !== 'cancelado';
    foraDeHora = false;
    semConfirmar = false;
    // o duplo toque, ou a aba antiga do painel: o pedido relido dentro da trava já está como a ação o deixaria (o status
    // e, quando ela diz a forma, a forma). Nada é gravado: nem a linha de novo, nem o aviso de compra, nem o e-mail
    // (virouPago já é false: o status é o da ação), e a volta é a de sempre
    if (acaoManualRepetida(r, manual)) return null;
    // a aba antiga do painel com um botão que a tela de agora não oferece mais neste status ("Pago no Pix" num pedido do
    // WhatsApp cancelado ou reembolsado no meio-tempo, "Cancelar" num reembolsado): a mesma regra dos botões da página
    // (acaoManualOferecida), com o pedido relido. Nada é gravado, o pedido não vira pago (nem aviso de compra, nem e-mail
    // com o voucher) e a volta é acao-nao-vale. Só fora da Stripe: no pedido dela valem as conferências de cima, como antes
    if (!daStripe && !acaoManualOferecida(r, acao)) {
      foraDeHora = true;
      virouPago = false;
      virouCancelado = false;
      return null;
    }
    if (acaoManualPedeConfirmacao(r, acao) && !confirmou) {
      semConfirmar = true;
      virouPago = false;
      virouCancelado = false;
      return null;
    }
    // Pacote 29 (revisão): o pedido do checkout antigo que já tinha vencido sem pagamento ganha o final " (já estava
    // vencido)" na linha do cancelamento, como o da Stripe (cancelarPedidoAberto): o e-mail "Pedido cancelado" não sai
    const statusAntes = r.status;
    r.status = manual.status;
    // quem cobrou continua sendo a equipe: sem isto, anotar "Pix" ou "cartão" numa reserva do WhatsApp fazia o
    // painel mostrar o checkout antigo, que é o que uma forma online sem provedor gravado quer dizer
    if (provedorDaReserva(r) === 'whatsapp') r.provedor = 'whatsapp';
    if (manual.metodo) r.pagamento.metodo = manual.metodo;
    if (manual.status === 'pago' && !r.pagamento.pagoEm) r.pagamento.pagoEm = new Date().toISOString();
    return registrar(r, manual.status === 'cancelado' ? linhaDoCancelamento(manual.evento, statusAntes) : manual.evento);
  });
  if (foraDeHora) return voltar('acao-nao-vale');
  if (semConfirmar) return voltar('falta-confirmar');
  if (virouPago && atualizada) {
    await avisarCompra(atualizada);
    // o e-mail do pagamento aprovado, com os vouchers (Etapa 6), depois da resposta; uma vez só por pedido
    agendarEmailDoPedido('pagamento-aprovado', codigoDoPedido);
    // Pacote 28: o aviso à equipe do pedido pago, uma vez por pedido
    agendarAvisoDoPedidoPago(codigoDoPedido);
  }
  // Pacote 28: o pedido cancelado no painel (WhatsApp ou checkout antigo): o e-mail "Pedido cancelado", uma vez por pedido
  if (virouCancelado && atualizada) agendarEmailDoCancelamento(codigoDoPedido);
  return voltar();
}

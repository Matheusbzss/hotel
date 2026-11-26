import 'server-only';
import { pendenteDesde, vouchersDoPedido } from '@/app/api/pedido/pedido-stripe';
import { agendarAvisoDasDatasDaCasa } from './email/pedidos';
import { mensagemDoErro } from './erros';
import { sincronizarComStripe } from './pagamento-stripe';
import {
  conferirDatasDoPedidoPago,
  liberarDatasDosVouchers,
  renomearTravaVista,
  soltarTravaVista,
  travasDoSite,
  vouchersDeCasaAFrente,
  vouchersDosItens,
} from './pedido-carrinho';
import { atualizarReserva, ehCasa, obterReserva, registrar, type Reserva, type ReservaCasa } from './reservas';
import {
  avisoDasDatasNaoPresas,
  datasASoltar,
  decidirATrava,
  seguraAsDatas,
  vouchersComAvisoDasDatas,
  type VoucherDaRede,
} from './trava-das-casas';
import { hojeEmBuzios } from './validacao';

/**
 * AS DATAS DAS CASAS DEPOIS DO PAGAMENTO, fora das rotas de cada ação (Etapa 7, pacote 2): o "Aviso:" e o e-mail à equipe da
 * casa paga sem as datas presas, e a rede de segurança de hora em hora (/api/casas/sincronizar). Nada aqui refaz o calendário
 * das páginas (calendarioMudou mora só nas rotas, crítica de 26/11, furo 3): quem chama recebe `mudou` e refaz.
 */

const mensagem = mensagemDoErro;

/**
 * A casa de um pedido pago ficou sem as datas presas (as noites já são de outra reserva ou de um bloqueio): a linha "Aviso:"
 * no histórico do pedido (uma por voucher, uma vez) e o e-mail à equipe, depois da resposta (agendarAvisoDasDatasDaCasa,
 * src/lib/email/pedidos.ts). A reserva continua paga e nada volta sozinho ao cliente: a equipe decide no painel.
 */
export async function avisarDatasNaoPresas(reserva: Reserva, semTrava: readonly ReservaCasa[]): Promise<void> {
  if (!semTrava.length) return;
  await atualizarReserva(reserva.codigo, (r) => {
    // uma linha por voucher, uma vez (pelo voucher da linha: a frase pode mudar de uma versão do site para a outra)
    const ja = vouchersComAvisoDasDatas(r.historico);
    const faltam = semTrava.filter((v) => !ja.has(v.codigo)).map(avisoDasDatasNaoPresas);
    if (!faltam.length) return null;
    for (const l of faltam) registrar(r, l);
    return r;
  });
  agendarAvisoDasDatasDaCasa(reserva.pedido?.codigo ?? reserva.codigo);
}

/** O que a rodada da rede fez: para o registro da Vercel (nenhum dado do cliente). */
export interface ResultadoDaRede {
  travas: number;
  soltas: number;
  renomeadas: number;
  consultados: number;
  /** Casas pagas que estavam sem a trava e foram presas agora. */
  presas: number;
  /** Casas pagas sem a trava que a rede não conseguiu prender (o "Aviso:" e o e-mail à equipe). */
  semTrava: number;
  erros: number;
  /** Alguma trava mudou: a rota refaz o calendário das páginas. */
  mudou: boolean;
}

/** O voucher como a rede decide (decidirATrava): o status, o item, a sessão corrente e desde quando espera o pagamento. */
const paraARede = (r: Reserva): VoucherDaRede => ({
  codigo: r.codigo,
  tipo: r.tipo,
  status: r.status,
  ...(r.statusItem ? { statusItem: r.statusItem } : {}),
  ...(r.pagamentoExternoId ? { pagamentoExternoId: r.pagamentoExternoId } : {}),
  pendenteDesde: pendenteDesde(r),
});

/**
 * A REDE DE SEGURANÇA das datas das casas (crítica de 26/11, furo 5; 3.5 do plano), a cada hora, no agendamento que já traz o
 * calendário do Airbnb. Um aviso da Stripe que se perca, uma falha do banco no meio de uma ação ou uma troca de forma desfeita
 * não prendem uma noite para sempre, nem deixam uma casa paga sem a trava:
 * 1. cada trava do site das estadias que ainda não acabaram é conferida com o voucher dela, relido agora (decidirATrava): a do
 *    pedido vencido, cancelado ou devolvido e a do voucher cancelado ou devolvido sozinho saem; a do pedido pendente presa a
 *    uma sessão antiga passa para a sessão corrente; o pedido pendente há mais de 2 horas é conferido na Stripe antes
 *    (sincronizarComStripe, a mesma porta do aviso). Soltar e renomear são sempre pelo item E pela referência que a rede viu,
 *    nunca só pelo item: um "Pagar de novo" no meio-tempo passa a trava para a sessão nova, e a rede não a apaga. A trava
 *    recém-criada (menos de 10 minutos) fica para a próxima rodada;
 * 2. cada casa paga (ou contestada) cuja saída ainda não chegou tem a trava: faltando, é presa agora (a função do banco, que
 *    confere todos os bloqueios); sem conseguir, o "Aviso:" no histórico e o e-mail à equipe, e a reserva continua paga. Se o
 *    pedido deixou de valer enquanto a rede prendia (um reembolso no mesmo instante), o que ela prendeu sai.
 * Cada trava e cada pedido num try: um erro fica no registro e a rodada segue.
 */
export async function redeDeSegurancaDasCasas(agora: Date = new Date()): Promise<ResultadoDaRede> {
  const res: ResultadoDaRede = { travas: 0, soltas: 0, renomeadas: 0, consultados: 0, presas: 0, semTrava: 0, erros: 0, mudou: false };
  const hoje = hojeEmBuzios(agora);

  // 1. as travas do site
  const travas = await travasDoSite(hoje);
  res.travas = travas.length;
  const voucherDoItem = await vouchersDosItens(travas.map((t) => t.itemPedidoId));
  const lidos = new Map<string, Reserva | null>();
  const ler = async (codigo: string): Promise<Reserva | null> => {
    if (!lidos.has(codigo)) lidos.set(codigo, await obterReserva(codigo));
    return lidos.get(codigo) ?? null;
  };
  const consultados = new Set<string>();
  for (const t of travas) {
    try {
      const codigo = voucherDoItem.get(t.itemPedidoId);
      let v = codigo ? await ler(codigo) : null;
      let decisao = decidirATrava(t, v ? paraARede(v) : null, agora);
      if (decisao.acao === 'consultar' && v && codigo) {
        const pedido = v.pedido?.codigo ?? v.codigo;
        if (!consultados.has(pedido)) {
          consultados.add(pedido);
          res.consultados++;
          await sincronizarComStripe(pedido, agora);
        }
        lidos.delete(codigo);
        v = await ler(codigo);
        decisao = decidirATrava(t, v ? paraARede(v) : null, agora, { consultou: true });
      }
      if (decisao.acao === 'soltar') res.soltas += await soltarTravaVista(t);
      else if (decisao.acao === 'renomear') res.renomeadas += await renomearTravaVista(t, decisao.para);
    } catch (e) {
      res.erros++;
      console.error(`[casas] a rede de segurança não conferiu uma trava da casa ${t.casaId}: ${mensagem(e)}`);
    }
  }

  // 2. as casas pagas têm a trava
  const pedidos = new Map<string, Reserva>();
  for (const codigo of await vouchersDeCasaAFrente(hoje)) {
    try {
      const v = await obterReserva(codigo);
      if (!v || !ehCasa(v) || (v.status !== 'pago' && v.status !== 'contestado') || !seguraAsDatas(v)) continue;
      pedidos.set(v.pedido?.codigo ?? v.codigo, v);
    } catch (e) {
      res.erros++;
      console.error(`[casas] a rede de segurança não leu o voucher ${codigo}: ${mensagem(e)}`);
    }
  }
  for (const [codigo, v] of pedidos) {
    try {
      const vouchers = await vouchersDoPedido(codigo);
      const r = vouchers[0] ?? v;
      const { prendeu, semTrava } = await conferirDatasDoPedidoPago(vouchers, r.pagamentoExternoId ?? `rede-${codigo}`);
      if (prendeu) {
        res.presas++;
        // o pedido deixou de valer enquanto a rede prendia (um reembolso, um cancelamento no mesmo instante): o que ela prendeu sai
        const soltar = datasASoltar(vouchers, await vouchersDoPedido(codigo));
        if (soltar.length) res.soltas += await liberarDatasDosVouchers(soltar);
      }
      if (semTrava.length) {
        res.semTrava += semTrava.length;
        await avisarDatasNaoPresas(r, semTrava);
        console.error(`[casas] o pedido ${codigo} está pago sem as datas da casa presas: ${semTrava.map((s) => s.codigo).join(', ')}`);
      }
    } catch (e) {
      res.erros++;
      console.error(`[casas] a rede de segurança não conferiu as datas do pedido ${codigo}: ${mensagem(e)}`);
    }
  }
  // renomear não muda as noites ocupadas: só soltar e prender mexem no calendário
  res.mudou = res.soltas + res.presas > 0;
  return res;
}

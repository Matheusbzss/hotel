import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { conferirOPagarDeNovo } from '@/lib/casa-no-carrinho';
import { calendarioMudou } from '@/lib/casas';
import { contextoDasCasas } from '@/lib/casas-carrinho';
import { FORMAS_PAGAMENTO, formasDoPagamento, type FormaPagamento } from '@/lib/formas-pagamento';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';
import { podeAbrirSessao } from '@/lib/pagamento-stripe';
import { estadiasDoPedido, liberarDatasDosVouchers } from '@/lib/pedido-carrinho';
import { casasAbertasPara } from '@/lib/reserva-casas';
import { itensPagaveis, tokenConfere } from '@/lib/reserva-publica';
import { ehCasa, type Reserva } from '@/lib/reservas';
import { barrarRobo } from '@/lib/robos-servidor';
import { PixForaDoPrazo } from '@/lib/stripe';
import {
  DatasDaCasaOcupadas,
  DatasNaoPresas,
  EVENTO_DATAS_OCUPADAS,
  PedidoFechado,
  abrirSessaoDoPedido,
  cancelarPedidoAberto,
  vouchersDoPedido,
} from '../../pedido-stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Até quantas sessões novas um mesmo IP pode pedir em 10 minutos. */
const LIMITE_POR_IP = 20;
const JANELA_SEGUNDOS = 600;
const SEM_CACHE = { 'Cache-Control': 'no-store' };

/** A linha do pedido de casa cancelado no "Pagar de novo" porque a conta de agora não é a do pedido (o 409 'mudou'). */
const EVENTO_CONTA_MUDOU = 'Cancelado: o preço ou as regras da casa mudaram desde o pedido';

const Esquema = z.object({
  /** O token do link privado do pedido. */
  t: z.string().min(1).max(64),
  forma: z.enum(FORMAS_PAGAMENTO as [FormaPagamento, ...FormaPagamento[]]),
});

function erro(campo: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, erro: campo, ...extra }, { status, headers: SEM_CACHE });
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * O "Pagar de novo" de um pedido com casa VENCIDO refaz a conta com a tabela e as noites de AGORA (crítica de 26/11, furo
 * 4; conferirOPagarDeNovo): a conta igual ou menor segue; mais cara (a diária subiu), um pacote novo pela metade, a
 * capacidade, o limite de datas ou noite tomada, o pedido é cancelado e a rota responde 409 'mudou' ou 409 'datas', com o
 * slug da casa (a página leva o cliente a escolher de novo); a reserva das casas desligada, 403 'casa-fechada', sem cancelar
 * nada. Devolve a resposta de erro, ou null. Só no pedido vencido: na troca de forma do pedido que espera o pagamento, as
 * datas continuam presas para ele e nada é refeito (revisão de 26/11, achado 2).
 */
async function conferirAsCasas(vouchers: Reserva[], admin: boolean, agora: Date): Promise<NextResponse | null> {
  const casas = vouchers.filter(ehCasa).filter((v) => v.statusItem !== 'cancelado' && v.statusItem !== 'reembolsado');
  if (!casas.length) return null;
  // as noites que o próprio pedido ainda prende (a troca de forma com o pedido pendente) são livres para ele
  const itensProprios = (await estadiasDoPedido(vouchers, { todas: true })).map((e) => e.itemPedidoId);
  const contexto = await contextoDasCasas({
    escolhas: casas.map((c) => ({ tipo: 'casa', slug: c.casa.slug, entrada: c.data, saida: c.saida, hospedes: c.hospedes })),
    admin,
    itensProprios,
  });
  for (const casa of casas) {
    const conferencia = conferirOPagarDeNovo(casa, contexto, agora);
    if (conferencia.ok) continue;
    if (conferencia.erro === 'casa-fechada') return erro('casa-fechada', 403);
    const codigo = casa.pedido?.codigo ?? casa.codigo;
    const cancelado = await cancelarPedidoAberto(codigo, conferencia.erro === 'datas' ? EVENTO_DATAS_OCUPADAS : EVENTO_CONTA_MUDOU).catch(
      (e) => {
        console.error(`[pagar] não deu para cancelar o pedido ${codigo} da casa que mudou: ${mensagem(e)}`);
        return null;
      },
    );
    if (cancelado?.status === 'cancelado') {
      await liberarDatasDosVouchers(vouchers).catch((e) =>
        console.error(`[pagar] não deu para soltar as datas do pedido ${codigo}: ${mensagem(e)}`),
      );
      calendarioMudou();
    }
    return erro(conferencia.erro, 409, { status: cancelado?.status ?? 'cancelado', casa: casa.casa.slug });
  }
  return null;
}

/**
 * Uma sessão de pagamento nova para um pedido que ainda não foi pago: "pagar de novo" depois de a sessão vencer,
 * "cartão recusado? pague com Pix" ou, desde o Pacote 34 (P1), "não consegue pagar com Pix? pague com cartão". Exige o
 * token do link privado (comparado em tempo constante); só para pedido pendente ou expirado; a sessão anterior, se
 * ainda aberta, é expirada assim que a nova fica gravada no pedido, e a nova só volta com a Stripe confirmando que a
 * anterior fechou (abrirSessaoDoPedido explica a ordem). Devolve o `clientSecret` do checkout embutido. O status não muda
 * aqui (um pedido expirado volta a pendente ao gravar a sessão nova); pago, pelo webhook ou, quando a anterior foi paga
 * pouco antes da troca, pela mesma porta do webhook (o 409 'status', com o pedido já pago).
 * Com casa (Etapa 7): no pedido vencido ("Pagar de novo"), a conta é refeita com a tabela de agora (conferirAsCasas); na
 * troca de forma do pedido que espera o pagamento (o cartão recusado → Pix), o preço é o combinado e só a reserva das casas
 * aberta é conferida, porque refazer a conta cancelava o pedido no meio do pagamento por uma diária que baixou ou por uma
 * sexta que ficou livre (revisão de 26/11, achado 2). Nos dois, as datas ficam presas para a sessão nova
 * (abrirSessaoDoPedido: no pedido vencido, elas tinham saído; no que espera, ela confere que continuam presas).
 * Erros: 400 dados, 404 'nao-encontrado' (sem pedido ou sem o token certo), 409 'status', 403 'forma' (com as
 * formas que ainda valem e, sem o Pix, o motivo: 'prazo' ou 'limite'), 403 'robo' (a proteção contra robôs,
 * src/lib/robos.ts: nada gravado), 429 'limite', 502 'stripe' (também quando a Stripe não confirmou que a anterior
 * fechou: o pedido continua com ela, e o cliente pode tentar de novo). Com casa: 409 'mudou' e 409 'datas' (o pedido fica
 * cancelado), 403 'casa-fechada' e 503 'banco' (não deu para prender as datas: o pedido volta a vencido).
 */
export async function POST(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const r = Esquema.safeParse(await req.json().catch(() => null));
  if (!r.success) return erro(r.error.issues[0]?.path.join('.') || 'dados', 400);
  const agora = new Date();
  let temCasa = false;
  try {
    if (!(await permitir(chaveDoLimite('pagar', ipDaRequisicao(req.headers)), LIMITE_POR_IP, JANELA_SEGUNDOS, agora)))
      return erro('limite', 429);

    const vouchers = await vouchersDoPedido(codigo);
    const pedido = vouchers[0];
    // sem pedido ou sem o token certo, a resposta é a mesma: nada a dizer sobre o código
    if (!pedido || !tokenConfere(pedido, r.data.t)) return erro('nao-encontrado', 404);
    if (!podeAbrirSessao(pedido.status)) return erro('status', 409, { status: pedido.status });
    temCasa = vouchers.some(ehCasa);

    // as formas que ainda valem para estes itens (o interruptor, a Stripe e o prazo de cada forma: o Pix até 2 h antes do
    // primeiro item e dentro do limite de valor de um Pix; o cartão até 30 minutos antes; a casa não se paga no dia da entrada)
    const admin = sessaoValida((await cookies()).get(COOKIE_ADMIN)?.value);
    const { formas, semPix } = await formasDoPagamento(itensPagaveis(vouchers), agora, { admin });
    if (!formas.includes(r.data.forma)) return erro('forma', 403, { formas, ...(semPix ? { semPix } : {}) });

    // a proteção contra robôs (src/lib/robos.ts): depois do limite por endereço, do token e das conferências, e antes de
    // abrir a sessão na Stripe. Robô: 403 'robo' e nada gravado
    const robo = await barrarRobo('POST /api/pedido/[codigo]/pagar');
    if (robo) return robo;

    if (temCasa) {
      // o vencido refaz a conta; o que espera o pagamento só confere que a reserva das casas continua aberta (o freio)
      const recusa =
        pedido.status === 'expirado'
          ? await conferirAsCasas(vouchers, admin, agora)
          : (await casasAbertasPara({ admin }).catch(() => false))
            ? null
            : erro('casa-fechada', 403);
      if (recusa) return recusa;
    }

    const sessao = await abrirSessaoDoPedido(vouchers, r.data.forma, agora, { seATravaFalhar: 'vencer' });
    if (temCasa) calendarioMudou();
    return NextResponse.json(
      { ok: true, codigo: sessao.codigo, forma: sessao.forma, clientSecret: sessao.clientSecret },
      { headers: SEM_CACHE },
    );
  } catch (e) {
    if (temCasa) calendarioMudou();
    // pago em outra aba (ou cancelado) enquanto a sessão nova nascia: a página do pedido mostra o estado de verdade
    if (e instanceof PedidoFechado) return erro('status', 409, { status: e.status });
    // o prazo do Pix passou entre a conferência das formas e a sessão (a mesma conta, validadeDoPix): como o 403 acima
    if (e instanceof PixForaDoPrazo) return erro('forma', 403, { semPix: 'prazo' });
    // as noites da casa ficaram de outra pessoa: o pedido já foi cancelado (o 409 'datas')
    if (e instanceof DatasDaCasaOcupadas) return erro('datas', 409, { status: 'cancelado' });
    // o banco não prendeu as datas: o pedido voltou a vencido e a sessão nova fechou; o cliente pode tentar de novo
    if (e instanceof DatasNaoPresas) return erro('banco', 503);
    console.error(`[pagar] a sessão de pagamento do pedido ${codigo} não pôde ser criada: ${e instanceof Error ? e.message : String(e)}`);
    return erro('stripe', 502);
  }
}

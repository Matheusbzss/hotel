import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { IDIOMAS } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { MAXIMO_ITENS } from '@/lib/carrinho';
import { COOKIE_CARRINHO, casaOcupada, conferirEscolha, gravarCarrinho, lerCarrinho } from '@/lib/carrinho-servidor';
import { cruzaComAMesmaCasa } from '@/lib/casa-no-carrinho';
import { calendarioMudou } from '@/lib/casas';
import { contextoDoCarrinho } from '@/lib/casas-carrinho';
import { agendarEmailDoPedido } from '@/lib/email/pedidos';
import { hospedagemDoCheckout } from '@/lib/hospedagem';
import { FORMAS_PAGAMENTO, formasDoPagamento, valorACobrar, type FormaPagamento } from '@/lib/formas-pagamento';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';
import { origemDaVisita } from '@/lib/origem-servidor';
import { podeAbrirSessao } from '@/lib/pagamento-stripe';
import { liberarDatasDosVouchers, pedidoDeCasaEsperando, reservaDoItem } from '@/lib/pedido-carrinho';
import { criarPedido } from '@/lib/reservas';
import { CIDADES_HOSPEDAGEM, emailValido, telefoneParaGravar, telefoneValido } from '@/lib/validacao';
import {
  DatasDaCasaOcupadas,
  DatasNaoPresas,
  abrirSessaoDoPedido,
  cancelarPedidoAberto,
  itemAgendado,
  vouchersDoPedido,
} from './pedido-stripe';
import { mensagemDoErro } from '@/lib/erros';
import { barrarRobo } from '@/lib/robos-servidor';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Até quantos pedidos um mesmo IP pode fazer em 10 minutos (cada um abre uma sessão na Stripe). */
const LIMITE_POR_IP = 20;
const JANELA_SEGUNDOS = 600;
/**
 * Até quantos pedidos COM CASA um mesmo IP pode fazer por hora (crítica de 26/11, furo 21: cada um prende as noites por
 * até 61 minutos). O IP não fica gravado no pedido e as redes de celular dividem um IP entre muita gente: o limite por IP
 * é uma contagem por hora, e o "um pedido esperando" de verdade é o do e-mail (pedidoDeCasaEsperando) e o do carrinho (o
 * pedido anterior do mesmo carrinho é cancelado quando o cliente refaz).
 */
const PEDIDOS_DE_CASA_POR_IP = 3;
const JANELA_DA_CASA_SEGUNDOS = 3600;

const texto = (max: number) => z.string().trim().min(1).max(max);

const Esquema = z.object({
  idioma: z.enum(IDIOMAS),
  /** Os itens que o cliente viu: se o carrinho mudou, ele confere de novo antes de enviar. */
  ids: z.array(z.string().max(40)).min(1).max(MAXIMO_ITENS),
  cliente: z.object({
    nome: texto(120),
    email: texto(160),
    ddi: z.string().max(4),
    telefone: z.string().max(24),
  }),
  /**
   * A hospedagem dos passeios. O hotel é obrigatório, a não ser que o cliente tenha marcado "Ainda não sei" (aInformar):
   * aí o pedido vai sem o hotel e a equipe pede pelo WhatsApp (src/lib/hospedagem.ts).
   */
  hospedagem: z
    .object({ cidade: z.enum(CIDADES_HOSPEDAGEM), hotel: z.string().trim().max(120), aInformar: z.boolean().optional() })
    .optional(),
  /** Por item de transfer: os voos e a idade de cada criança que vai de cadeirinha ou assento de elevação. */
  transfers: z
    .record(
      z.string().max(40),
      z.object({
        vooIda: z.string().trim().max(12).optional().default(''),
        vooVolta: z.string().trim().max(12).optional().default(''),
        cadeirinhas: z.array(z.number().int().min(0).max(12)).max(17).optional().default([]),
      }),
    )
    .optional()
    .default({}),
  observacoes: z.string().trim().max(600).optional().default(''),
  aceite: z.literal(true),
  /** A forma de pagamento online (cartão ou Pix). Sem ela, e sem pagamento online para este cliente, o caminho do WhatsApp. */
  pagamento: z.enum(FORMAS_PAGAMENTO as [FormaPagamento, ...FormaPagamento[]]).optional(),
  /** Campo-isca contra robôs: precisa vir vazio. */
  site: z.string().max(0).optional(),
});

function erro(campo: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, erro: campo, ...extra }, { status });
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Fecha o carrinho do cookie num pedido: os dados do titular uma vez só, um pagamento e um voucher por item. Os
 * itens e os preços vêm do servidor, nunca do navegador. Com uma forma de pagamento online, o pedido nasce
 * pendente (provedor stripe, a forma escolhida, os totais do cartão e do Pix de cada item: a sessão cobra
 * valorACobrar na forma) e volta com `{ codigo, token, clientSecret, forma }` para o checkout embutido; o pedido só
 * vira pago pelo webhook, e o cookie do carrinho fica até lá. Sem pagamento online para este cliente (interruptor
 * PAGAMENTO_ONLINE), o caminho do WhatsApp de hoje.
 * Erros: 400 com o campo; 409 'mudou'; 403 'forma' (com as formas que ainda valem e, sem o Pix, o motivo: 'prazo' ou
 * 'limite'); 400 'pagamento' (o pagamento online está no ar e a forma não veio); 429 'limite'; 403 'robo' (a proteção
 * contra robôs, src/lib/robos.ts: nada gravado); 502 'stripe' (o pedido fica cancelado e o carrinho continua); 503 'banco'.
 * Com casa (Etapa 7): 409 'datas' (alguma noite ficou ocupada, antes de criar o pedido ou na hora de prender as datas: o
 * pedido fica cancelado); 403 'casa-so-online' (a casa só se paga pelo site, nunca pelo WhatsApp); 403 'casa-fechada' (a
 * reserva das casas fechou para este visitante); 409 'casa-esperando' (já há um pedido de casa esperando o pagamento com
 * este e-mail). O pedido com casa guarda o que cobra hoje (pagamento.cobrar) e prende as datas com a sessão.
 */
export async function POST(req: Request) {
  const r = Esquema.safeParse(await req.json().catch(() => null));
  if (!r.success) return erro(r.error.issues[0]?.path.join('.') || 'dados');
  const e = r.data;
  if (!emailValido(e.cliente.email)) return erro('cliente.email');
  if (!telefoneValido(e.cliente.ddi, e.cliente.telefone)) return erro('cliente.telefone');
  // sem o nome do hotel e sem o "Ainda não sei" marcado, o mesmo erro de antes
  const hospedagem = e.hospedagem ? hospedagemDoCheckout(e.hospedagem) : undefined;
  if (hospedagem === null) return erro('hospedagem.hotel');

  const loja = await cookies();
  const codigoCarrinho = loja.get(COOKIE_CARRINHO)?.value;
  const agora = new Date();
  const ip = ipDaRequisicao(req.headers);
  const admin = sessaoValida(loja.get(COOKIE_ADMIN)?.value);
  try {
    // um robô não enche o painel de pedidos pendentes nem abre sessões à toa na Stripe
    if (!(await permitir(chaveDoLimite('pedido', ip), LIMITE_POR_IP, JANELA_SEGUNDOS, agora))) return erro('limite', 429);

    const carrinho = await lerCarrinho(codigoCarrinho);
    // a casa: o contexto (as noites ocupadas de agora, lidas sem cache, sem as do próprio pedido do carrinho), lido antes
    // de conferir; o carrinho sem casa não lê nada a mais
    const contexto = await contextoDoCarrinho(carrinho, { admin });
    const todas = carrinho.itens.map((i) => ({ id: i.id, c: conferirEscolha(i.escolha, contexto, agora) }));
    // a casa que alguém reservou enquanto estava no carrinho: o cliente escolhe outras datas (nunca o 'mudou' genérico)
    if (todas.some(({ c }) => casaOcupada(c))) return erro('datas', 409);
    // a reserva das casas fechou para este visitante (o interruptor RESERVA_CASAS ou o pagamento online)
    if (todas.some(({ c }) => !c.ok && c.erro === 'casa-fechada')) return erro('casa-fechada', 403);
    const conferidas = todas.flatMap(({ id, c }) => (c.ok ? [{ id, c }] : []));
    // um item venceu agora (a data ou o horário passou) ou o carrinho mudou em outra aba: o cliente confere antes
    const igual = conferidas.length === e.ids.length && conferidas.every(({ id }) => e.ids.includes(id));
    if (!codigoCarrinho || !igual) return erro('mudou', 409);
    // a mesma casa duas vezes com noites que se cruzam (duas abas): a função do banco também recusaria, depois
    const casas = conferidas.flatMap(({ c }) => ('casa' in c ? [c.escolha] : []));
    if (casas.some((casa, i) => cruzaComAMesmaCasa(casa, casas.slice(i + 1)))) return erro('datas', 409);
    const temCasa = casas.length > 0;

    // a forma de pagamento: só as que o checkout oferece agora a este cliente (o interruptor, a Stripe, o prazo de cada
    // forma e o limite de valor do Pix, sobre os preços do servidor; na casa, o sinal)
    const { formas, semPix } = await formasDoPagamento(
      conferidas.map(({ c }) => ({
        ...itemAgendado(c.escolha),
        totalCentavos: c.totalCentavos,
        totalPixCentavos: c.totalPixCentavos,
        ...('casa' in c ? { sinalCentavos: c.sinalCentavos, sinalPixCentavos: c.sinalPixCentavos } : {}),
      })),
      agora,
      { admin },
    );
    let forma: FormaPagamento | undefined;
    if (e.pagamento) {
      if (!formas.includes(e.pagamento)) return erro('forma', 403, { formas, ...(semPix ? { semPix } : {}) });
      forma = e.pagamento;
    } else if (formas.length) {
      // com pagamento online no ar, o formulário sempre manda a forma
      return erro('pagamento');
    }
    // a casa só se paga aqui no site: o caminho "registrar e finalizar pelo WhatsApp" não serve para ela
    if (temCasa && !forma) return erro('casa-so-online', 403);

    const dados = {
      idioma: e.idioma,
      cliente: {
        nome: e.cliente.nome,
        email: e.cliente.email.toLowerCase(),
        // sem o código do país repetido no começo do número (Pacote 34, P5): "+54 9 11…" com a caixa na Argentina vira
        // "+54 911…", nunca "+54 54911…" (semDdiRepetido, src/lib/validacao.ts)
        telefone: telefoneParaGravar(e.cliente.ddi, e.cliente.telefone),
      },
      hospedagem,
      observacoes: e.observacoes || undefined,
      // a campanha guardada no carrinho vale se o cookie da visita já tiver vencido
      origem: { ...carrinho.origem, ...(await origemDaVisita()) },
      pagamento: forma,
    };
    const novas = [];
    for (const { id, c } of conferidas) {
      if ('passeio' in c && !hospedagem) return erro('hospedagem');
      const extras = 'trechosCentavos' in c ? e.transfers[id] : undefined;
      if ('trechosCentavos' in c && extras && extras.cadeirinhas.length > c.escolha.passageiros) return erro('cadeirinhas');
      novas.push(reservaDoItem(c, dados, extras));
    }
    if (temCasa) {
      // o que o pedido cobra hoje em cada forma (a casa, o sinal; o resto, o total): é o valor esperado do pagamento, e o
      // sinal pago não dá o aviso de valor diferente (valorEsperadoDoPedido, src/lib/pedidos-painel.ts)
      const cobrar = { cartao: valorACobrar(novas, 'cartao'), pix: valorACobrar(novas, 'pix') };
      for (const n of novas) n.pagamento = { ...n.pagamento, cobrar };
      // no máximo um pedido de casa esperando o pagamento por e-mail (o do próprio carrinho é cancelado logo abaixo)
      if (await pedidoDeCasaEsperando(dados.cliente.email, carrinho.pedido?.codigo)) return erro('casa-esperando', 409);
    }

    // a proteção contra robôs (src/lib/robos.ts): depois do campo-isca, das conferências e do limite por endereço, e antes
    // de qualquer gravação (o pedido, o carrinho, o e-mail, a sessão na Stripe). Robô: 403 'robo' e nada gravado
    const robo = await barrarRobo('POST /api/pedido');
    if (robo) return robo;
    // e o teto dos pedidos de casa por IP, que só conta quem passou da proteção
    if (temCasa && !(await permitir(chaveDoLimite('pedido-casa', ip), PEDIDOS_DE_CASA_POR_IP, JANELA_DA_CASA_SEGUNDOS, agora)))
      return erro('limite', 429);

    const pedido = await criarPedido(novas);
    // o pedido já existe: se marcar o carrinho falhar, o cliente não pode ver erro e enviar de novo
    await gravarCarrinho(codigoCarrinho, { pedidoId: pedido.id, email: dados.cliente.email }).catch((err) =>
      console.error(`[pedido] falha ao marcar o carrinho: ${mensagemDoErro(err)}`),
    );
    // o e-mail do pedido recebido, com o link privado (Etapa 6): sai depois da resposta e só se o pedido ainda estiver
    // esperando o pagamento nessa hora (o que deu errado na sessão de pagamento, logo abaixo, cancela o pedido antes)
    agendarEmailDoPedido('pedido-recebido', pedido.codigo);
    const resposta = { ok: true, codigo: pedido.codigo, token: pedido.token, itens: novas.length };

    // o cliente refez o pedido a partir do mesmo carrinho (mudou um item, voltou do formulário da Stripe): o anterior,
    // ainda em aberto, não pode mais ser pago. Só agora, com o novo gravado: se ele falhasse, o anterior continuava valendo.
    // Se a gravação do cancelamento falhar, a sessão do anterior fecha mesmo assim (fecharMesmoSemGravar; terceira
    // conferência do Pacote 29): o novo é o que vale
    const anterior = carrinho.pedido;
    // as datas de alguma casa saíram ou foram presas: as páginas das casas refazem (calendarioMudou só nas rotas)
    let mexeuNoCalendario = false;
    if (anterior && podeAbrirSessao(anterior.status)) {
      const cancelado = await cancelarPedidoAberto(anterior.codigo, `Cancelado: o cliente refez o pedido (${pedido.codigo})`, {
        fecharMesmoSemGravar: true,
      }).catch((err) => {
        console.error(`[pedido] falha ao cancelar o pedido anterior ${anterior.codigo}`, mensagem(err));
        return null;
      });
      // as datas das casas do anterior saem também pelo item do pedido (a sessão dele pode ter tido outra referência), para
      // o pedido novo prender as mesmas noites logo abaixo
      if (cancelado?.status === 'cancelado') {
        const soltas = await liberarDatasDosVouchers(await vouchersDoPedido(anterior.codigo)).catch((err) => {
          console.error(`[pedido] falha ao soltar as datas do pedido anterior ${anterior.codigo}`, mensagem(err));
          return 0;
        });
        if (soltas > 0) mexeuNoCalendario = true;
      }
    }

    if (!forma) {
      // o caminho do WhatsApp: o carrinho acabou aqui
      if (mexeuNoCalendario) calendarioMudou();
      loja.delete(COOKIE_CARRINHO);
      return NextResponse.json(resposta);
    }

    try {
      const sessao = await abrirSessaoDoPedido(await vouchersDoPedido(pedido.codigo), forma, agora, { seATravaFalhar: 'cancelar' });
      if (temCasa || mexeuNoCalendario) calendarioMudou();
      // o cookie do carrinho fica: o carrinho só acaba quando o pedido virar pago (GET /api/carrinho cuida disso)
      return NextResponse.json({ ...resposta, forma, clientSecret: sessao.clientSecret });
    } catch (err) {
      if (temCasa || mexeuNoCalendario) calendarioMudou();
      // as noites da casa ficaram de outra pessoa na hora de prender: o pedido já foi cancelado, e o cliente escolhe outras
      if (err instanceof DatasDaCasaOcupadas) return erro('datas', 409);
      // o banco não prendeu as datas: o pedido já foi cancelado e a sessão fechou; o carrinho continua para tentar de novo
      if (err instanceof DatasNaoPresas) return erro('banco', 503);
      console.error(`[pedido] a sessão de pagamento do pedido ${pedido.codigo} não pôde ser criada: ${mensagem(err)}`);
      await cancelarPedidoAberto(pedido.codigo, 'Cancelado: a sessão de pagamento não pôde ser criada').catch((e2) =>
        console.error(`[pedido] falha ao cancelar o pedido ${pedido.codigo}`, mensagem(e2)),
      );
      return erro('stripe', 502);
    }
  } catch (err) {
    console.error(`[pedido] falha ao gravar o pedido: ${mensagemDoErro(err)}`);
    return erro('banco', 503);
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { IDIOMAS } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { MAXIMO_ITENS } from '@/lib/carrinho';
import { COOKIE_CARRINHO, conferirEscolha, gravarCarrinho, lerCarrinho } from '@/lib/carrinho-servidor';
import { agendarEmailDoPedido } from '@/lib/email/pedidos';
import { FORMAS_PAGAMENTO, formasDoPagamento, type FormaPagamento } from '@/lib/formas-pagamento';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';
import { origemDaVisita } from '@/lib/origem-servidor';
import { podeAbrirSessao } from '@/lib/pagamento-stripe';
import { reservaDoItem } from '@/lib/pedido-carrinho';
import { criarPedido } from '@/lib/reservas';
import { CIDADES_HOSPEDAGEM, emailValido, soDigitos, telefoneValido } from '@/lib/validacao';
import { abrirSessaoDoPedido, cancelarPedidoAberto, itemAgendado, vouchersDoPedido } from './pedido-stripe';
import { mensagemDoErro } from '@/lib/erros';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Até quantos pedidos um mesmo IP pode fazer em 10 minutos (cada um abre uma sessão na Stripe). */
const LIMITE_POR_IP = 20;
const JANELA_SEGUNDOS = 600;

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
  hospedagem: z.object({ cidade: z.enum(CIDADES_HOSPEDAGEM), hotel: texto(120) }).optional(),
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
 * 'limite'); 400 'pagamento' (o pagamento online está no ar e a forma não veio); 429 'limite'; 502 'stripe' (o pedido
 * fica cancelado e o carrinho continua); 503 'banco'.
 */
export async function POST(req: Request) {
  const r = Esquema.safeParse(await req.json().catch(() => null));
  if (!r.success) return erro(r.error.issues[0]?.path.join('.') || 'dados');
  const e = r.data;
  if (!emailValido(e.cliente.email)) return erro('cliente.email');
  if (!telefoneValido(e.cliente.ddi, e.cliente.telefone)) return erro('cliente.telefone');

  const loja = await cookies();
  const codigoCarrinho = loja.get(COOKIE_CARRINHO)?.value;
  const agora = new Date();
  try {
    // um robô não enche o painel de pedidos pendentes nem abre sessões à toa na Stripe
    if (!(await permitir(chaveDoLimite('pedido', ipDaRequisicao(req.headers)), LIMITE_POR_IP, JANELA_SEGUNDOS, agora)))
      return erro('limite', 429);

    const carrinho = await lerCarrinho(codigoCarrinho);
    const conferidas = carrinho.itens.flatMap((i) => {
      const c = conferirEscolha(i.escolha, agora);
      return c.ok ? [{ id: i.id, c }] : [];
    });
    // um item venceu agora (a data ou o horário passou) ou o carrinho mudou em outra aba: o cliente confere antes
    const igual = conferidas.length === e.ids.length && conferidas.every(({ id }) => e.ids.includes(id));
    if (!codigoCarrinho || !igual) return erro('mudou', 409);

    // a forma de pagamento: só as que o checkout oferece agora a este cliente (o interruptor, a Stripe, o prazo de cada
    // forma e o limite de valor do Pix, sobre os preços do servidor)
    const admin = sessaoValida(loja.get(COOKIE_ADMIN)?.value);
    const { formas, semPix } = await formasDoPagamento(
      conferidas.map(({ c }) => ({ ...itemAgendado(c.escolha), totalCentavos: c.totalCentavos, totalPixCentavos: c.totalPixCentavos })),
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

    const dados = {
      idioma: e.idioma,
      cliente: {
        nome: e.cliente.nome,
        email: e.cliente.email.toLowerCase(),
        telefone: `+${soDigitos(e.cliente.ddi)} ${soDigitos(e.cliente.telefone)}`,
      },
      hospedagem: e.hospedagem,
      observacoes: e.observacoes || undefined,
      // a campanha guardada no carrinho vale se o cookie da visita já tiver vencido
      origem: { ...carrinho.origem, ...(await origemDaVisita()) },
      pagamento: forma,
    };
    const novas = [];
    for (const { id, c } of conferidas) {
      if ('passeio' in c && !e.hospedagem) return erro('hospedagem');
      const extras = e.transfers[id];
      if (!('passeio' in c) && extras && extras.cadeirinhas.length > c.escolha.passageiros) return erro('cadeirinhas');
      novas.push(reservaDoItem(c, dados, extras));
    }

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
    // ainda em aberto, não pode mais ser pago. Só agora, com o novo gravado: se ele falhasse, o anterior continuava valendo
    const anterior = carrinho.pedido;
    if (anterior && podeAbrirSessao(anterior.status)) {
      await cancelarPedidoAberto(anterior.codigo, `Cancelado: o cliente refez o pedido (${pedido.codigo})`).catch((err) =>
        console.error(`[pedido] falha ao cancelar o pedido anterior ${anterior.codigo}`, mensagem(err)),
      );
    }

    if (!forma) {
      // o caminho do WhatsApp: o carrinho acabou aqui
      loja.delete(COOKIE_CARRINHO);
      return NextResponse.json(resposta);
    }

    try {
      const sessao = await abrirSessaoDoPedido(await vouchersDoPedido(pedido.codigo), forma, agora);
      // o cookie do carrinho fica: o carrinho só acaba quando o pedido virar pago (GET /api/carrinho cuida disso)
      return NextResponse.json({ ...resposta, forma, clientSecret: sessao.clientSecret });
    } catch (err) {
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

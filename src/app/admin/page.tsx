import { cookies } from 'next/headers';
import { EMPRESA } from '@/config/empresa';
import { COOKIE_ADMIN, adminConfigurado, sessaoValida } from '@/lib/admin-auth';
import { contarCotacoesNovas } from '@/lib/cotacoes';
import { modoPagamentoOnline } from '@/lib/formas-pagamento';
import { textoDaOrigem } from '@/lib/origem';
import { linkPainelStripe, modoStripe } from '@/lib/stripe';
import { obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { formatarHora } from '@/lib/horarios';
import { semFaixas } from '@/lib/passeio-view';
import {
  agruparPedidos,
  avisosDeContestacao,
  contestacoesAbertas,
  ehAviso,
  fraseDoErro,
  motivoNoPainel,
  oQueFazerNaContestacao,
  valorRecebido,
  type PedidoPainel,
} from '@/lib/pedidos-painel';
import { textoPessoas } from '@/lib/pessoas';
import { formatarPreco } from '@/lib/precos';
import {
  ehTransfer,
  listarReservas,
  ondeFicamAsReservas,
  type Reserva,
  type ReservaPasseio,
  type ReservaTransfer,
  type StatusItem,
  type StatusReserva,
} from '@/lib/reservas';
import { transferVisivel } from '@/lib/transfer-view';
import { NOME_CIDADE_HOSPEDAGEM, formatarDataIso } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

const ROTULO: Record<StatusReserva, string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  expirado: 'Tempo esgotado',
  aguardando_whatsapp: 'Finalizar no WhatsApp',
  reembolsado: 'Reembolsado',
  contestado: 'Contestado',
};

const COR: Record<StatusReserva, string> = {
  pendente: 'bg-sol text-mar',
  pago: 'bg-[#d8f5e4] text-[#0f5132]',
  recusado: 'bg-erro-claro text-[#7a1f12]',
  cancelado: 'bg-[#e5e9ee] text-mar',
  expirado: 'bg-[#e5e9ee] text-mar',
  aguardando_whatsapp: 'bg-turquesa text-mar',
  reembolsado: 'bg-[#e5e9ee] text-mar',
  contestado: 'bg-erro-claro text-[#7a1f12]',
};

/** O status de um voucher dentro do pedido, quando difere do pedido (um item reembolsado ou cancelado sozinho). */
const ROTULO_ITEM: Record<StatusItem, string> = { ativo: 'Ativo', cancelado: 'Cancelado', reembolsado: 'Reembolsado', usado: 'Usado' };

const PROVEDOR: Record<PedidoPainel['provedor'], string> = {
  stripe: 'Stripe',
  pagarme: 'Pagar.me (checkout antigo)',
  whatsapp: 'WhatsApp',
};

const DICIONARIO_PT = dicionario('pt');
const ROTULOS_PESSOAS = DICIONARIO_PT.comum.rotulos;

const FILTROS: { valor: string; rotulo: string; status?: StatusReserva[] }[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'pagas', rotulo: 'Pagos', status: ['pago'] },
  { valor: 'abertas', rotulo: 'Em aberto', status: ['pendente', 'aguardando_whatsapp'] },
  { valor: 'contestados', rotulo: 'Contestados', status: ['contestado'] },
  { valor: 'outras', rotulo: 'Recusados / cancelados', status: ['recusado', 'cancelado', 'expirado', 'reembolsado'] },
];

/** Os pedidos cuja forma de pagamento ainda não fechou: os dois totais (Pix e cartão) continuam valendo. */
const EM_ABERTO: readonly StatusReserva[] = ['aguardando_whatsapp', 'pendente', 'expirado', 'recusado'];

const dataHora = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
    : '—';

/** Quanto o cliente viu na moeda dele (Adaptive Pricing), que a Stripe guarda na menor unidade da moeda. */
function moedaApresentada(a: { moeda: string; valorCentavos: number }): string {
  try {
    const formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: a.moeda });
    const casas = formato.resolvedOptions().maximumFractionDigits ?? 2;
    return formato.format(a.valorCentavos / 10 ** casas);
  } catch {
    return `${a.moeda} ${a.valorCentavos}`;
  }
}

/** O que o cabeçalho diz do pagamento online: a Stripe (teste ou produção) e o interruptor, ou desligado. */
function textoPagamentoOnline(): string {
  const stripe = modoStripe();
  if (stripe === 'desligado') return 'desligado — pedidos finalizados pelo WhatsApp';
  const interruptor = modoPagamentoOnline();
  const quem =
    interruptor === 'publico'
      ? 'aberto ao público'
      : interruptor === 'admin'
        ? 'só para o admin'
        : 'interruptor PAGAMENTO_ONLINE desligado';
  return `Stripe (${stripe === 'producao' ? 'produção' : 'teste'}), ${quem}`;
}

function Login({ erro }: { erro?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/orla-nativa-horizontal.svg" alt={EMPRESA.marca} width={711} height={172} className="h-14 w-auto self-start" />
      <h1 className="mt-8 text-2xl font-bold text-mar">Área administrativa</h1>
      {!adminConfigurado() && (
        <p className="mt-4 bg-sol px-4 py-3 text-small">
          Defina a variável de ambiente <strong>ADMIN_PASSWORD</strong> na Vercel para liberar o acesso.
        </p>
      )}
      <form method="post" action="/api/admin/login" className="mt-6 space-y-4">
        <div>
          <label htmlFor="senha" className="rotulo">
            Senha
          </label>
          <input id="senha" name="senha" type="password" autoComplete="current-password" className="campo" required autoFocus />
        </div>
        {erro === 'senha' && (
          <p className="erro-campo" role="alert">
            Senha incorreta.
          </p>
        )}
        {erro === 'limite' && (
          <p className="erro-campo" role="alert">
            Muitas tentativas. Espere 15 minutos e tente de novo.
          </p>
        )}
        <button type="submit" className="botao w-full">
          Entrar
        </button>
      </form>
    </main>
  );
}

/** O passeio, a data, a hora, as pessoas e a hospedagem. */
function DetalhesPasseio({ r }: { r: ReservaPasseio }) {
  const p = obterPasseio(r.passeio.slug);
  return (
    <>
      <p className="font-bold">
        {r.passeio.nome}
        {r.passeio.opcao ? ` — ${r.passeio.opcao.nome}` : ''}
      </p>
      <p>
        {formatarDataIso(r.data, 'pt-BR')} ·{' '}
        {r.horario && (
          <>
            <strong>
              {r.horario.busca ? 'Busca na hospedagem' : 'Saída'} às {formatarHora(r.horario.hora, 'pt')}
            </strong>{' '}
            ·{' '}
          </>
        )}
        {textoPessoas(r, ROTULOS_PESSOAS, p ? semFaixas(p) : false)}
        {r.passeio.unidade !== 'pessoa' ? ` · ${r.unidades} ${r.passeio.unidade === 'veiculo' ? 'veículo(s)' : 'embarcação(ões)'}` : ''}
      </p>
      <p>
        Hotel: <strong>{r.hospedagem.hotel}</strong> ({NOME_CIDADE_HOSPEDAGEM[r.hospedagem.cidade]})
      </p>
    </>
  );
}

/** O transfer: o veículo, a ida e a volta (com voo), os passageiros, as malas e as cadeirinhas. */
function DetalhesTransfer({ r }: { r: ReservaTransfer }) {
  const v = transferVisivel(r, 'pt', DICIONARIO_PT);
  const trechos = [
    ['Ida', v.ida],
    ['Volta', v.volta],
  ] as const;
  return (
    <>
      <p className="font-bold">Transfer privado — {v.veiculo}</p>
      {trechos.map(
        ([rotulo, t]) =>
          t && (
            <p key={rotulo}>
              {rotulo}:{' '}
              <strong>
                {formatarDataIso(t.data, 'pt-BR')} às {t.hora}
              </strong>{' '}
              · {t.saida} → {t.destino}
              {t.voo ? ` · voo ${t.voo}` : ''}
            </p>
          ),
      )}
      <p>
        {v.passageiros} · {v.malas}
      </p>
      {v.cadeirinhas && <p>Cadeirinhas: {v.cadeirinhas}</p>}
    </>
  );
}

/** O que a busca do painel procura além do código e do contato: o passeio e o hotel, ou os endereços do transfer. */
function textosDaBusca(r: Reserva): string[] {
  if (!ehTransfer(r)) return [r.hospedagem.hotel, r.passeio.nome];
  const t = r.transfer;
  return ['transfer', t.ida.saida.endereco, t.ida.destino.endereco, t.volta?.saida.endereco, t.volta?.destino.endereco].filter(
    (x): x is string => Boolean(x),
  );
}

/**
 * Um botão de ação do pedido: um form POST para a rota do painel, com o código do voucher no endereço. No
 * reembolso de um item só, o voucher a reembolsar vai também no campo `voucher` (é dele que a rota lê).
 */
function BotaoAcao({
  voucher,
  acao,
  rotulo,
  filtro,
  cor = 'bg-superficie',
  item,
}: {
  voucher: string;
  acao: string;
  rotulo: string;
  filtro: string;
  cor?: string;
  item?: string;
}) {
  return (
    <form method="post" action={`/api/admin/reservas/${voucher}`}>
      <input type="hidden" name="acao" value={acao} />
      <input type="hidden" name="filtro" value={filtro} />
      {item && <input type="hidden" name="voucher" value={item} />}
      <button type="submit" className={`min-h-10 px-4 text-small font-semibold text-mar hover:bg-borda ${cor}`}>
        {rotulo}
      </button>
    </form>
  );
}

/**
 * Devolver o dinheiro pela Stripe: tudo, ou um voucher só (a chuva num passeio de um pedido de três). Fica atrás
 * de um "abrir" porque não dá para desfazer. O status do pedido só muda quando a Stripe confirmar (webhook
 * charge.refunded): até lá o painel mostra o pedido como está.
 */
function ReembolsoStripe({ p, filtro }: { p: PedidoPainel; filtro: string }) {
  const r = p.itens[0];
  const restante = p.recebidoCentavos - p.reembolsoCentavos;
  if (!r.paymentIntentId || restante <= 0) return null;
  const vouchersAtivos = p.itens.filter((i) => (i.statusItem ?? 'ativo') === 'ativo');
  return (
    <details className="text-small">
      <summary className="inline-flex min-h-10 cursor-pointer items-center bg-superficie px-4 font-semibold text-mar hover:bg-borda">
        Reembolsar na Stripe…
      </summary>
      <div className="mt-2 space-y-2 border border-borda bg-white p-3">
        <p className="text-tinta-suave">
          Devolve o dinheiro pela Stripe (cartão: 5 a 10 dias úteis; Pix: alguns minutos). Não dá para desfazer. O status muda quando a
          Stripe confirmar.
        </p>
        <BotaoAcao
          voucher={r.codigo}
          acao="reembolsar"
          rotulo={`Reembolsar tudo (${formatarPreco(restante)})`}
          filtro={filtro}
          cor="bg-erro-claro"
        />
        {p.itens.length > 1 &&
          vouchersAtivos.map((i) => (
            <BotaoAcao
              key={i.codigo}
              voucher={i.codigo}
              item={i.codigo}
              acao="reembolsar_item"
              rotulo={`Reembolsar só o voucher ${i.codigo} (${formatarPreco(valorRecebido(i))})`}
              filtro={filtro}
            />
          ))}
      </div>
    </details>
  );
}

/** O status é do pedido inteiro, com todos os vouchers: um pagamento só. */
function Acoes({ p, filtro }: { p: PedidoPainel; filtro: string }) {
  const r = p.itens[0];
  const stripe = p.provedor === 'stripe';
  const acoes: { acao: string; rotulo: string }[] = [];
  if (EM_ABERTO.includes(p.status)) {
    if (p.metodo === 'whatsapp') {
      // a forma de pagamento define quanto entrou
      acoes.push(
        { acao: 'pago_pix', rotulo: `Pago no Pix (${formatarPreco(p.totalPixCentavos ?? p.totalCentavos)})` },
        { acao: 'pago_cartao', rotulo: `Pago no cartão (${formatarPreco(p.totalCentavos)})` },
      );
    } else if (!stripe) {
      // pela Stripe ninguém marca pago à mão: só o webhook (ou a consulta à sessão) muda o status
      acoes.push({ acao: 'marcar_pago', rotulo: 'Marcar como pago' });
    }
  }
  // marcou errado: dá para trocar, menos no pagamento online, que veio do sistema de pagamento
  if (p.status === 'pago' && !stripe && !r.pagamento.pedidoId) {
    if (p.metodo !== 'pix') acoes.push({ acao: 'pago_pix', rotulo: 'Corrigir: foi no Pix' });
    if (p.metodo !== 'cartao') acoes.push({ acao: 'pago_cartao', rotulo: 'Corrigir: foi no cartão' });
  }
  // um pedido pago pela Stripe se desfaz com o reembolso, não com o cancelamento
  const pagoNaStripe = stripe && (p.status === 'pago' || p.status === 'contestado');
  if (p.status !== 'cancelado' && p.status !== 'reembolsado' && !pagoNaStripe) acoes.push({ acao: 'cancelar', rotulo: 'Cancelar' });
  if (!stripe && (p.status === 'pago' || p.status === 'cancelado')) acoes.push({ acao: 'reembolsado', rotulo: 'Marcar reembolsado' });
  return (
    <div className="flex flex-wrap items-start gap-2">
      {acoes.map((a) => (
        <BotaoAcao key={a.acao} voucher={r.codigo} acao={a.acao} rotulo={a.rotulo} filtro={filtro} />
      ))}
      {pagoNaStripe && <ReembolsoStripe p={p} filtro={filtro} />}
    </div>
  );
}

/** O id na Stripe, com o link para o painel dela (em modo teste, com /test/ no caminho). */
function LinkStripe({ id }: { id: string }) {
  return (
    <a
      href={linkPainelStripe(id)}
      target="_blank"
      rel="noopener noreferrer"
      className="block break-all text-small underline underline-offset-4"
    >
      {id}
    </a>
  );
}

/** A forma de pagamento e o valor: em aberto, os dois preços; depois de pago, o que entrou, com os dados do pagamento. */
function ValorDoPedido({ p }: { p: PedidoPainel }) {
  const r = p.itens[0];
  const g = r.pagamento;
  if (EM_ABERTO.includes(p.status) && p.totalPixCentavos !== undefined) {
    return (
      <>
        <p className="text-xl font-bold">{formatarPreco(p.totalPixCentavos)}</p>
        <p className="text-small text-tinta-suave">no Pix</p>
        <p className="mt-1 font-semibold">{formatarPreco(p.totalCentavos)}</p>
        <p className="text-small text-tinta-suave">no cartão</p>
        {p.provedor === 'stripe' && (
          <p className="mt-1 text-small text-tinta-suave">
            Stripe · escolheu {p.metodo === 'pix' ? 'Pix' : 'cartão'}
            {g.motivoCodigo ? ` · ${motivoNoPainel(g.motivoCodigo, p.metodo).resumo}` : ''}
          </p>
        )}
        {p.provedor === 'stripe' && r.pagamentoExternoId && <LinkStripe id={r.pagamentoExternoId} />}
      </>
    );
  }
  // a Stripe manda a bandeira em minúsculas ("visa", "mastercard")
  const bandeira = g.cartaoBandeira ? g.cartaoBandeira.charAt(0).toUpperCase() + g.cartaoBandeira.slice(1) : '';
  const forma =
    p.metodo === 'pix'
      ? 'Pix'
      : p.metodo === 'cartao'
        ? `Cartão ${bandeira} ${g.cartaoFinal ? `•••• ${g.cartaoFinal}` : ''}`.replace(/\s+/g, ' ').trim()
        : 'WhatsApp';
  return (
    <>
      <p className="text-xl font-bold">{formatarPreco(p.recebidoCentavos)}</p>
      <p className="text-small text-tinta-suave">
        {forma}
        {g.cartaoPais ? ` · cartão ${g.cartaoPais}` : ''}
      </p>
      <p className="text-small text-tinta-suave">{PROVEDOR[p.provedor]}</p>
      {g.apresentado && <p className="text-small text-tinta-suave">Cliente viu {moedaApresentada(g.apresentado)}</p>}
      {p.reembolsoCentavos > 0 && <p className="mt-1 text-small font-semibold">Reembolsado {formatarPreco(p.reembolsoCentavos)}</p>}
      {p.provedor === 'stripe' ? (
        <>
          {r.paymentIntentId && <LinkStripe id={r.paymentIntentId} />}
          {r.pagamentoExternoId && <LinkStripe id={r.pagamentoExternoId} />}
        </>
      ) : (
        g.pedidoId && <p className="break-all text-small text-tinta-suave">{g.pedidoId}</p>
      )}
    </>
  );
}

/** A última recusa do cartão, ou o Pix que venceu, em português. O código da Stripe vai depois, para a busca. */
function MotivoDoPagamento({ codigo, metodo }: { codigo: string; metodo: PedidoPainel['metodo'] }) {
  const m = motivoNoPainel(codigo, metodo);
  return (
    <li>
      {m.rotulo}: {m.frase}
      {m.codigo && <span className="text-tinta-suave"> · código na Stripe: {m.codigo}</span>}
    </li>
  );
}

/** Um pedido: o cliente uma vez só, um bloco para cada voucher, o total e as ações. */
function CartaoPedido({ p, filtro }: { p: PedidoPainel; filtro: string }) {
  const r = p.itens[0];
  const varios = p.itens.length > 1;
  const whats = `https://wa.me/${r.cliente.telefone.replace(/\D/g, '')}`;
  const documento = p.itens.find((i) => !ehTransfer(i) && i.cliente.documento) as ReservaPasseio | undefined;
  return (
    <li className="grid gap-4 bg-white p-5 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <p className="text-xl font-bold tracking-tight">{p.codigo}</p>
        <span className={`mt-1 inline-block px-3 py-1 text-small font-semibold ${COR[p.status]}`}>{ROTULO[p.status]}</span>
        {p.status === 'contestado' && <p className="mt-2 text-small font-semibold text-[#7a1f12]">{oQueFazerNaContestacao(p.metodo)}</p>}
        {varios && <p className="mt-2 text-small font-semibold">{p.itens.length} itens</p>}
        <p className="mt-2 text-small text-tinta-suave">Criado {dataHora(p.criadoEm)}</p>
        {p.pagoEm && <p className="text-small text-tinta-suave">Pago {dataHora(p.pagoEm)}</p>}
      </div>
      <ul className="divide-y divide-borda lg:col-span-4">
        {p.itens.map((i) => (
          <li key={i.codigo} className="py-3 first:pt-0 last:pb-0">
            {varios && (
              <p className="mb-1 text-small font-semibold">
                Voucher {i.codigo} · {formatarPreco(valorRecebido(i))}
                {p.metodo === 'whatsapp' && i.totalPixCentavos !== undefined ? ` (${formatarPreco(i.totalPixCentavos)} no Pix)` : ''}
                {i.statusItem && i.statusItem !== 'ativo' ? ` · ${ROTULO_ITEM[i.statusItem]}` : ''}
              </p>
            )}
            {ehTransfer(i) ? <DetalhesTransfer r={i} /> : <DetalhesPasseio r={i} />}
            {!ehTransfer(i) && i.sugestao && (
              <p className="mt-1 text-small font-semibold text-turquesa-texto">Pegou pela sugestão do carrinho</p>
            )}
          </li>
        ))}
        {r.observacoes && <li className="py-3 text-small last:pb-0">Obs.: {r.observacoes}</li>}
      </ul>
      <div className="lg:col-span-3">
        <p className="font-semibold">{r.cliente.nome}</p>
        {documento && (
          <p className="text-small">
            {documento.cliente.documentoTipo === 'cpf' ? 'CPF' : 'Passaporte'} {documento.cliente.documento}
          </p>
        )}
        <p>
          <a href={whats} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            {r.cliente.telefone}
          </a>
        </p>
        <p className="break-all">
          <a href={`mailto:${r.cliente.email}`} className="underline underline-offset-4">
            {r.cliente.email}
          </a>
        </p>
        <p className="text-small text-tinta-suave">
          Idioma: {r.idioma.toUpperCase()}
          {r.cliente.pais ? ` · País: ${r.cliente.pais}` : ''}
        </p>
        {textoDaOrigem(r.origem) && <p className="text-small text-tinta-suave">Veio de: {textoDaOrigem(r.origem)}</p>}
      </div>
      <div className="lg:col-span-2 lg:text-right">
        <ValorDoPedido p={p} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 lg:col-span-12">
        <Acoes p={p} filtro={filtro} />
        {/* com algum aviso (a Stripe não devolveu, valor diferente, pago depois do horário), o histórico já vem aberto */}
        <details className="text-small" open={r.historico.some((h) => ehAviso(h.evento))}>
          <summary className="cursor-pointer font-semibold">Histórico</summary>
          <ul className="mt-2 space-y-1">
            {r.historico.map((h, n) => (
              // o aviso leva as cores do rótulo "Contestado": a equipe precisa agir
              <li key={n} className={ehAviso(h.evento) ? 'bg-erro-claro px-2 py-1 font-semibold text-[#7a1f12]' : undefined}>
                {dataHora(h.em)} — {h.evento}
              </li>
            ))}
            {r.pagamento.motivo && <li>Motivo: {r.pagamento.motivo}</li>}
            {r.pagamento.motivoCodigo && <MotivoDoPagamento codigo={r.pagamento.motivoCodigo} metodo={p.metodo} />}
          </ul>
        </details>
      </div>
    </li>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) {
    return <Login erro={typeof q.erro === 'string' ? q.erro : undefined} />;
  }

  const filtroAtual = typeof q.status === 'string' ? q.status : '';
  const busca = typeof q.q === 'string' ? q.q.trim().toLowerCase() : '';
  // a rota das ações volta com ?erro=<código> quando recusa uma ação; a faixa vermelha mostra a frase fixa desse
  // código (ERROS_DO_PAINEL), nunca o texto que veio no endereço
  const erroAcao = fraseDoErro(typeof q.erro === 'string' ? q.erro : undefined);
  let todas: Reserva[] = [];
  let erroBanco = '';
  try {
    todas = await listarReservas();
  } catch (e) {
    erroBanco = String(e instanceof Error ? e.message : e);
  }
  const filtro = FILTROS.find((f) => f.valor === filtroAtual) ?? FILTROS[0];
  const pedidos = agruparPedidos(todas);
  const lista = pedidos.filter(
    (p) =>
      (!filtro.status || filtro.status.includes(p.status)) &&
      (!busca ||
        p.itens.some((r) =>
          [p.codigo, r.codigo, r.cliente.nome, r.cliente.email, r.cliente.telefone, ...textosDaBusca(r)].some((c) =>
            c.toLowerCase().includes(busca),
          ),
        )),
  );
  const cotacoesNovas = await contarCotacoesNovas().catch(() => 0);
  const pagos = pedidos.filter((p) => p.status === 'pago');
  // o que entrou, menos o que já voltou para o cliente
  const receita = pagos.reduce((s, p) => s + p.recebidoCentavos - p.reembolsoCentavos, 0);
  const contestacoes = avisosDeContestacao(contestacoesAbertas(pedidos));

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/orla-nativa-emblema.svg" alt="" width={48} height={48} className="size-12" />
          <div>
            <h1 className="text-2xl font-bold">Pedidos</h1>
            <p className="text-small text-tinta-suave">
              Pagamento online: {textoPagamentoOnline()} · Pedidos em: {ondeFicamAsReservas()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/admin/estatisticas" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Estatísticas
          </a>
          <a href="/admin/casas" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Casas
          </a>
          <a href="/admin/cotacoes" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Cotações
          </a>
          <a href="/admin/avaliacoes" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Avaliações
          </a>
          <form method="post" action="/api/admin/logout">
            <button type="submit" className="min-h-10 bg-white px-4 font-semibold">
              Sair
            </button>
          </form>
        </div>
      </header>

      {cotacoesNovas > 0 && (
        <a href="/admin/cotacoes?status=nova" className="mt-6 block bg-sol px-5 py-3 font-semibold text-mar">
          {cotacoesNovas === 1 ? '1 cotação nova' : `${cotacoesNovas} cotações novas`} para responder →
        </a>
      )}
      {contestacoes.map((aviso) => (
        <a key={aviso} href="/admin?status=contestados" className="mt-3 block bg-erro-claro px-5 py-3 font-semibold text-mar">
          {aviso} →
        </a>
      ))}
      {erroAcao && (
        <p role="alert" className="mt-3 bg-erro-claro px-5 py-3 font-semibold text-mar">
          {erroAcao}
        </p>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Resumo">
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Pedidos pagos</p>
          <p className="text-2xl font-bold">{pagos.length}</p>
        </div>
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Vendido (pagos, menos reembolsos)</p>
          <p className="text-2xl font-bold">{formatarPreco(receita)}</p>
        </div>
      </section>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
          {FILTROS.map((f) => (
            <a
              key={f.valor}
              href={f.valor ? `/admin?status=${f.valor}` : '/admin'}
              aria-current={f.valor === filtro.valor ? 'page' : undefined}
              className={`filtro ${f.valor === filtro.valor ? '!bg-mar !text-sol' : '!bg-white'}`}
            >
              {f.rotulo}
            </a>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {filtro.valor && <input type="hidden" name="status" value={filtro.valor} />}
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={busca}
            placeholder="Buscar pedido, voucher, nome, hotel…"
            className="campo min-h-11 w-64 py-2"
          />
          <button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white">
            Buscar
          </button>
        </div>
      </form>

      {erroBanco && <p className="mt-6 bg-erro-claro px-4 py-3 font-semibold">Erro ao ler o banco: {erroBanco}</p>}

      <p className="mt-6 text-small text-tinta-suave">
        {lista.length} pedido{lista.length === 1 ? '' : 's'}
      </p>
      <ul className="mt-3 space-y-3">
        {lista.map((p) => (
          <CartaoPedido key={p.codigo} p={p} filtro={filtro.valor} />
        ))}
      </ul>
    </main>
  );
}

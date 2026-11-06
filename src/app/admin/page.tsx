import { cookies } from 'next/headers';
import { EMPRESA } from '@/config/empresa';
import { COOKIE_ADMIN, adminConfigurado, sessaoValida } from '@/lib/admin-auth';
import { contarCotacoesNovas } from '@/lib/cotacoes';
import { textoDaOrigem } from '@/lib/origem';
import { pagarmeConfigurado } from '@/lib/pagarme';
import { obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { formatarHora } from '@/lib/horarios';
import { semFaixas } from '@/lib/passeio-view';
import { agruparPedidos, valorRecebido, type PedidoPainel } from '@/lib/pedidos-painel';
import { textoPessoas } from '@/lib/pessoas';
import { formatarPreco } from '@/lib/precos';
import {
  ehTransfer,
  listarReservas,
  ondeFicamAsReservas,
  type Reserva,
  type ReservaPasseio,
  type ReservaTransfer,
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
  expirado: 'Pix expirado',
  aguardando_whatsapp: 'Finalizar no WhatsApp',
  reembolsado: 'Reembolsado',
};

const COR: Record<StatusReserva, string> = {
  pendente: 'bg-sol text-mar',
  pago: 'bg-[#d8f5e4] text-[#0f5132]',
  recusado: 'bg-erro-claro text-[#7a1f12]',
  cancelado: 'bg-[#e5e9ee] text-mar',
  expirado: 'bg-[#e5e9ee] text-mar',
  aguardando_whatsapp: 'bg-turquesa text-mar',
  reembolsado: 'bg-[#e5e9ee] text-mar',
};

const DICIONARIO_PT = dicionario('pt');
const ROTULOS_PESSOAS = DICIONARIO_PT.comum.rotulos;

const FILTROS: { valor: string; rotulo: string; status?: StatusReserva[] }[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'pagas', rotulo: 'Pagos', status: ['pago'] },
  { valor: 'abertas', rotulo: 'Em aberto', status: ['pendente', 'aguardando_whatsapp'] },
  { valor: 'outras', rotulo: 'Recusados / cancelados', status: ['recusado', 'cancelado', 'expirado', 'reembolsado'] },
];

const dataHora = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
    : '—';

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

/** O status é do pedido inteiro, com todos os vouchers: um pagamento só. */
function Acoes({ p, filtro }: { p: PedidoPainel; filtro: string }) {
  const r = p.itens[0];
  const acoes: { acao: string; rotulo: string }[] = [];
  if (p.status === 'aguardando_whatsapp' || p.status === 'pendente' || p.status === 'expirado' || p.status === 'recusado') {
    if (p.metodo === 'whatsapp') {
      // a forma de pagamento define quanto entrou
      acoes.push(
        { acao: 'pago_pix', rotulo: `Pago no Pix (${formatarPreco(p.totalPixCentavos ?? p.totalCentavos)})` },
        { acao: 'pago_cartao', rotulo: `Pago no cartão (${formatarPreco(p.totalCentavos)})` },
      );
    } else {
      acoes.push({ acao: 'marcar_pago', rotulo: 'Marcar como pago' });
    }
  }
  // marcou errado: dá para trocar, menos no pagamento online, que veio do sistema de pagamento
  if (p.status === 'pago' && !r.pagamento.pedidoId) {
    if (p.metodo !== 'pix') acoes.push({ acao: 'pago_pix', rotulo: 'Corrigir: foi no Pix' });
    if (p.metodo !== 'cartao') acoes.push({ acao: 'pago_cartao', rotulo: 'Corrigir: foi no cartão' });
  }
  if (p.status !== 'cancelado' && p.status !== 'reembolsado') acoes.push({ acao: 'cancelar', rotulo: 'Cancelar' });
  if (p.status === 'pago' || p.status === 'cancelado') acoes.push({ acao: 'reembolsado', rotulo: 'Marcar reembolsado' });
  return (
    <div className="flex flex-wrap gap-2">
      {acoes.map((a) => (
        <form key={a.acao} method="post" action={`/api/admin/reservas/${r.codigo}`}>
          <input type="hidden" name="acao" value={a.acao} />
          <input type="hidden" name="filtro" value={filtro} />
          <button type="submit" className="min-h-10 bg-superficie px-4 text-small font-semibold text-mar hover:bg-borda">
            {a.rotulo}
          </button>
        </form>
      ))}
    </div>
  );
}

/** A forma de pagamento e o valor: em aberto, os dois preços; depois de pago, o que entrou. */
function ValorDoPedido({ p }: { p: PedidoPainel }) {
  const r = p.itens[0];
  if (p.metodo === 'whatsapp' && p.status !== 'pago' && p.totalPixCentavos !== undefined) {
    return (
      <>
        <p className="text-xl font-bold">{formatarPreco(p.totalPixCentavos)}</p>
        <p className="text-small text-tinta-suave">no Pix</p>
        <p className="mt-1 font-semibold">{formatarPreco(p.totalCentavos)}</p>
        <p className="text-small text-tinta-suave">no cartão</p>
      </>
    );
  }
  return (
    <>
      <p className="text-xl font-bold">{formatarPreco(p.recebidoCentavos)}</p>
      <p className="text-small text-tinta-suave">
        {p.metodo === 'pix'
          ? 'Pix'
          : p.metodo === 'cartao'
            ? `Cartão ${r.pagamento.cartaoBandeira ?? ''} ${r.pagamento.cartaoFinal ? `•••• ${r.pagamento.cartaoFinal}` : ''}`
            : 'WhatsApp'}
      </p>
      {r.pagamento.pedidoId && <p className="break-all text-small text-tinta-suave">{r.pagamento.pedidoId}</p>}
    </>
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
              </p>
            )}
            {ehTransfer(i) ? <DetalhesTransfer r={i} /> : <DetalhesPasseio r={i} />}
            {!ehTransfer(i) && i.sugestao && <p className="mt-1 text-small font-semibold text-turquesa-texto">Pegou pela sugestão do carrinho</p>}
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
        <p className="text-small text-tinta-suave">Idioma: {r.idioma.toUpperCase()}</p>
        {textoDaOrigem(r.origem) && <p className="text-small text-tinta-suave">Veio de: {textoDaOrigem(r.origem)}</p>}
      </div>
      <div className="lg:col-span-2 lg:text-right">
        <ValorDoPedido p={p} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-12">
        <Acoes p={p} filtro={filtro} />
        <details className="text-small">
          <summary className="cursor-pointer font-semibold">Histórico</summary>
          <ul className="mt-2 space-y-1">
            {r.historico.map((h, n) => (
              <li key={n}>
                {dataHora(h.em)} — {h.evento}
              </li>
            ))}
            {r.pagamento.motivo && <li>Motivo: {r.pagamento.motivo}</li>}
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
  const receita = pagos.reduce((s, p) => s + p.recebidoCentavos, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/orla-nativa-emblema.svg" alt="" width={48} height={48} className="size-12" />
          <div>
            <h1 className="text-2xl font-bold">Pedidos</h1>
            <p className="text-small text-tinta-suave">
              Pagamento online: {pagarmeConfigurado() ? 'ativo (Pagar.me)' : 'desativado — pedidos finalizados pelo WhatsApp'} · Pedidos em:{' '}
              {ondeFicamAsReservas()}
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

      <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Resumo">
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Pedidos pagos</p>
          <p className="text-2xl font-bold">{pagos.length}</p>
        </div>
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Vendido (pagos)</p>
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
          <input id="q" name="q" defaultValue={busca} placeholder="Buscar pedido, voucher, nome, hotel…" className="campo min-h-11 w-64 py-2" />
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

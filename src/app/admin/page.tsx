import { cookies } from 'next/headers';
import { EMPRESA } from '@/config/empresa';
import { COOKIE_ADMIN, adminConfigurado, sessaoValida } from '@/lib/admin-auth';
import { pagarmeConfigurado } from '@/lib/pagarme';
import { obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { semFaixas } from '@/lib/passeio-view';
import { textoPessoas } from '@/lib/pessoas';
import { formatarPreco } from '@/lib/precos';
import { bancoConfigurado, listarReservas, type Reserva, type StatusReserva } from '@/lib/reservas';
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

const ROTULOS_PESSOAS = dicionario('pt').comum.rotulos;

const FILTROS: { valor: string; rotulo: string; status?: StatusReserva[] }[] = [
  { valor: '', rotulo: 'Todas' },
  { valor: 'pagas', rotulo: 'Pagas', status: ['pago'] },
  { valor: 'abertas', rotulo: 'Em aberto', status: ['pendente', 'aguardando_whatsapp'] },
  { valor: 'outras', rotulo: 'Recusadas / canceladas', status: ['recusado', 'cancelado', 'expirado', 'reembolsado'] },
];

const dataHora = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
    : '—';

function Login({ erro }: { erro?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/agencia-victor-hugo-horizontal.svg" alt={EMPRESA.marca} width={344} height={100} className="h-14 w-auto self-start" />
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

function Acoes({ r, filtro }: { r: Reserva; filtro: string }) {
  const acoes: { acao: string; rotulo: string; confirmar?: boolean }[] = [];
  if (r.status === 'aguardando_whatsapp' || r.status === 'pendente' || r.status === 'expirado' || r.status === 'recusado') {
    acoes.push({ acao: 'marcar_pago', rotulo: 'Marcar como pago' });
  }
  if (r.status !== 'cancelado' && r.status !== 'reembolsado') acoes.push({ acao: 'cancelar', rotulo: 'Cancelar' });
  if (r.status === 'pago' || r.status === 'cancelado') acoes.push({ acao: 'reembolsado', rotulo: 'Marcar reembolsado' });
  return (
    <div className="flex flex-wrap gap-2">
      {acoes.map((a) => (
        <form key={a.acao} method="post" action={`/api/admin/reservas/${r.codigo}`}>
          <input type="hidden" name="acao" value={a.acao} />
          <input type="hidden" name="filtro" value={filtro} />
          <button type="submit" className="min-h-10 bg-white px-4 text-small font-semibold text-mar hover:bg-areia-2">
            {a.rotulo}
          </button>
        </form>
      ))}
    </div>
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
  const reservas = todas.filter(
    (r) =>
      (!filtro.status || filtro.status.includes(r.status)) &&
      (!busca ||
        [r.codigo, r.cliente.nome, r.cliente.email, r.cliente.telefone, r.hospedagem.hotel, r.passeio.nome].some((c) =>
          c.toLowerCase().includes(busca),
        )),
  );
  const pagas = todas.filter((r) => r.status === 'pago');
  const receita = pagas.reduce((s, r) => s + r.totalCentavos, 0);
  const custo = pagas.reduce((s, r) => s + (r.custoParceiroCentavos ?? 0), 0);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/agencia-victor-hugo-emblema.svg" alt="" width={48} height={48} className="size-12" />
          <div>
            <h1 className="text-2xl font-bold">Reservas</h1>
            <p className="text-small text-tinta-suave">
              Pagamento online: {pagarmeConfigurado() ? 'ativo (Pagar.me)' : 'desativado — reservas finalizadas pelo WhatsApp'} · Banco:{' '}
              {bancoConfigurado() ? 'conectado' : 'NÃO configurado'}
            </p>
          </div>
        </div>
        <form method="post" action="/api/admin/logout">
          <button type="submit" className="min-h-10 bg-white px-4 font-semibold">
            Sair
          </button>
        </form>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Resumo">
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Reservas pagas</p>
          <p className="text-2xl font-bold">{pagas.length}</p>
        </div>
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Vendido (pagas)</p>
          <p className="text-2xl font-bold">{formatarPreco(receita)}</p>
        </div>
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Margem (vendido − parceiro)</p>
          <p className="text-2xl font-bold">{formatarPreco(receita - custo)}</p>
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
          <input id="q" name="q" defaultValue={busca} placeholder="Buscar voucher, nome, hotel…" className="campo min-h-11 w-64 py-2" />
          <button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white">
            Buscar
          </button>
        </div>
      </form>

      {erroBanco && <p className="mt-6 bg-erro-claro px-4 py-3 font-semibold">Erro ao ler o banco: {erroBanco}</p>}

      <p className="mt-6 text-small text-tinta-suave">
        {reservas.length} reserva{reservas.length === 1 ? '' : 's'}
      </p>
      <ul className="mt-3 space-y-3">
        {reservas.map((r) => {
          const whats = `https://wa.me/${r.cliente.telefone.replace(/\D/g, '')}`;
          return (
            <li key={r.codigo} className="grid gap-4 bg-white p-5 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <p className="text-xl font-bold tracking-tight">{r.codigo}</p>
                <span className={`mt-1 inline-block px-3 py-1 text-small font-semibold ${COR[r.status]}`}>{ROTULO[r.status]}</span>
                <p className="mt-2 text-small text-tinta-suave">Criada {dataHora(r.criadaEm)}</p>
                {r.pagamento.pagoEm && <p className="text-small text-tinta-suave">Paga {dataHora(r.pagamento.pagoEm)}</p>}
              </div>
              <div className="lg:col-span-4">
                <p className="font-bold">
                  {r.passeio.nome}
                  {r.passeio.opcao ? ` — ${r.passeio.opcao.nome}` : ''}
                </p>
                <p>
                  {formatarDataIso(r.data, 'pt-BR')} ·{' '}
                  {textoPessoas(
                    r,
                    ROTULOS_PESSOAS,
                    (() => {
                      const p = obterPasseio(r.passeio.slug);
                      return p ? semFaixas(p) : false;
                    })(),
                  )}
                  {r.passeio.unidade !== 'pessoa'
                    ? ` · ${r.unidades} ${r.passeio.unidade === 'veiculo' ? 'veículo(s)' : 'embarcação(ões)'}`
                    : ''}
                </p>
                <p>
                  Hotel: <strong>{r.hospedagem.hotel}</strong> ({NOME_CIDADE_HOSPEDAGEM[r.hospedagem.cidade]})
                </p>
                {r.observacoes && <p className="mt-1 text-small">Obs.: {r.observacoes}</p>}
              </div>
              <div className="lg:col-span-3">
                <p className="font-semibold">{r.cliente.nome}</p>
                <p className="text-small">
                  {r.cliente.documentoTipo === 'cpf' ? 'CPF' : 'Passaporte'} {r.cliente.documento}
                </p>
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
              </div>
              <div className="lg:col-span-2 lg:text-right">
                <p className="text-xl font-bold">{formatarPreco(r.totalCentavos)}</p>
                <p className="text-small text-tinta-suave">Parceiro: {formatarPreco(r.custoParceiroCentavos ?? 0)}</p>
                <p className="text-small text-tinta-suave">
                  {r.pagamento.metodo === 'pix'
                    ? 'Pix'
                    : r.pagamento.metodo === 'cartao'
                      ? `Cartão ${r.pagamento.cartaoBandeira ?? ''} ${r.pagamento.cartaoFinal ? `•••• ${r.pagamento.cartaoFinal}` : ''}`
                      : 'WhatsApp'}
                </p>
                {r.pagamento.pedidoId && <p className="break-all text-small text-tinta-suave">{r.pagamento.pedidoId}</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-12">
                <Acoes r={r} filtro={filtro.valor} />
                <details className="text-small">
                  <summary className="cursor-pointer font-semibold">Histórico</summary>
                  <ul className="mt-2 space-y-1">
                    {r.historico.map((h, i) => (
                      <li key={i}>
                        {dataHora(h.em)} — {h.evento}
                      </li>
                    ))}
                    {r.pagamento.motivo && <li>Motivo: {r.pagamento.motivo}</li>}
                  </ul>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

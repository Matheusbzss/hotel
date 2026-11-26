import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { dicionario } from '@/i18n';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { STATUS_COTACAO, type PontaCotacao, type StatusCotacao, type TipoCotacao, type TrajetoCotacao } from '@/lib/cotacao';
import { listarCotacoes, type Cotacao } from '@/lib/cotacoes';
import { textoDaOrigem } from '@/lib/origem';
import { formatarHora } from '@/lib/horarios';
import { nomePonta, textoMalas, textoPassageiros } from '@/lib/transfer-view';
import { formatarDataIso } from '@/lib/validacao';
import type { IdLugar } from '@/data/transfer';

export const dynamic = 'force-dynamic';

const STATUS: Record<StatusCotacao, { rotulo: string; plural: string; cor: string }> = {
  nova: { rotulo: 'Nova', plural: 'Novas', cor: 'bg-sol text-mar' },
  respondida: { rotulo: 'Respondida', plural: 'Respondidas', cor: 'bg-turquesa text-mar' },
  fechada: { rotulo: 'Fechada', plural: 'Fechadas', cor: 'bg-[#d8f5e4] text-[#0f5132]' },
  perdida: { rotulo: 'Perdida', plural: 'Perdidas', cor: 'bg-[#e5e9ee] text-mar' },
};

const TIPO: Record<TipoCotacao, string> = { transfer: 'Transfer', casa: 'Casa', outro: 'Contato' };

const T = dicionario('pt').transfer;

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/** "Outra cidade" vem com o nome que o cliente digitou. */
const ponta = (p: PontaCotacao) => {
  const nome = nomePonta({ lugar: p.lugar as IdLugar, endereco: p.endereco }, 'pt');
  return p.cidade ? `${p.cidade} (${nome})` : nome;
};

/** O transfer que o cliente montou: os trechos, os passageiros e as malas. */
function Trajeto({ t }: { t: TrajetoCotacao }) {
  const trechos = [
    ['Ida', t.ida],
    ['Volta', t.volta],
  ] as const;
  return (
    <>
      {trechos.map(
        ([rotulo, x]) =>
          x && (
            <p key={rotulo}>
              {rotulo}:{' '}
              <strong>
                {x.data ? formatarDataIso(x.data, 'pt-BR') : 'sem data'}
                {x.hora ? ` às ${formatarHora(x.hora, 'pt')}` : ''}
              </strong>{' '}
              · {ponta(x.saida)} → {ponta(x.destino)}
            </p>
          ),
      )}
      <p>
        {textoPassageiros(t.passageiros, T)} · {textoMalas(t.malas, T)}
      </p>
    </>
  );
}

function Acoes({ c, filtro }: { c: Cotacao; filtro: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUS_COTACAO.filter((s) => s !== c.status).map((s) => (
        <form key={s} method="post" action={`/api/admin/cotacoes/${c.id}`}>
          <input type="hidden" name="status" value={s} />
          <input type="hidden" name="filtro" value={filtro} />
          <button type="submit" className="min-h-10 bg-white px-4 text-small font-semibold text-mar hover:bg-areia-2">
            Marcar como {STATUS[s].rotulo.toLowerCase()}
          </button>
        </form>
      ))}
    </div>
  );
}

export default async function Cotacoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) redirect('/admin');

  const q = await searchParams;
  const filtro = STATUS_COTACAO.find((s) => s === q.status) ?? '';
  let todas: Cotacao[] = [];
  let erroBanco = '';
  try {
    todas = await listarCotacoes();
  } catch (e) {
    erroBanco = String(e instanceof Error ? e.message : e);
  }
  const lista = filtro ? todas.filter((c) => c.status === filtro) : todas;
  const quantas = (s: StatusCotacao) => todas.filter((c) => c.status === s).length;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cotações</h1>
          <p className="text-small text-tinta-suave">Pedidos de orçamento e mensagens do site</p>
        </div>
        <a href="/admin" className="min-h-10 bg-white px-4 py-2 font-semibold">
          Voltar aos pedidos
        </a>
      </header>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
        <a
          href="/admin/cotacoes"
          aria-current={!filtro ? 'page' : undefined}
          className={`filtro ${!filtro ? '!bg-mar !text-sol' : '!bg-white'}`}
        >
          Todas ({todas.length})
        </a>
        {STATUS_COTACAO.map((s) => (
          <a
            key={s}
            href={`/admin/cotacoes?status=${s}`}
            aria-current={s === filtro ? 'page' : undefined}
            className={`filtro ${s === filtro ? '!bg-mar !text-sol' : '!bg-white'}`}
          >
            {STATUS[s].plural} ({quantas(s)})
          </a>
        ))}
      </div>

      {erroBanco && <p className="mt-6 bg-erro-claro px-4 py-3 font-semibold">Erro ao ler o banco: {erroBanco}</p>}
      {!erroBanco && !lista.length && <p className="mt-8">Nenhuma cotação aqui.</p>}

      <ul className="mt-6 space-y-3">
        {lista.map((c) => (
          <li key={c.id} className="grid gap-4 bg-white p-5 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <p className="text-xl font-bold tracking-tight">{TIPO[c.tipo]}</p>
              <span className={`mt-1 inline-block px-3 py-1 text-small font-semibold ${STATUS[c.status].cor}`}>
                {STATUS[c.status].rotulo}
              </span>
              <p className="mt-2 text-small text-tinta-suave">Recebida {dataHora(c.criadaEm)}</p>
              {textoDaOrigem(c.origem) && <p className="text-small text-tinta-suave">Veio de: {textoDaOrigem(c.origem)}</p>}
            </div>
            <div className="lg:col-span-5">
              {c.trajeto && <Trajeto t={c.trajeto} />}
              {c.mensagem && <p className={`whitespace-pre-wrap ${c.trajeto ? 'mt-1 text-small' : ''}`}>{c.mensagem}</p>}
            </div>
            <div className="lg:col-span-4">
              <p className="font-semibold">{c.nome}</p>
              {c.telefone && (
                <p>
                  <a
                    href={`https://wa.me/${c.telefone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {c.telefone}
                  </a>
                </p>
              )}
              <p className="break-all">
                <a href={`mailto:${c.email}`} className="underline underline-offset-4">
                  {c.email}
                </a>
              </p>
              <p className="text-small text-tinta-suave">Idioma: {c.idioma.toUpperCase()}</p>
            </div>
            <div className="lg:col-span-12">
              <Acoes c={c} filtro={filtro} />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

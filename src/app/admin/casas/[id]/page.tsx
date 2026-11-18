import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { BotaoCopiar } from '@/components/admin/BotaoCopiar';
import { FormularioCasa } from '@/components/admin/FormularioCasa';
import { CIDADES } from '@/data/passeios';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { CIDADES_CASA, TIPOS_TARIFA, faltaParaPublicar, type Bloqueio, type CasaPainel, type OrigemBloqueio } from '@/lib/casa';
import { obterCasaPainel } from '@/lib/casas';
import { formatarPreco } from '@/lib/precos';
import { urlDoSite } from '@/lib/site';
import { hojeEmBuzios } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

const AVISOS: Record<string, { ok: boolean; texto: string }> = {
  criada: { ok: true, texto: 'Casa cadastrada. Ela fica fora do ar até você publicar.' },
  publicada: { ok: true, texto: 'Casa no ar. O site se atualiza na próxima visita.' },
  escondida: { ok: true, texto: 'Casa fora do ar.' },
  falta: { ok: false, texto: 'Ainda falta preencher o que está na lista abaixo.' },
  'tarifa-salva': { ok: true, texto: 'Período salvo.' },
  'tarifa-apagada': { ok: true, texto: 'Período apagado.' },
  'tarifa-invalida': { ok: false, texto: 'Confira o período: o nome nos três idiomas, as datas e a diária.' },
  'bloqueio-salvo': { ok: true, texto: 'Datas bloqueadas.' },
  'bloqueio-apagado': { ok: true, texto: 'Bloqueio apagado.' },
  'bloqueio-invalido': { ok: false, texto: 'Confira as datas: a saída vem depois da entrada.' },
  importado: { ok: true, texto: 'Calendário do Airbnb importado.' },
  'importacao-falhou': { ok: false, texto: 'Não deu para importar o calendário do Airbnb. Os bloqueios ficaram como estavam.' },
  'sem-link': { ok: false, texto: 'Salve o link do calendário do Airbnb antes de importar.' },
};

const ORIGEM: Record<OrigemBloqueio, string> = { site: 'Reserva do site', airbnb: 'Airbnb', manual: 'Bloqueio à mão' };

const dataLonga = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

function Acao({ casa, acao, id, rotulo, forte }: { casa: CasaPainel; acao: string; id?: string; rotulo: string; forte?: boolean }) {
  return (
    <form method="post" action={`/api/admin/casas/${casa.id}/acoes`}>
      <input type="hidden" name="acao" value={acao} />
      {id && <input type="hidden" name="id" value={id} />}
      <button
        type="submit"
        className={`min-h-10 px-4 text-small font-semibold ${forte ? 'bg-mar text-white' : 'bg-superficie text-mar hover:bg-borda'}`}
      >
        {rotulo}
      </button>
    </form>
  );
}

function Publicacao({ casa }: { casa: CasaPainel }) {
  const falta = faltaParaPublicar(casa);
  return (
    <section className="bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className={`inline-block px-3 py-1 text-small font-semibold ${casa.ativo ? 'bg-[#d8f5e4] text-[#0f5132]' : 'bg-[#e5e9ee] text-mar'}`}>
            {casa.ativo ? 'No ar' : 'Fora do ar'}
          </span>
          {casa.ativo && (
            <p className="mt-2 text-small">
              <a href={`/casas-de-temporada/${casa.slug}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                Ver a página no site
              </a>
            </p>
          )}
        </div>
        {casa.ativo ? (
          <Acao casa={casa} acao="esconder" rotulo="Tirar do ar" />
        ) : (
          falta.length === 0 && <Acao casa={casa} acao="publicar" rotulo="Publicar no site" forte />
        )}
      </div>
      {!casa.ativo && falta.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold">Para publicar, ainda falta:</p>
          <ul className="mt-1 list-disc pl-5 text-small">
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Periodos({ casa }: { casa: CasaPainel }) {
  return (
    <section className="bg-white p-5">
      <h2 className="text-xl font-bold">Diárias por período</h2>
      <p className="mt-1 text-small text-tinta-suave">O feriado vale por cima da temporada. Fora dos períodos, vale a diária base.</p>
      {casa.tarifas.length > 0 && (
        <ul className="mt-4 divide-y divide-borda">
          {casa.tarifas.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">
                  {t.nome.pt} · {formatarPreco(t.diaria * 100)}
                </p>
                <p className="text-small text-tinta-suave">
                  {t.tipo === 'feriado' ? 'Feriado' : 'Temporada'}: noites de {dataLonga(t.de)} a {dataLonga(t.ate)}
                  {t.minimoNoites ? ` · mínimo de ${t.minimoNoites} noites` : ''}
                </p>
              </div>
              <Acao casa={casa} acao="apagar_tarifa" id={t.id} rotulo="Apagar" />
            </li>
          ))}
        </ul>
      )}
      <form method="post" action={`/api/admin/casas/${casa.id}/acoes`} className="mt-4 grid gap-3 md:grid-cols-3">
        <input type="hidden" name="acao" value="nova_tarifa" />
        <h3 className="font-semibold md:col-span-3">Novo período</h3>
        {(['pt', 'es', 'en'] as const).map((i) => (
          <div key={i}>
            <label htmlFor={`tarifa-${i}`} className="rotulo">
              Nome ({i.toUpperCase()})
            </label>
            <input id={`tarifa-${i}`} name={`nome.${i}`} required className="campo" />
          </div>
        ))}
        <div>
          <label htmlFor="tarifa-tipo" className="rotulo">
            Tipo
          </label>
          <select id="tarifa-tipo" name="tipo" className="campo">
            {TIPOS_TARIFA.map((t) => (
              <option key={t} value={t}>
                {t === 'feriado' ? 'Feriado' : 'Temporada'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tarifa-de" className="rotulo">
            Primeira noite
          </label>
          <input id="tarifa-de" name="de" type="date" required className="campo" />
        </div>
        <div>
          <label htmlFor="tarifa-ate" className="rotulo">
            Última noite
          </label>
          <input id="tarifa-ate" name="ate" type="date" required className="campo" />
        </div>
        <div>
          <label htmlFor="tarifa-diaria" className="rotulo">
            Diária (R$)
          </label>
          <input id="tarifa-diaria" name="diaria" type="number" min={1} step="0.01" required className="campo" />
        </div>
        <div>
          <label htmlFor="tarifa-minimo" className="rotulo">
            Mínimo de noites (opcional)
          </label>
          <input id="tarifa-minimo" name="minimoNoites" type="number" min={1} className="campo" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white">
            Salvar período
          </button>
        </div>
      </form>
    </section>
  );
}

function Calendario({ casa, proximos }: { casa: CasaPainel; proximos: Bloqueio[] }) {
  const link = `${urlDoSite()}/api/casas/calendario/${casa.icalToken}.ics`;
  return (
    <section className="bg-white p-5">
      <h2 className="text-xl font-bold">Calendário</h2>
      <p className="mt-1 text-small text-tinta-suave">As datas bloqueadas aqui somem do calendário da página. A noite do dia da saída fica livre.</p>
      {proximos.length > 0 ? (
        <ul className="mt-4 divide-y divide-borda">
          {proximos.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">
                  {dataLonga(b.inicio)} a {dataLonga(b.fim)}
                </p>
                <p className="text-small text-tinta-suave">
                  {ORIGEM[b.origem]}
                  {b.origem === 'manual' && b.referencia ? `: ${b.referencia}` : ''}
                </p>
              </div>
              {b.origem === 'manual' && <Acao casa={casa} acao="apagar_bloqueio" id={b.id} rotulo="Desbloquear" />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4">Nenhuma data bloqueada daqui para a frente.</p>
      )}

      <form method="post" action={`/api/admin/casas/${casa.id}/acoes`} className="mt-4 grid gap-3 md:grid-cols-4">
        <input type="hidden" name="acao" value="novo_bloqueio" />
        <h3 className="font-semibold md:col-span-4">Bloquear datas</h3>
        <div>
          <label htmlFor="bloqueio-inicio" className="rotulo">
            Primeira noite
          </label>
          <input id="bloqueio-inicio" name="inicio" type="date" required className="campo" />
        </div>
        <div>
          <label htmlFor="bloqueio-fim" className="rotulo">
            Dia da saída
          </label>
          <input id="bloqueio-fim" name="fim" type="date" required className="campo" />
        </div>
        <div>
          <label htmlFor="bloqueio-motivo" className="rotulo">
            Motivo (opcional)
          </label>
          <input id="bloqueio-motivo" name="referencia" maxLength={200} className="campo" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white">
            Bloquear
          </button>
        </div>
      </form>

      <div className="mt-6 border-t border-borda pt-4">
        <h3 className="font-semibold">Airbnb</h3>
        {casa.icalErro && <p className="mt-2 bg-erro-claro px-4 py-3 font-semibold">A última importação falhou: {casa.icalErro}</p>}
        <p className="mt-1 text-small text-tinta-suave">
          {casa.icalUrl
            ? casa.icalSincronizadoEm
              ? `Importado em ${dataHora(casa.icalSincronizadoEm)}. A importação roda sozinha de hora em hora.`
              : 'Ainda não importado. A importação roda sozinha de hora em hora.'
            : 'Sem o link do calendário do Airbnb. Salve o link no cadastro abaixo.'}
        </p>
        {casa.icalUrl && (
          <div className="mt-2">
            <Acao casa={casa} acao="importar" rotulo="Importar agora" />
          </div>
        )}
        <label htmlFor="link-ics" className="rotulo mt-4">
          Link para colar no Airbnb
        </label>
        <div className="flex gap-2">
          <input id="link-ics" readOnly value={link} className="campo min-w-0 flex-1" />
          <BotaoCopiar texto={link} />
        </div>
        <p className="ajuda">Leva as reservas do site e os bloqueios à mão, só com as datas. O Airbnb lê este link a cada 3 horas.</p>
      </div>
    </section>
  );
}

export default async function PaginaCasaPainel({ params, searchParams }: PageProps<'/admin/casas/[id]'>) {
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) redirect('/admin');

  const { id } = await params;
  const q = await searchParams;
  const casa = await obterCasaPainel(id);
  if (!casa) notFound();
  const aviso = typeof q.aviso === 'string' ? AVISOS[q.aviso] : undefined;
  const hoje = hojeEmBuzios();
  const { tarifas: _tarifas, bloqueios, temporadas: _temporadas, feriados: _feriados, ativo: _ativo, ...dados } = casa;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{casa.nome.pt}</h1>
          <p className="text-small text-tinta-suave">{CIDADES[casa.cidade].nome.pt}</p>
        </div>
        <a href="/admin/casas" className="min-h-10 bg-white px-4 py-2 font-semibold">
          Voltar às casas
        </a>
      </header>

      {aviso && (
        <p role={aviso.ok ? 'status' : 'alert'} className={`mt-6 px-4 py-3 font-semibold ${aviso.ok ? 'bg-[#d8f5e4] text-[#0f5132]' : 'bg-erro-claro'}`}>
          {aviso.texto}
        </p>
      )}

      <div className="mt-6 grid gap-3">
        <Publicacao casa={casa} />
        <Calendario casa={casa} proximos={bloqueios.filter((b) => b.fim > hoje)} />
        <Periodos casa={casa} />
        {/* o cadastro é longo e quase não muda: fica recolhido quando a casa já está completa */}
        <details open={faltaParaPublicar(casa).length > 0}>
          <summary className="cursor-pointer bg-white p-5 text-xl font-bold">Cadastro da casa</summary>
          <div className="mt-3">
            <FormularioCasa casa={dados} cidades={CIDADES_CASA.map((c) => ({ valor: c, rotulo: CIDADES[c].nome.pt }))} />
          </div>
        </details>
      </div>
    </main>
  );
}

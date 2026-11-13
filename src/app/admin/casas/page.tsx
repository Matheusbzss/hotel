import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CIDADES } from '@/data/passeios';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import type { CasaPainel } from '@/lib/casa';
import { listarCasas } from '@/lib/casas';
import { formatarPreco } from '@/lib/precos';

export const dynamic = 'force-dynamic';

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

function Calendario({ c }: { c: CasaPainel }) {
  if (!c.icalUrl) return <p className="text-small text-tinta-suave">Sem o calendário do Airbnb</p>;
  if (c.icalErro) return <p className="text-small font-semibold text-erro">Airbnb: a última importação falhou</p>;
  return (
    <p className="text-small text-tinta-suave">
      {c.icalSincronizadoEm ? `Airbnb: importado em ${dataHora(c.icalSincronizadoEm)}` : 'Airbnb: ainda não importado'}
    </p>
  );
}

export default async function Casas() {
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) redirect('/admin');

  let casas: CasaPainel[] = [];
  let erroBanco = '';
  try {
    casas = await listarCasas();
  } catch (e) {
    erroBanco = String(e instanceof Error ? e.message : e);
  }
  const noAr = casas.filter((c) => c.ativo).length;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Casas</h1>
          <p className="text-small text-tinta-suave">
            {noAr ? `${noAr === 1 ? '1 casa no ar' : `${noAr} casas no ar`} no site` : 'Sem casa no ar: o site mostra "Em breve"'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/admin/casas/nova" className="min-h-10 bg-mar px-4 py-2 font-semibold text-white">
            Cadastrar casa
          </a>
          <a href="/admin" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Voltar aos pedidos
          </a>
        </div>
      </header>

      {erroBanco && <p className="mt-6 bg-erro-claro px-4 py-3 font-semibold">Erro ao ler o banco: {erroBanco}</p>}
      {!erroBanco && !casas.length && <p className="mt-8">Nenhuma casa cadastrada ainda.</p>}

      <ul className="mt-6 grid gap-3 md:grid-cols-2">
        {casas.map((c) => (
          <li key={c.id}>
            <a href={`/admin/casas/${c.id}`} className="block h-full bg-white p-5 hover:bg-superficie">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xl font-bold">{c.nome.pt}</p>
                <span className={`px-3 py-1 text-small font-semibold ${c.ativo ? 'bg-[#d8f5e4] text-[#0f5132]' : 'bg-[#e5e9ee] text-mar'}`}>
                  {c.ativo ? 'No ar' : 'Fora do ar'}
                </span>
              </div>
              <p className="mt-1">
                {[CIDADES[c.cidade].nome.pt, c.local.pt].filter(Boolean).join(' · ')}
              </p>
              <p className="text-small text-tinta-suave">
                {c.quartos} quartos · {c.capacidade} pessoas{c.diaria ? ` · diária base ${formatarPreco(c.diaria * 100)}` : ''}
              </p>
              <Calendario c={c} />
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

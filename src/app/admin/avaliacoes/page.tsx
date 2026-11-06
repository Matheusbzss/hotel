import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { obterPasseio, passeiosAtivos } from '@/data/passeios';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { MINIMO_NO_SITE, ORIGENS, type Avaliacao, type Origem } from '@/lib/avaliacao';
import { listarAvaliacoes } from '@/lib/avaliacoes';
import { formatarDataIso, hojeEmBuzios } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

const ORIGEM: Record<Origem, string> = {
  google: 'Google',
  tripadvisor: 'TripAdvisor',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  site: 'Site',
};

const ERROS: Record<string, string> = {
  nome: 'Escreva o primeiro nome de quem avaliou.',
  nota: 'A nota vai de 1 a 5.',
  texto: 'Cole o texto da avaliação.',
  origem: 'Escolha de onde a avaliação veio.',
  origemUrl: 'Esse link não é válido: ele precisa começar com https://',
  data: 'Escolha a data da avaliação, de hoje para trás.',
};

function Lista({ a }: { a: Avaliacao }) {
  const passeio = a.produtoSlug ? obterPasseio(a.produtoSlug) : undefined;
  return (
    <li className="grid gap-4 bg-white p-5 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <p className="text-xl font-bold tracking-tight">{[a.nome, a.cidade, a.pais].filter(Boolean).join(', ')}</p>
        <span
          className={`mt-1 inline-block px-3 py-1 text-small font-semibold ${a.publicada ? 'bg-[#d8f5e4] text-[#0f5132]' : 'bg-[#e5e9ee] text-mar'}`}
        >
          {a.publicada ? 'Publicada' : 'Escondida'}
        </span>
        <p className="mt-2 text-small text-tinta-suave">{formatarDataIso(a.data, 'pt-BR')}</p>
      </div>
      <div className="lg:col-span-6">
        <p className="font-semibold">
          {a.nota ? `Nota ${a.nota} de 5 · ` : ''}
          {passeio ? passeio.nome.pt : 'Agência'}
        </p>
        {a.titulo && <p className="mt-1 font-semibold">{a.titulo}</p>}
        <p className="mt-1 whitespace-pre-line">{a.texto}</p>
      </div>
      <div className="lg:col-span-3 lg:text-right">
        {a.origemUrl ? (
          <p>
            <a href={a.origemUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              Ver em {ORIGEM[a.origem]}
            </a>
          </p>
        ) : (
          <p className="text-small text-tinta-suave">Origem: {ORIGEM[a.origem]}</p>
        )}
        <form method="post" action={`/api/admin/avaliacoes/${a.id}`} className="mt-3">
          <input type="hidden" name="publicada" value={a.publicada ? 'nao' : 'sim'} />
          <button type="submit" className="min-h-10 bg-mar px-4 text-small font-semibold text-white">
            {a.publicada ? 'Esconder' : 'Publicar'}
          </button>
        </form>
      </div>
    </li>
  );
}

export default async function Avaliacoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) redirect('/admin');

  const q = await searchParams;
  let lista: Avaliacao[] = [];
  let erroBanco = '';
  try {
    lista = await listarAvaliacoes();
  } catch (e) {
    erroBanco = String(e instanceof Error ? e.message : e);
  }
  const publicadas = lista.filter((a) => a.publicada).length;
  const erro = typeof q.erro === 'string' ? (ERROS[q.erro] ?? 'Não deu para salvar. Confira os campos.') : '';

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Avaliações</h1>
          <p className="text-small text-tinta-suave">
            {publicadas} publicada{publicadas === 1 ? '' : 's'} ·{' '}
            {publicadas >= MINIMO_NO_SITE ? 'a seção de opiniões está no site' : `a seção aparece no site com pelo menos ${MINIMO_NO_SITE}`}
          </p>
        </div>
        <a href="/admin" className="min-h-10 bg-white px-4 py-2 font-semibold">
          Voltar aos pedidos
        </a>
      </header>

      <form method="post" action="/api/admin/avaliacoes" className="mt-6 grid gap-4 bg-white p-5 md:grid-cols-2">
        <h2 className="text-lead font-semibold md:col-span-2">Cadastrar avaliação real</h2>
        {erro && (
          <p className="bg-erro-claro px-4 py-3 font-semibold md:col-span-2" role="alert">
            {erro}
          </p>
        )}
        {q.ok === '1' && (
          <p className="bg-[#d8f5e4] px-4 py-3 font-semibold text-[#0f5132] md:col-span-2" role="status">
            Avaliação salva. Ela fica escondida até você tocar em Publicar.
          </p>
        )}
        <div>
          <label htmlFor="nome" className="rotulo">
            Primeiro nome
          </label>
          <input id="nome" name="nome" className="campo" maxLength={60} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="cidade" className="rotulo">
              Cidade (opcional)
            </label>
            <input id="cidade" name="cidade" className="campo" maxLength={60} />
          </div>
          <div>
            <label htmlFor="pais" className="rotulo">
              País (opcional)
            </label>
            <input id="pais" name="pais" className="campo" maxLength={60} />
          </div>
        </div>
        <div>
          <label htmlFor="produtoSlug" className="rotulo">
            Passeio
          </label>
          <select id="produtoSlug" name="produtoSlug" className="campo" defaultValue="">
            <option value="">A agência em geral</option>
            {passeiosAtivos().map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nome.pt}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="nota" className="rotulo">
              Nota (só se a origem tiver)
            </label>
            <select id="nota" name="nota" className="campo" defaultValue="">
              <option value="">Sem nota</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="idioma" className="rotulo">
              Idioma do texto
            </label>
            <select id="idioma" name="idioma" className="campo" defaultValue="pt">
              <option value="pt">Português</option>
              <option value="es">Espanhol</option>
              <option value="en">Inglês</option>
            </select>
          </div>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="titulo" className="rotulo">
            Título que a pessoa deu (opcional)
          </label>
          <input id="titulo" name="titulo" className="campo" maxLength={120} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="texto" className="rotulo">
            Texto da avaliação, igual ao original
          </label>
          <textarea id="texto" name="texto" className="campo min-h-28" maxLength={1500} required />
        </div>
        <div>
          <label htmlFor="origem" className="rotulo">
            De onde veio
          </label>
          <select id="origem" name="origem" className="campo" defaultValue="google">
            {ORIGENS.map((o) => (
              <option key={o} value={o}>
                {ORIGEM[o]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="data" className="rotulo">
            Data da avaliação
          </label>
          <input id="data" name="data" type="date" className="campo" max={hojeEmBuzios()} required />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="origemUrl" className="rotulo">
            Link de onde ela veio (opcional)
          </label>
          <input id="origemUrl" name="origemUrl" type="url" className="campo" placeholder="https://" maxLength={500} />
        </div>
        <button type="submit" className="botao md:col-span-2 md:justify-self-start">
          Salvar avaliação
        </button>
      </form>

      {erroBanco && <p className="mt-6 bg-erro-claro px-4 py-3 font-semibold">Erro ao ler o banco: {erroBanco}</p>}
      {!erroBanco && !lista.length && <p className="mt-8">Nenhuma avaliação cadastrada ainda.</p>}

      <ul className="mt-6 space-y-3">
        {lista.map((a) => (
          <Lista key={a.id} a={a} />
        ))}
      </ul>
    </main>
  );
}

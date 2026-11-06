import Image from 'next/image';
import { obterPasseio } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import type { Avaliacao } from '@/lib/avaliacao';
import { TextoOpiniao } from './TextoOpiniao';

/** A nota em cinco estrelas; para o leitor de tela, "Nota 5 de 5". */
function Estrelas({ nota, rotulo }: { nota: number; rotulo: string }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={rotulo}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          viewBox="0 0 24 24"
          className={`size-5 ${n <= nota ? 'text-(--color-acao)' : 'text-(--color-borda)'}`}
          aria-hidden="true"
        >
          <path fill="currentColor" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" />
        </svg>
      ))}
    </span>
  );
}

/** A foto de perfil; sem ela, a inicial do nome. */
function Retrato({ foto, nome }: { foto?: string; nome: string }) {
  if (foto) return <Image src={foto} alt="" width={48} height={48} className="size-12 shrink-0 rounded-full object-cover" />;
  return (
    <span
      className="grid size-12 shrink-0 place-items-center rounded-full bg-(--color-superficie) font-[family-name:var(--font-semi)] text-lead font-semibold"
      aria-hidden="true"
    >
      {nome[0]}
    </span>
  );
}

/**
 * Opiniões de quem já foi: só avaliações reais, com o texto no idioma original. Sem o mínimo publicado, a seção não
 * aparece (src/lib/avaliacao.ts). O link só aparece nas avaliações que têm link.
 */
export function Opinioes({ itens, idioma, d }: { itens: Avaliacao[]; idioma: Idioma; d: Dicionario }) {
  if (!itens.length) return null;
  const O = d.opinioes;
  const mes = new Intl.DateTimeFormat(LOCALE_INTL[idioma], { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <section className="moldura py-16 md:py-24" aria-labelledby="opinioes-titulo">
      <h2 id="opinioes-titulo" className="titulo entrar">
        {O.titulo}
      </h2>
      <ul className="trilho entrar mt-6 md:mt-8 lg:grid-cols-3">
        {itens.map((a) => {
          const passeio = a.produtoSlug ? obterPasseio(a.produtoSlug) : undefined;
          return (
            <li key={a.id}>
              <article className="flex h-full flex-col rounded-cartao border border-(--color-borda) bg-(--color-papel) p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <Retrato foto={a.foto} nome={a.nome} />
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-semi)] font-semibold leading-tight">{a.nome}</p>
                    {(a.cidade || a.pais) && (
                      <p className="text-small text-(--color-tinta-suave)">{[a.cidade, a.pais].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                </div>
                {a.nota && (
                  <div className="mt-3">
                    <Estrelas nota={a.nota} rotulo={fmt(O.nota, { n: a.nota })} />
                  </div>
                )}
                {a.titulo && <h3 className="mt-2 font-[family-name:var(--font-semi)] font-semibold leading-snug">{a.titulo}</h3>}
                <TextoOpiniao texto={a.texto} lerMais={O.lerMais} lerMenos={O.lerMenos} />
                <p className="mt-3 text-small text-(--color-tinta-suave)">
                  {[passeio?.nome[idioma], mes.format(new Date(`${a.data}T12:00:00Z`))].filter(Boolean).join(' · ')}
                </p>
                {a.idioma && a.idioma !== idioma && <p className="text-small text-(--color-tinta-suave)">{O.original[a.idioma]}</p>}
                {a.origemUrl && (
                  <a href={a.origemUrl} target="_blank" rel="noopener noreferrer nofollow" className="link mt-2 self-start text-small">
                    {O.ver[a.origem]}
                  </a>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

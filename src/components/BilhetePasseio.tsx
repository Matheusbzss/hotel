import Link from 'next/link';
import type { Passeio } from '@/data/passeios';
import { rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { formatarPreco, precoAdultoCentavos } from '@/lib/precos';
import { COR_CIDADE, nomeCidade, rotuloUnidade } from '@/lib/passeio-view';
import { MidiaPasseio } from './MidiaPasseio';

/** Card de passeio em forma de bilhete: foto, picote com entalhes e canhoto com o preço. */
export function BilhetePasseio({
  passeio,
  idioma,
  d,
  prioridade,
}: {
  passeio: Passeio;
  idioma: Idioma;
  d: Dicionario;
  prioridade?: boolean;
}) {
  const href = rota(idioma, `/passeios/${passeio.slug}`);
  const inclui = passeio.inclui[idioma].slice(0, 2);
  return (
    <article
      className="bilhete group relative flex h-full flex-col bg-areia-clara transition-transform duration-200 hover:-translate-y-1"
      style={{ ['--corte' as string]: 'calc(100% - 100px)' }}
    >
      <MidiaPasseio
        passeio={passeio}
        idioma={idioma}
        prioridade={prioridade}
        sizes="(min-width: 1280px) 400px, (min-width: 768px) 45vw, 100vw"
        className="aspect-[4/3] w-full"
      />
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <p className="text-small font-semibold">
          {nomeCidade(passeio, idioma)} · {passeio.duracao[idioma]}
        </p>
        <h3 className="mt-1 text-[1.375rem] font-bold leading-tight">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {passeio.nome[idioma]}
          </Link>
        </h3>
        <ul className="mt-3 space-y-1 text-[1rem]">
          {inclui.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-turquesa" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="picote-areia mx-4" aria-hidden="true" />
      <div className={`flex h-[96px] items-center justify-between gap-3 px-5 ${COR_CIDADE[passeio.cidade]}`}>
        <p className="leading-tight">
          <span className="block text-small">{d.comum.aPartirDe}</span>
          <span className="block text-[1.5rem] font-bold">{formatarPreco(precoAdultoCentavos(passeio), idioma)}</span>
          <span className="block text-small">{rotuloUnidade(passeio, d)}</span>
        </p>
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-tinta text-white transition-transform group-hover:translate-x-1"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
            <path d="M13.2 5.3 11.8 6.7 16.1 11H4v2h12.1l-4.3 4.3 1.4 1.4L20 12z" />
          </svg>
        </span>
      </div>
    </article>
  );
}

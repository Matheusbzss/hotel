import Link from 'next/link';
import type { Passeio } from '@/data/passeios';
import type { Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { formatarPreco } from '@/lib/precos';
import { nomeCidade, precoPasseio } from '@/lib/passeio-view';
import { PrecoGrupo } from './grupo/PrecoGrupo';
import { MidiaPasseio } from './MidiaPasseio';

/** Card de passeio: foto, cidade e duração, nome, preço e o total do grupo escolhido. */
export function CardPasseio({ passeio: p, idioma, d }: { passeio: Passeio; idioma: Idioma; d: Dicionario }) {
  const preco = precoPasseio(p, idioma, d);
  return (
    <Link href={preco.href} className="group grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-4 sm:block">
      <MidiaPasseio
        passeio={p}
        idioma={idioma}
        decorativa
        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 7.5rem"
        className="aspect-square sm:aspect-[4/5]"
      />
      <div className="min-w-0 sm:mt-4">
        <p className="text-small text-(--tinta-suave)">
          {nomeCidade(p, idioma)} · {p.duracao[idioma]}
        </p>
        <h3 className="mt-1 text-lead font-semibold leading-tight underline-offset-[0.2em] group-hover:underline">{p.nome[idioma]}</h3>
        <p className="mt-2">
          {preco.temOpcoes && <span className="text-small">{`${d.comum.aPartirDe} `}</span>}
          <strong className="numeros text-lead">{formatarPreco(preco.tabela.precoCentavos, idioma)}</strong>{' '}
          <span className="text-small text-(--tinta-suave)">{preco.unidadeCurta}</span>
        </p>
        <PrecoGrupo tabela={preco.tabela} locale={idioma} rotulo={d.passeios.totalGrupo} className="mt-1 text-small font-semibold" />
      </div>
    </Link>
  );
}

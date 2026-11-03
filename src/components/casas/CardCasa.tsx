import Image from 'next/image';
import type { Casa } from '@/data/casas';
import { CIDADES } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, rota, type Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { menorDiaria } from '@/lib/diarias';
import { CartaoInclinavel } from '../Inclinar';

/**
 * Cartão da casa: a foto de capa com a cidade e a praia em etiquetas de vidro, o nome, os quartos e as
 * pessoas, e a menor diária do ano.
 */
export function CardCasa({
  casa: c,
  idioma,
  d,
  sizes = '(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw',
}: {
  casa: Casa;
  idioma: Idioma;
  d: Dicionario;
  sizes?: string;
}) {
  const t = d.casas;
  const diaria = formatarCifra(menorDiaria(c) * 100, LOCALE_INTL[idioma]);
  const tamanho = `${fmt(t.quartos, { n: c.quartos })} · ${fmt(t.capacidade, { n: c.capacidade })}`;
  return (
    <CartaoInclinavel
      href={rota(idioma, `/casas-de-temporada/${c.slug}`)}
      rotulo={`${c.nome[idioma]}, ${c.local[idioma]}, ${tamanho}, ${t.diariaAPartir} ${diaria}`}
    >
      <div className="cartao-foto">
        <div className="absolute inset-0 bg-superficie">
          {c.fotos[0] && <Image src={c.fotos[0]} alt="" fill sizes={sizes} quality={80} className="object-cover" />}
        </div>
        <div className="etiquetas" aria-hidden="true">
          <span className="etiqueta vidro vidro-escuro">{CIDADES[c.cidade].nome[idioma]}</span>
          <span className="etiqueta vidro vidro-escuro">{c.local[idioma]}</span>
        </div>
      </div>
      <div className="cartao-texto" aria-hidden="true">
        <h3 className="cartao-titulo">{c.nome[idioma]}</h3>
        <p className="mt-1 text-small text-(--color-tinta-suave)">{tamanho}</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-small text-(--color-tinta-suave)">{t.diariaAPartir}</span>
          <strong className="cifra text-figure">{diaria}</strong>
        </p>
      </div>
    </CartaoInclinavel>
  );
}

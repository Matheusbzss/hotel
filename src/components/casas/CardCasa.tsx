import Image from 'next/image';
import type { Casa } from '@/data/casas';
import { CIDADES } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, rota, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { formatarCifra } from '@/lib/cifra';
import { menorDiaria } from '@/lib/diarias';
import { cotacaoDolar, textoDolar } from '@/lib/dolar';
import { precoPixCentavos } from '@/lib/orcamento';
import { CartaoInclinavel } from '../Inclinar';

/**
 * Cartão da casa: a foto de capa com a cidade e a praia em etiquetas de vidro, o nome, os quartos e as
 * pessoas, e a menor diária do ano no Pix (com desconto) e no cartão — em espanhol e inglês, os dois
 * preços com o aproximado em dólar ao lado, como no cartão do passeio.
 */
export async function CardCasa({
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
  const diariaCentavos = menorDiaria(c) * 100;
  const diaria = formatarCifra(diariaCentavos, LOCALE_INTL[idioma]);
  const diariaPix = formatarCifra(precoPixCentavos(diariaCentavos), LOCALE_INTL[idioma]);
  const cotacao = idioma === 'pt' ? null : await cotacaoDolar();
  const usdPix = textoDolar(precoPixCentavos(diariaCentavos), cotacao, d.preco.dolar, LOCALE_INTL[idioma]);
  const usdCartao = textoDolar(diariaCentavos, cotacao, d.preco.dolar, LOCALE_INTL[idioma]);
  const tamanho = `${fmt(t.quartos, { n: c.quartos })} · ${fmt(t.capacidade, { n: c.capacidade })}`;
  return (
    <CartaoInclinavel
      href={rota(idioma, `/casas-de-temporada/${c.slug}`)}
      rotulo={`${texto(c.nome, idioma)}, ${texto(c.local, idioma)}, ${tamanho}, ${t.diariaAPartir} ${diariaPix} ${d.preco.noPix}`}
    >
      <div className="cartao-foto">
        <div className="absolute inset-0 bg-superficie">
          {c.fotos[0] && <Image src={c.fotos[0]} alt={texto(c.nome, idioma)} fill sizes={sizes} quality={80} className="object-cover" />}
        </div>
        <div className="etiquetas" aria-hidden="true">
          <span className="etiqueta vidro vidro-escuro">{texto(CIDADES[c.cidade].nome, idioma)}</span>
          <span className="etiqueta vidro vidro-escuro">{texto(c.local, idioma)}</span>
        </div>
      </div>
      <div className="cartao-texto" aria-hidden="true">
        <h3 className="cartao-titulo">{texto(c.nome, idioma)}</h3>
        <p className="mt-1 text-small text-(--color-tinta-suave)">{tamanho}</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-small text-(--color-tinta-suave)">{t.diariaAPartir}</span>
          <strong className="cifra text-figure">{diariaPix}</strong>
          <span className="text-small font-semibold text-(--color-sucesso)">{d.preco.noPix}</span>
          {usdPix && <span className="whitespace-nowrap text-small text-(--color-tinta-suave)">· {usdPix}</span>}
        </p>
        <p className="text-small text-(--color-tinta-suave)">
          <span className="numeros font-semibold text-(--color-tinta)">{diaria}</span> {d.preco.noCartao}
          {usdCartao && <span className="whitespace-nowrap"> · {usdCartao}</span>}
        </p>
      </div>
    </CartaoInclinavel>
  );
}

import Image from 'next/image';
import type { Texto } from '@/data/passeios';
import { fmt, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import type { Destaque, Quarto } from '@/lib/casa-detalhes';
import {
  PRINCIPAIS_COMODIDADES,
  camasDoQuarto,
  comodidadesPorGrupo,
  type ComodidadeDaPagina,
  type RegrasDaPagina,
} from '@/lib/casa-pagina';
import { Expandir } from './Expandir';
import { IconeCasa } from './IconeCasa';

/* As partes da página da casa que vêm prontas do servidor (Etapa 7, partes 3, 5, 6 e 9). */

/** Os destaques: 3 ou 4 linhas com ícone, só com o que o dono confirmou. */
export function DestaquesCasa({ destaques, idioma, rotulo }: { destaques: Destaque[]; idioma: Idioma; rotulo: string }) {
  if (!destaques.length) return null;
  return (
    <ul className="destaques-casa" aria-label={rotulo}>
      {destaques.map((d) => (
        <li key={d.texto.pt}>
          <IconeCasa nome={d.icone} className="size-6 text-(--color-turquesa-texto)" />
          <span>{texto(d.texto, idioma)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Os quartos. Com a foto de todos: um cartão com a foto do próprio quarto, que desliza para o lado no celular. Faltando
 * a foto de algum (a Geribá, até as fotos chegarem): uma lista compacta, uma linha por quarto, com o ícone de cama no
 * lugar da foto e a miniatura só no quarto que tem a própria foto (nunca a foto de outro quarto, nem um bloco cinza do
 * tamanho de uma foto).
 */
export function QuartosCasa({
  quartos,
  idioma,
  locale,
  altDaFoto,
  textos: T,
}: {
  quartos: Quarto[];
  idioma: Idioma;
  locale: string;
  altDaFoto: (foto: string) => string;
  textos: { titulo: string; comBanheiro: string };
}) {
  if (!quartos.length) return null;
  const detalhe = (q: Quarto) => [q.banheiro ? T.comBanheiro : '', q.detalhe ? texto(q.detalhe, idioma) : ''].filter(Boolean).join(' · ');
  const todosComFoto = quartos.every((q) => q.foto);
  return (
    <section aria-labelledby="quartos-casa">
      <h2 id="quartos-casa" className="titulo-casa">
        {T.titulo}
      </h2>
      {todosComFoto ? (
        <ul className="quartos-casa sem-barra">
          {quartos.map((q) => (
            <li key={q.nome.pt} className="quarto-casa">
              <div className="quarto-casa-foto">
                {q.foto && (
                  <Image
                    src={q.foto}
                    alt={altDaFoto(q.foto)}
                    fill
                    sizes="(min-width: 1024px) 220px, (min-width: 640px) 40vw, 70vw"
                    quality={75}
                    className="object-cover"
                  />
                )}
              </div>
              <p className="mt-3 font-semibold">{texto(q.nome, idioma)}</p>
              <p className="text-small">{camasDoQuarto(q, idioma, locale)}</p>
              {detalhe(q) && <p className="text-small text-(--color-tinta-suave)">{detalhe(q)}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="quartos-lista">
          {quartos.map((q) => (
            <li key={q.nome.pt} className="quarto-linha">
              <span className="quarto-linha-marca">
                {q.foto ? (
                  <Image src={q.foto} alt={altDaFoto(q.foto)} fill sizes="56px" quality={70} className="object-cover" />
                ) : (
                  <IconeCasa nome="cama" className="size-6 text-(--color-turquesa-texto)" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{texto(q.nome, idioma)}</span>
                <span className="block text-small">{[camasDoQuarto(q, idioma, locale), detalhe(q)].filter(Boolean).join(' · ')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemComodidade({ c, idioma }: { c: ComodidadeDaPagina; idioma: Idioma }) {
  return (
    <li>
      <IconeCasa nome={c.icone} className="size-6 text-(--color-turquesa-texto)" />
      <span>
        {texto(c.nome, idioma)}
        {c.detalhe && <span className="block text-small text-(--color-tinta-suave)">{texto(c.detalhe, idioma)}</span>}
      </span>
    </li>
  );
}

/**
 * O que a casa tem: as 10 principais com ícone e, com "ver tudo", a lista inteira em grupos (vista e praia, área
 * externa, cozinha, quartos, banheiros, sala, serviços, segurança), sem sair da página.
 */
export function ComodidadesCasa({
  comodidades,
  idioma,
  textos: T,
}: {
  comodidades: ComodidadeDaPagina[];
  idioma: Idioma;
  textos: { titulo: string; verTudo: string; mostrarMenos: string };
}) {
  if (!comodidades.length) return null;
  const principais = (
    <ul className="comodidades-casa">
      {comodidades.slice(0, PRINCIPAIS_COMODIDADES).map((c) => (
        <ItemComodidade key={c.id} c={c} idioma={idioma} />
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="comodidades-casa">
      <h2 id="comodidades-casa" className="titulo-casa">
        {T.titulo}
      </h2>
      {comodidades.length > PRINCIPAIS_COMODIDADES ? (
        <Expandir
          fechado={principais}
          aberto={
            <div className="grid gap-8">
              {comodidadesPorGrupo(comodidades).map((g) => (
                <div key={g.grupo}>
                  <h3 className="font-semibold">{texto(g.nome, idioma)}</h3>
                  <ul className="comodidades-casa">
                    {g.itens.map((c) => (
                      <ItemComodidade key={c.id} c={c} idioma={idioma} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          }
          rotuloAbrir={fmt(T.verTudo, { n: comodidades.length })}
          rotuloFechar={T.mostrarMenos}
        />
      ) : (
        principais
      )}
    </section>
  );
}

function Abre({ titulo, itens, idioma }: { titulo: string; itens: Texto[]; idioma: Idioma }) {
  if (!itens.length) return null;
  return (
    <details className="abre-casa group">
      <summary>
        <h2 className="text-lead font-semibold">{titulo}</h2>
        <IconeCasa nome="abrir" className="size-5 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ul>
        {itens.map((i) => (
          <li key={i.pt}>{texto(i, idioma)}</li>
        ))}
      </ul>
    </details>
  );
}

/** Regras da casa, chegada e segurança e cancelamento: partes que abrem ao tocar. */
export function RegrasCasa({
  regras,
  idioma,
  textos: T,
}: {
  regras: RegrasDaPagina;
  idioma: Idioma;
  textos: { regras: string; chegada: string; cancelamento: string };
}) {
  return (
    <div className="grid gap-2">
      <Abre titulo={T.regras} itens={regras.casa} idioma={idioma} />
      <Abre titulo={T.chegada} itens={regras.chegada} idioma={idioma} />
      <Abre titulo={T.cancelamento} itens={regras.cancelamento} idioma={idioma} />
    </div>
  );
}

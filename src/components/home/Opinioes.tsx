import Image from 'next/image';
import { altDaFoto } from '@/data/fotos-alt';
import { obterPasseio } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import { idiomaDeConteudo, texto } from '@/i18n/conteudo';
import type { Avaliacao, Origem } from '@/lib/avaliacao';
import { PONTO_PRESO } from '@/lib/ponto';
import { FaixaFoto, TITULO_NA_FOTO } from './BlocosHome';
import { TextoOpiniao } from './TextoOpiniao';

/** O fundo da seção: uma lancha dos passeios da agência, ancorada ao entardecer. */
const FOTO = '/fotos/lancha/lancha-entardecer.jpg';

/** Os sites que dão nota (src/lib/avaliacao.ts), como aparecem em "5 opiniões no Tripadvisor". */
const NOME_DA_ORIGEM: Partial<Record<Origem, string>> = { google: 'Google', tripadvisor: 'Tripadvisor' };

const ESTRELA = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z';

/** A nota da agência (notaDaAgencia e origemDaNota, em src/lib/avaliacao.ts). */
export interface NotaDaAgencia {
  media: number;
  total: number;
  origem?: Origem;
}

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
          <path fill="currentColor" d={ESTRELA} />
        </svg>
      ))}
    </span>
  );
}

/** A foto de perfil; sem ela, a inicial do nome. */
function Retrato({ foto, nome }: { foto?: string; nome: string }) {
  if (foto) return <Image src={foto} alt={nome} width={48} height={48} className="size-12 shrink-0 rounded-full object-cover" />;
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
 * Opiniões de quem já foi: só avaliações reais, com o texto no idioma original, em vidro sobre a foto. Sem o mínimo
 * publicado, a seção não aparece (src/lib/avaliacao.ts). Em cima, a nota da agência, que conta só as avaliações da
 * agência (as da cidade ficam fora); cada avaliação leva a etiqueta do que ela fala: "Sobre Orla Nativa" ou "Sobre
 * Búzios", com o lugar. O link só aparece nas avaliações que têm link.
 */
export function Opinioes({ itens, nota, idioma, d }: { itens: Avaliacao[]; nota: NotaDaAgencia; idioma: Idioma; d: Dicionario }) {
  if (!itens.length) return null;
  const O = d.opinioes;
  const intl = LOCALE_INTL[idioma];
  const mes = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const media = nota.media.toLocaleString(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const contagem = nota.total === 1 ? d.passeio.opinioesContagemUma : fmt(d.passeio.opinioesContagem, { n: nota.total });
  const site = nota.origem && NOME_DA_ORIGEM[nota.origem];
  const sobre = (a: Avaliacao) => (a.sobre === 'destino' ? [O.sobreDestino, a.lugar].filter(Boolean).join(PONTO_PRESO) : O.sobreAgencia);
  return (
    <FaixaFoto src={FOTO} alt={altDaFoto(FOTO, idioma)} posicao="28% 50%" veu="cima" aria-labelledby="opinioes-titulo">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        {/* chegando pelo "ver todas as opiniões" do passeio, o título para abaixo da cápsula do menu */}
        <h2 id="opinioes-titulo" className={`${TITULO_NA_FOTO} scroll-mt-24`}>
          {O.titulo}
        </h2>
        {nota.total > 0 && (
          <p className="vidro vidro-escuro inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2">
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-(--color-acao)" aria-hidden="true">
              <path fill="currentColor" d={ESTRELA} />
            </svg>
            <span className="sr-only">{fmt(O.nota, { n: media })}</span>
            <span>
              <span className="numeros font-[family-name:var(--font-semi)] text-lead font-semibold" aria-hidden="true">
                {media}
              </span>
              <span className="text-small">
                {PONTO_PRESO}
                {site ? fmt(O.naOrigem, { contagem, origem: site }) : contagem}
              </span>
            </span>
          </p>
        )}
      </div>
      <ul className="trilho entrar mt-6 md:mt-8 lg:grid-cols-3">
        {itens.map((a) => {
          const passeio = a.produtoSlug ? obterPasseio(a.produtoSlug) : undefined;
          return (
            <li key={a.id}>
              {/* no vidro, todo o texto vai na tinta: o cinza do texto suave perde contraste sobre a foto */}
              <article className="vidro vidro-claro flex h-full flex-col rounded-vidro p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <Retrato foto={a.foto} nome={a.nome} />
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-semi)] font-semibold leading-tight">{a.nome}</p>
                    {(a.cidade || a.pais) && <p className="text-small">{[a.cidade, a.pais].filter(Boolean).join(', ')}</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  {a.nota && <Estrelas nota={a.nota} rotulo={fmt(O.nota, { n: a.nota })} />}
                  <span className="rounded-full bg-(--color-tinta)/8 px-2.5 py-1 text-caption font-semibold">{sobre(a)}</span>
                </div>
                {a.titulo && <h3 className="mt-2 font-[family-name:var(--font-semi)] font-semibold leading-snug">{a.titulo}</h3>}
                <TextoOpiniao texto={a.texto} lerMais={O.lerMais} lerMenos={O.lerMenos} />
                <p className="mt-3 text-small">
                  {[passeio && texto(passeio.nome, idioma), mes.format(new Date(`${a.data}T12:00:00Z`))].filter(Boolean).join(PONTO_PRESO)}
                </p>
                {a.idioma && a.idioma !== idiomaDeConteudo(idioma) && <p className="text-small">{O.original[a.idioma]}</p>}
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
    </FaixaFoto>
  );
}

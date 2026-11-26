import Image from 'next/image';
import Link from 'next/link';
import { CardPasseio } from '@/components/CardPasseio';
import { FaixaFoto } from '@/components/home/BlocosHome';
import { CardTransfer } from '@/components/transfer/CardTransfer';
import { altDaFoto } from '@/data/fotos-alt';
import { guiaNoIdioma, obterGuia, type Guia, type GuiaResolvido, type SecaoGuia } from '@/data/guias';
import { obterPasseio, type Passeio } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, rota, type IdiomaGuia } from '@/i18n/config';
import { CartaoGuia } from './CartaoGuia';
import { TEXTOS_GUIA } from './textos-guia';

/** Uma seção com o texto já no idioma da página. */
type Secao = SecaoGuia<string>;

/** Texto com os links no formato [palavras](/caminho), traduzidos para o endereço do idioma da página. */
function Texto({ children, idioma }: { children: string; idioma: IdiomaGuia }) {
  return children.split(/(\[[^\]]+\]\([^)]+\))/g).map((parte, i) => {
    const link = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return link ? (
      <Link key={i} href={rota(idioma, link[2])} className="link font-semibold">
        {link[1]}
      </Link>
    ) : (
      parte
    );
  });
}

/** Nome e explicação em células, como a tabela de garantias: playas, dias do roteiro. */
function Detalhes({ itens, idioma }: { itens: NonNullable<Secao['detalhes']>; idioma: IdiomaGuia }) {
  return (
    <dl className="mt-5 grid gap-(--vao-celula)">
      {itens.map((d) => (
        <div key={d.nome} className="celula px-4 py-3">
          <dt className="font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold">{d.nome}</dt>
          <dd className="mt-0.5 text-(--color-tinta-suave)">
            <Texto idioma={idioma}>{d.texto}</Texto>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// abaixo de 360 px, 12 px nas bordas da caixa e 8 px de cada lado das células (16 px entre as colunas): com a letra
// normal, a tabela cabe na tela de 320 px e "130 mm" não quebra; de 360 px para cima, 16 px de cada lado, como sempre.
// A quebra é em rem (22.5rem = 360 px com a letra padrão de 16 px): com a letra padrão do navegador maior, a folga
// estreita vale até mais longe (com 20 px, até 450 px), porque as media queries em rem seguem essa letra
const FOLGA_CELULA = 'px-4 max-[22.5rem]:px-2 max-[22.5rem]:first:pl-3 max-[22.5rem]:last:pr-3';

/**
 * Números curtos em linhas, que cabem inteiros no celular: o clima de cada mês. Se mesmo assim a tabela não cabe (letra
 * muito grande em tela estreita), ela rola de lado dentro da caixa, em vez de cortar a coluna da direita.
 */
function TabelaCompacta({ t }: { t: NonNullable<Secao['tabela']> }) {
  return (
    <div className="celula mt-5 overflow-x-auto overflow-y-hidden">
      <table className="w-full text-left">
        <caption className="sr-only">{t.legenda}</caption>
        <thead>
          <tr>
            {t.colunas.map((c, i) => (
              <th key={c} scope="col" className={`coluna ${FOLGA_CELULA} py-2.5 font-semibold ${i ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {t.linhas.map(([nome, ...valores]) => (
            <tr key={nome}>
              <th scope="row" className={`border-t border-(--color-borda) ${FOLGA_CELULA} py-2 font-semibold`}>
                {nome}
              </th>
              {valores.map((v, i) => (
                <td key={t.colunas[i + 1]} className={`border-t border-(--color-borda) ${FOLGA_CELULA} py-2 text-right`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Comparação com frases, como a tabela de garantias: no celular, cada linha vira um bloco. */
function Tabela({ t }: { t: NonNullable<Secao['tabela']> }) {
  return (
    <table className="mt-5 w-full border-separate border-spacing-y-(--vao-celula) text-left">
      <caption className="sr-only">{t.legenda}</caption>
      <thead className="sr-only md:not-sr-only">
        <tr>
          {t.colunas.map((c) => (
            <th key={c} scope="col" className="coluna px-3 pb-1 font-semibold">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t.linhas.map(([tema, ...celulas]) => (
          <tr key={tema} className="block rounded-[4px] border border-(--color-borda) bg-(--color-papel) pb-3 md:table-row md:border-0">
            <th
              scope="row"
              className="block px-3 pt-3 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold md:table-cell md:rounded-l-[4px] md:border md:border-r-0 md:border-(--color-borda) md:py-3.5"
            >
              {tema}
            </th>
            {celulas.map((c, i) => (
              <td
                key={t.colunas[i + 1]}
                className="block px-3 pt-1 md:table-cell md:border-y md:border-(--color-borda) md:py-3.5 md:last:rounded-r-[4px] md:last:border-r"
              >
                <span className="font-semibold md:hidden">{t.colunas[i + 1]}: </span>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SecaoDoGuia({
  secao: s,
  d,
  idioma,
  fotoNaEsquerda,
}: {
  secao: Secao;
  d: Dicionario;
  idioma: IdiomaGuia;
  fotoNaEsquerda: boolean;
}) {
  const passeios = (s.passeios ?? []).map(obterPasseio).filter((p): p is Passeio => Boolean(p));
  // a etiqueta da cidade só ajuda quando os cartões da seção são de cidades diferentes
  const variasCidades = new Set(passeios.map((p) => p.cidade)).size > 1;
  const aoLado = Boolean(s.foto || s.transfer);
  const lado = fotoNaEsquerda ? 'lg:col-span-6 lg:col-start-7 lg:row-start-1' : 'lg:col-span-7';
  const fotoAlta = Boolean(s.detalhes || s.tabela);
  return (
    <section id={s.id} aria-labelledby={`${s.id}-titulo`} className="moldura mt-14 scroll-mt-24 md:mt-24">
      {/* grid-cols-1: no celular, uma coluna que encolhe com a tela; sem isto, com a letra grande, a tabela do clima
          alargava a coluna (e o texto junto) e a página rolava de lado */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-x-8">
        <div className={aoLado ? lado : 'lg:col-span-8'}>
          <h2 id={`${s.id}-titulo`} className="titulo">
            {s.titulo}
          </h2>
          <div className="texto-corrido mt-4 max-w-[65ch]">
            {s.paragrafos.map((p) => (
              <p key={p.slice(0, 40)}>
                <Texto idioma={idioma}>{p}</Texto>
              </p>
            ))}
          </div>
          {s.detalhes && <Detalhes itens={s.detalhes} idioma={idioma} />}
          {s.tabela && (s.tabela.compacta ? <TabelaCompacta t={s.tabela} /> : <Tabela t={s.tabela} />)}
        </div>
        {s.foto && (
          <figure className={fotoNaEsquerda ? 'lg:col-span-5 lg:col-start-1 lg:row-start-1' : 'lg:col-span-5'}>
            <div className={`adiar relative aspect-[4/3] overflow-hidden rounded-[4px] ${fotoAlta ? 'lg:aspect-[4/5]' : ''}`}>
              <Image
                src={s.foto}
                alt={altDaFoto(s.foto, idioma)}
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                quality={70}
                className="object-cover"
                style={s.posicaoFoto ? { objectPosition: s.posicaoFoto } : undefined}
              />
            </div>
          </figure>
        )}
        {s.transfer && (
          <div className="lg:col-span-4 lg:col-start-9">
            <CardTransfer cidade={s.transfer} idioma={idioma} d={d} />
          </div>
        )}
      </div>
      {passeios.length > 0 && (
        <ul className="trilho mt-6 md:mt-8">
          {passeios.map((p) => (
            <li key={p.slug}>
              <CardPasseio passeio={p} idioma={idioma} d={d} mostrarCidade={variasCidades} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * O guia: a foto real de borda a borda com o título, a resposta curta e a ficha para bater o olho logo abaixo,
 * e depois a leitura em coluna, interrompida só pelas fotos e pelos cartões dos passeios de cada assunto.
 * Recebe o guia já no idioma da página (guiaNoIdioma) e o idioma, para os links e os cartões saírem no mesmo espanhol.
 */
export function CorpoGuia({ guia: g, idioma, d }: { guia: GuiaResolvido; idioma: IdiomaGuia; d: Dicionario }) {
  const T = TEXTOS_GUIA[idioma];
  const data = new Intl.DateTimeFormat(LOCALE_INTL[idioma], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${g.atualizado}T12:00:00Z`),
  );
  // no computador, as fotos alternam de lado, para a leitura ter ritmo
  const comFoto = g.secoes.filter((s) => s.foto);
  const relacionados = g.relacionados
    .map(obterGuia)
    .filter((r): r is Guia => Boolean(r))
    .map((r) => guiaNoIdioma(r, idioma));
  const indice = (
    <ul className="grid gap-2.5 lg:flex lg:flex-wrap lg:gap-x-6">
      {g.secoes.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="link">
            {s.titulo}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <section className="topo-passeio" aria-labelledby="guia-titulo">
        <div className="topo-passeio-fotos">
          <Image
            src={g.foto}
            alt={altDaFoto(g.foto, idioma)}
            fill
            preload
            fetchPriority="high"
            sizes="100vw"
            quality={80}
            className="object-cover"
            style={g.posicaoFoto ? { objectPosition: g.posicaoFoto } : undefined}
          />
        </div>
        <div className="topo-passeio-texto">
          <div className="moldura">
            <h1 id="guia-titulo" className="topo-passeio-titulo">
              {g.h1}
            </h1>
          </div>
        </div>
      </section>

      <div className="moldura mt-6 grid grid-cols-1 gap-6 md:mt-10 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-7">
          <p className="max-w-[56ch] text-lead leading-[1.35]">{g.resumo}</p>
          <p className="mt-3 text-small text-(--color-tinta-suave)">
            {T.atualizado} {data}
          </p>
        </div>
        {/* duas colunas; com a letra grande em tela estreita, uma só (duas-colunas-celula, em globals.css) */}
        <dl className="duas-colunas-celula grid gap-(--vao-celula) self-start lg:col-span-5">
          {g.ficha.map((f) => (
            <div key={f.rotulo} className="celula px-3.5 py-2.5">
              <dt className="text-small text-(--color-tinta-suave)">{f.rotulo}</dt>
              <dd className="cifra text-figure">{f.valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      <nav aria-label={T.indice} className="moldura mt-6 md:mt-10">
        <details className="tom-superficie group px-5 py-3 lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            {T.indice}
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">
              <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </summary>
          <div className="pb-3 pt-1">{indice}</div>
        </details>
        <div className="hidden lg:block">{indice}</div>
      </nav>

      {g.secoes.map((s) => (
        <SecaoDoGuia key={s.id} secao={s} d={d} idioma={idioma} fotoNaEsquerda={comFoto.indexOf(s) % 2 === 1} />
      ))}

      <section aria-labelledby="guia-preguntas" className="tom-superficie mt-16 py-14 md:mt-24 md:py-24">
        <div className="moldura grid gap-6 md:grid-cols-12 md:gap-x-8">
          <h2 id="guia-preguntas" className="titulo md:col-span-4">
            {T.perguntas}
          </h2>
          <div className="grid content-start gap-(--vao-celula) md:col-span-8">
            {g.perguntas.map((f) => (
              <details key={f.p} className="celula group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.p}
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.75" />
                  </svg>
                </summary>
                <p className="max-w-[65ch] px-4 pb-4">{f.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="guia-relacionados" className="moldura my-14 md:my-24">
        <h2 id="guia-relacionados" className="titulo">
          {T.seguir}
        </h2>
        <ul className="trilho mt-6 md:mt-8">
          {relacionados.map((r) => (
            <li key={r.slug}>
              <CartaoGuia guia={r} idioma={idioma} />
            </li>
          ))}
        </ul>
        <p className="mt-5">
          <Link href={rota(idioma, '/guias')} className="link font-semibold">
            {T.todas}
          </Link>
        </p>
      </section>

      <FaixaFoto
        src={g.fechamento.foto}
        alt={altDaFoto(g.fechamento.foto, idioma)}
        posicao={g.fechamento.posicaoFoto}
        aria-labelledby="guia-fechamento"
      >
        <div className="vidro vidro-escuro max-w-[32rem] rounded-[24px] p-6 text-white md:p-8">
          <h2 id="guia-fechamento" className="titulo">
            {g.fechamento.titulo}
          </h2>
          <p className="mt-3 text-lead leading-[1.35]">{g.fechamento.texto}</p>
          <Link href={rota(idioma, g.fechamento.caminho)} className="botao mt-5">
            {g.fechamento.botao}
          </Link>
        </div>
      </FaixaFoto>
    </>
  );
}

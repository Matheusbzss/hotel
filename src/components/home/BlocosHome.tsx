import Image from 'next/image';
import Link from 'next/link';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { ICONES } from '@/components/passeio/Confianca';
import { DESCONTO_PIX_PORCENTO } from '@/config/precos';
import { altDaFoto } from '@/data/fotos-alt';
import { dividirPerguntas } from '@/data/perguntas';
import type { Dicionario } from '@/i18n';
import { fmt, type Idioma } from '@/i18n/config';
import { linkEmail } from '@/lib/email';

/** A política de cancelamento em linhas de células: a situação, o que você recebe e o prazo. */
export function TabelaGarantias({ d, className = '' }: { d: Dicionario; className?: string }) {
  const H = d.home;
  const [se, recebe, prazo] = H.garantiasColunas;
  return (
    <table className={`w-full border-separate border-spacing-y-(--vao-celula) text-left ${className}`}>
      <thead className="sr-only md:not-sr-only">
        <tr>
          <th scope="col" className="coluna px-3 pb-1 font-semibold md:w-[38%]">
            {se}
          </th>
          <th scope="col" className="coluna px-3 pb-1 font-semibold">
            {recebe}
          </th>
          <th scope="col" className="coluna px-3 pb-1 text-right font-semibold">
            {prazo}
          </th>
        </tr>
      </thead>
      <tbody>
        {H.garantias.map((g) => (
          <tr key={g.se} className="block rounded-[4px] border border-(--color-borda) bg-(--color-papel) md:table-row md:border-0">
            <th
              scope="row"
              className="block px-3 pt-3 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold md:table-cell md:rounded-l-[4px] md:border md:border-r-0 md:border-(--color-borda) md:py-3.5"
            >
              {g.se}
            </th>
            <td className="block px-3 pb-1 pt-1 md:table-cell md:border-y md:border-(--color-borda) md:py-3.5">{g.recebe}</td>
            <td className="block px-3 pb-3 text-small text-(--color-tinta-suave) md:table-cell md:rounded-r-[4px] md:border md:border-l-0 md:border-(--color-borda) md:py-3.5 md:text-right md:text-(--color-tinta)">
              <span className="font-[family-name:var(--font-semi)] font-semibold">{g.prazo}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** O título branco sobre foto (com a sombra que o separa do céu e da água). */
export const TITULO_NA_FOTO = 'titulo text-white [text-shadow:0_1px_14px_rgb(0_0_0/0.35)]';

interface Fundo {
  src: string;
  alt: string;
  /** O ponto da foto que fica sempre à vista (object-position); posicaoMd, a partir de 768 px, se mudar. */
  posicao?: string;
  posicaoMd?: string;
  /** Escurece de leve o lado do texto, para o título branco ficar legível sem apagar a foto. */
  veu?: 'cima' | 'baixo';
  /**
   * A largura em que a foto aparece, para o navegador baixar o tamanho certo. Padrão: a da tela. Foto deitada numa
   * faixa alta do celular aparece bem mais larga que a tela (ver Opinioes.tsx).
   */
  sizes?: string;
}

/**
 * A foto real de fundo de uma faixa, de borda a borda, que só baixa quando chega perto (.adiar). Até ela chegar (ou
 * se não chegar), a faixa fica no azul do mar fundo, e não no cinza claro: o título branco já se lê desde o
 * primeiro instante, e o texto alternativo da foto quebrada não aparece escrito no canto (fica transparente; o
 * leitor de tela continua lendo).
 */
export function FotoDeFundo({ src, alt, posicao = '50% 50%', posicaoMd, veu, sizes = '100vw' }: Fundo) {
  return (
    <div className="adiar absolute inset-0 -z-10 bg-(--color-mar)">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={70}
        className="object-cover object-(--pos) text-transparent md:object-(--pos-md)"
        style={{ '--pos': posicao, '--pos-md': posicaoMd ?? posicao } as CSSProperties}
      />
      {veu && <div className={`absolute inset-0 ${veu === 'cima' ? 'veu-cima' : 'veu-baixo'}`} aria-hidden="true" />}
    </div>
  );
}

/** Uma foto real de fundo, de borda a borda, com o conteúdo por cima em vidro (o vidro só aparece sobre foto). */
export function FaixaFoto({
  src,
  alt,
  posicao,
  posicaoMd,
  veu,
  sizes,
  children,
  ...props
}: Fundo & { children: ReactNode } & ComponentProps<'section'>) {
  return (
    <section className="relative isolate overflow-hidden py-14 md:py-24" {...props}>
      <FotoDeFundo src={src} alt={alt} posicao={posicao} posicaoMd={posicaoMd} veu={veu} sizes={sizes} />
      <div className="moldura">{children}</div>
    </section>
  );
}

/** Um ícone de traço (24 px, traço 1,75), no peso dos outros do site. */
function Icone({ caminho, className = '' }: { caminho: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={caminho} />
    </svg>
  );
}

const SETA = 'M5 12h14M13 6l6 6-6 6';
const CHEVRON = 'm6 9 6 6 6-6';

/** O ícone de cada garantia, na ordem de home.garantiasCurtas: chuva, cancelamento, voucher e pagamento. */
const ICONES_GARANTIAS = [ICONES.chuva, ICONES.cancelar, ICONES.voucher, ICONES.cartao];

/** O ícone de cada fato da faixa de confiança, na ordem de home.faqFatos: a base, os idiomas e o pagamento. */
const ICONES_FATOS = [
  'M12 21s-6.5-5.8-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21ZM12 12.3a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  'M4 5h16v11H9l-5 4V5ZM8 9h8M8 12h5',
  ICONES.cartao,
];

/**
 * Regras e avisos na inicial (Etapa 8, proposta B): só as 4 garantias curtas, cada uma com o seu ícone, numa faixa
 * clara entre as duas fotos (Como funciona e as opiniões), e o caminho para a política completa. A tabela inteira
 * fica na página da política; o que vale no dia do passeio, na página de cada passeio e no voucher em PDF. As
 * garantias do voucher na hora e do pagamento seguro só entram com o pagamento online no ar (promessas-online.ts).
 */
export function Garantias({ d, hrefPolitica }: { d: Dicionario; hrefPolitica: string }) {
  const H = d.home;
  const itens = H.garantiasCurtas.map((g, i) => ({
    titulo: fmt(g.titulo, { p: DESCONTO_PIX_PORCENTO }),
    texto: fmt(g.texto, { p: DESCONTO_PIX_PORCENTO }),
    icone: ICONES_GARANTIAS[i],
  }));
  return (
    <section className="tom-papel py-12 md:py-16" aria-labelledby="garantias-titulo">
      <div className="moldura">
        <h2 id="garantias-titulo" className="subtitulo">
          {H.garantiasTitulo}
        </h2>
        <ul className="entrar mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {itens.map((g) => (
            <li key={g.titulo} className="flex gap-3.5">
              <Icone caminho={g.icone} className="mt-0.5 size-6 text-(--color-turquesa-texto)" />
              <p>
                <strong className="block font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold leading-snug">
                  {g.titulo}
                </strong>
                <span className="mt-0.5 block text-small text-(--color-tinta-suave)">{g.texto}</span>
              </p>
            </li>
          ))}
        </ul>
        <Link href={hrefPolitica} className="link mt-5 inline-flex min-h-11 items-center gap-1.5 font-semibold">
          {H.garantiasLink}
          <Icone caminho={SETA} className="size-4" />
        </Link>
      </div>
    </section>
  );
}

/**
 * Como funciona: os passos, uma linha cada, em vidro escuro sobre a orla de Cabo Frio ao entardecer. O véu de cima
 * segura o título branco no céu lilás do computador (sem ele, 2:1 de contraste). No celular, a foto sobe: aparecem o
 * coqueiro e o céu, e a lixeira laranja do pé da foto sai do quadro.
 */
export function ComoFunciona({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const H = d.home;
  const foto = '/fotos/cabo-frio/orla-entardecer.jpg';
  return (
    <FaixaFoto src={foto} alt={altDaFoto(foto, idioma)} posicao="50% 20%" posicaoMd="50% 60%" veu="cima" aria-labelledby="como-titulo">
      <h2 id="como-titulo" className={TITULO_NA_FOTO}>
        {H.comoTitulo}
      </h2>
      <ol className="entrar mt-6 grid gap-2.5 md:mt-8 md:grid-cols-3 md:gap-4">
        {H.etapas.map((e, i) => (
          <li key={e} className="vidro vidro-escuro flex items-center gap-4 rounded-vidro px-5 py-4 md:block md:p-6">
            <span
              className="numeros w-5 shrink-0 font-[family-name:var(--font-semi)] text-[2rem] font-semibold leading-none"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <strong className="block font-[family-name:var(--font-semi)] text-lead font-semibold md:mt-3">{e}</strong>
          </li>
        ))}
      </ol>
    </FaixaFoto>
  );
}

/** Uma pergunta que abre ao tocar. */
function Pergunta({ p, r }: { p: string; r: string }) {
  return (
    <details className="celula group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold [&::-webkit-details-marker]:hidden">
        {p}
        <Icone caminho={CHEVRON} className="size-5 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="px-4 pb-4 text-(--color-tinta-suave)">{r}</p>
    </details>
  );
}

/**
 * Antes de reservar: o título numa faixa com foto da baía de Búzios, a faixa curta de confiança (base, idiomas e
 * pagamento), as 5 perguntas principais (src/data/perguntas.ts) e o "Ver todas", que abre as outras aqui mesmo.
 * Os dados para o Google (FAQPage, na página inicial) continuam com todas as perguntas.
 */
export function Perguntas({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const H = d.home;
  const { principais, outras } = dividirPerguntas(d.faq);
  const foto = '/fotos/buzios/escuna-ancorada.jpg';
  return (
    // a faixa de chão claro em cima separa esta foto da foto das opiniões, logo acima (sem ela, o mar de uma
    // encostava no morro da outra, com cara de montagem)
    <section className="pt-6 md:pt-8" aria-labelledby="faq-titulo">
      <div className="relative isolate overflow-hidden">
        {/* nos dois tamanhos, a escuna e o morro em cima e o título na água, logo abaixo da escuna (com o céu e os
            mastros atrás, o título ficava sobre "postes no céu" no celular; com a escuna atrás das letras, o branco
            perdia contraste) */}
        <FotoDeFundo src={foto} alt={altDaFoto(foto, idioma)} posicao="50% 75%" posicaoMd="50% 70%" veu="baixo" />
        <div className="moldura pb-8 pt-24 md:pb-12 md:pt-52">
          <h2 id="faq-titulo" className={TITULO_NA_FOTO}>
            {H.faqTitulo}
          </h2>
        </div>
      </div>
      <div className="tom-papel border-b border-(--color-borda)">
        <ul className="moldura flex flex-wrap gap-x-7 gap-y-2.5 py-4 text-small font-semibold">
          {H.faqFatos.map((f, i) => (
            <li key={f} className="flex items-center gap-2">
              <Icone caminho={ICONES_FATOS[i]} className="size-5 text-(--color-turquesa-texto)" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="tom-superficie py-10 md:py-16">
        <div className="moldura grid gap-8 md:grid-cols-12 md:gap-x-8">
          <div className="md:col-span-8">
            <div className="grid gap-(--vao-celula)">
              {principais.map((f) => (
                <Pergunta key={f.p} p={f.p} r={f.r} />
              ))}
            </div>
            {outras.length > 0 && (
              <details className="group/todas">
                {/* o link fica no lugar ao abrir (o foco do teclado e do leitor de tela não se perde): "Ver todas" vira
                    "Ver menos", e as outras perguntas entram logo abaixo dele */}
                <summary className="link mt-3 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="group-open/todas:hidden">{H.faqTodas}</span>
                  <span className="hidden group-open/todas:inline">{H.faqMenos}</span>
                  <Icone caminho={CHEVRON} className="size-5 transition-transform duration-200 group-open/todas:rotate-180" />
                </summary>
                <div className="mt-(--vao-celula) grid gap-(--vao-celula)">
                  {outras.map((f) => (
                    <Pergunta key={f.p} p={f.p} r={f.r} />
                  ))}
                </div>
              </details>
            )}
          </div>
          <div className="flex flex-col gap-3 md:col-span-4">
            <a href="#passeios" className="botao">
              {H.faqBotao}
            </a>
            <a
              href={linkEmail(d.contato.assunto, d.contato.msg)}
              className="link inline-flex min-h-11 items-center font-semibold"
              data-evento="Contact"
            >
              {H.faqLink}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

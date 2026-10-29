import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BilhetePasseio } from '@/components/BilhetePasseio';
import { DesenhoChuva, DesenhoConversa, DesenhoEscolha, DesenhoPagamento, DesenhoVoucher } from '@/components/Desenhos';
import { ExploradorPasseios } from '@/components/ExploradorPasseios';
import { IconeWhatsApp } from '@/components/IconeWhatsApp';
import { Ilustracao, IlustracaoHero } from '@/components/Ilustracao';
import { EMPRESA } from '@/config/empresa';
import { PACOTES } from '@/data/pacotes';
import { CATEGORIAS, CIDADES, passeiosAtivos, type Categoria, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { fmt, isIdioma, rota } from '@/i18n/config';
import { alternates } from '@/lib/site';
import { linkWhatsApp } from '@/lib/whatsapp';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    title: { absolute: d.meta.titulo },
    description: d.meta.descricao,
    alternates: alternates(locale, '/'),
    openGraph: { title: d.meta.titulo, description: d.meta.descricao, url: rota(locale, '/') },
  };
}

const CORES_FOLHAS = [
  { fundo: 'bg-turquesa', texto: 'text-tinta' },
  { fundo: 'bg-sol', texto: 'text-tinta' },
  { fundo: 'bg-coral', texto: 'text-tinta' },
  { fundo: 'bg-oceano', texto: 'text-white' },
];
const DESENHOS_FOLHAS = [DesenhoConversa, DesenhoPagamento, DesenhoVoucher, DesenhoChuva];
const DESENHOS_PASSOS = [DesenhoEscolha, DesenhoPagamento, DesenhoVoucher];
const RESPIRO_PASSOS = ['md:pt-10', 'md:pt-28', 'md:pt-16'];

export default async function Inicio({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const passeios = passeiosAtivos();

  const cidadesFiltro = (Object.keys(CIDADES) as Cidade[]).map((c) => ({ valor: c, rotulo: CIDADES[c].nome[locale] }));
  const categoriasFiltro = (Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({ valor: c, rotulo: CATEGORIAS[c].nome[locale] }));

  return (
    <>
      {/* ---------------- HERO: cartão-postal ---------------- */}
      <section className="moldura grid gap-3 pt-3 md:min-h-[calc(100svh-96px)] md:grid-cols-2">
        <div className="relative h-[48svh] min-h-[300px] overflow-hidden md:order-2 md:h-auto">
          <IlustracaoHero titulo={`${d.home.heroScript} ${d.home.heroTitulo}`} className="absolute inset-0 size-full" />
        </div>
        <div className="relative z-10 -mt-9 flex flex-col bg-areia-clara md:order-1 md:mt-0">
          <div className="faixa-guarda-sol h-10 md:h-14" aria-hidden="true" />
          <div className="flex flex-1 flex-col justify-center px-6 pb-10 pt-8 md:px-12 md:py-14 lg:px-16">
            <h1 className="leading-none">
              <span className="script block text-[clamp(3rem,2rem+4vw,5.5rem)] leading-[0.9] text-coral-forte">{d.home.heroScript}</span>
              <span className="titulo-display mt-2 block text-mega">{d.home.heroTitulo}</span>
            </h1>
            <p className="mt-8 max-w-[38ch] text-lead">{d.home.heroTexto}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href={rota(locale, '/passeios')} className="botao botao-coral">
                {d.comum.verPasseios}
              </Link>
              <a
                href={linkWhatsApp(d.contato.msg)}
                target="_blank"
                rel="noopener noreferrer"
                className="botao botao-tinta"
                data-evento="Contact"
              >
                <IconeWhatsApp className="size-5" />
                {d.comum.whatsapp}
              </a>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-2 font-semibold">
              {(['buzios', 'cabo-frio', 'arraial-do-cabo'] as Cidade[]).map((c) => (
                <li key={c}>
                  <Link
                    href={`${rota(locale, '/passeios')}?cidade=${c}`}
                    className="underline decoration-turquesa decoration-[3px] underline-offset-[6px] hover:decoration-coral"
                  >
                    {CIDADES[c].nome[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------- DESTAQUES + FILTROS ---------------- */}
      <section className="moldura pt-24 md:pt-40" aria-labelledby="destaques">
        <div className="entrar grid gap-6 md:grid-cols-12">
          <h2 id="destaques" className="titulo-display text-head md:col-span-7">
            {d.home.destaqueTitulo}
          </h2>
          <p className="max-w-[44ch] self-end text-lead md:col-span-5">{d.home.destaqueTexto}</p>
        </div>
        <div className="mt-10">
          <ExploradorPasseios
            somenteDestaquesSemFiltro
            itens={passeios.map((p) => ({
              slug: p.slug,
              cidade: p.cidade,
              categoria: p.categoria,
              destaque: Boolean(p.destaque),
              card: <BilhetePasseio passeio={p} idioma={locale} d={d} />,
            }))}
            cidades={cidadesFiltro}
            categorias={categoriasFiltro}
            linkTodos={rota(locale, '/passeios')}
            textos={{
              cidade: d.comum.cidade,
              tipo: d.comum.tipo,
              todas: d.comum.todas,
              todos: d.comum.todos,
              nenhum: d.passeios.nenhum,
              limpar: d.passeios.limpar,
              resultado: d.passeios.resultado,
              resultados: d.passeios.resultados,
              verTodos: fmt(d.home.verTodos, { n: passeios.length }),
            }}
          />
        </div>
      </section>

      {/* ---------------- POR QUE RESERVAR: folhas que se empilham ---------------- */}
      <section className="pt-24 md:pt-40" aria-labelledby="porque">
        <div className="moldura">
          <h2 id="porque" className="titulo-display mb-10 text-head md:mb-12">
            {d.home.porqueTitulo}
          </h2>
        </div>
        <div className="moldura">
          {d.home.porque.map((item, i) => {
            const Desenho = DESENHOS_FOLHAS[i];
            const cor = CORES_FOLHAS[i];
            return (
              <article
                key={item.titulo}
                className={`${cor.fundo} ${cor.texto} grid gap-6 px-6 pb-8 pt-6 md:sticky md:min-h-[62svh] md:grid-cols-12 md:gap-10 md:px-12 md:pb-12 md:pt-7`}
                style={{ top: `calc(1rem + ${i * 4.5}rem)` }}
              >
                <div className="flex flex-col justify-between gap-6 md:col-span-6">
                  <h3 className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] font-bold leading-[1.05]">{item.titulo}</h3>
                  <p className="max-w-[40ch] text-[1.125rem] md:text-[1.25rem]">{item.texto}</p>
                </div>
                <div className="flex items-center justify-center md:col-span-6">
                  <Desenho className="h-auto w-full max-w-[420px]" />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ---------------- COMO FUNCIONA ---------------- */}
      <section className="moldura pt-24 md:pt-40" aria-labelledby="como">
        <h2 id="como" className="titulo-display text-head">
          {d.home.comoTitulo}
        </h2>
        <ol className="sem-barra -mx-[var(--margem)] mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--margem)] pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-8 md:overflow-visible md:px-0">
          {d.home.como.map((passo, i) => {
            const Desenho = DESENHOS_PASSOS[i];
            return (
              <li key={passo.titulo} className={`entrar w-[80vw] shrink-0 snap-start md:w-auto ${RESPIRO_PASSOS[i]}`}>
                <h3 className="text-lead font-bold">{passo.titulo}</h3>
                <p className="mt-2 max-w-[34ch]">{passo.texto}</p>
                <div className={`mt-6 ${['bg-turquesa-clara', 'bg-sol-claro', 'bg-coral-claro'][i]} p-6`}>
                  <Desenho className="h-auto w-full" />
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ---------------- PASSEIO + HOSPEDAGEM ---------------- */}
      <section className="pt-24 md:pt-40" aria-labelledby="hospedagem">
        <div className="moldura">
          <div className="grid bg-turquesa-clara md:grid-cols-2">
            <div className="p-4 md:p-10">
              <div className="relative aspect-square w-full overflow-hidden">
                <Ilustracao cena="cidade" cidade="buzios" titulo={d.home.hospedagemTitulo} className="absolute inset-0 size-full" />
              </div>
            </div>
            <div className="flex flex-col justify-between gap-10 px-6 pb-8 pt-4 md:px-10 md:py-12">
              <div>
                <h2 id="hospedagem" className="titulo-display text-head">
                  {d.home.hospedagemTitulo}
                </h2>
                <p className="mt-6 max-w-[42ch] text-[1.125rem]">{d.home.hospedagemTexto}</p>
                <ul className="mt-8 space-y-3">
                  {PACOTES.map((p) => (
                    <li key={p.slug} className="flex flex-wrap items-baseline justify-between gap-x-4 bg-white px-5 py-3">
                      <span className="font-bold">{p.nome[locale]}</span>
                      <span className="text-small">{p.noites[locale]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <a
                  href={linkWhatsApp(d.home.hospedagemMsg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao botao-whats"
                  data-evento="Contact"
                >
                  <IconeWhatsApp className="size-5" />
                  {d.home.hospedagemPedir}
                </a>
                <Link href={rota(locale, '/passeio-e-hospedagem')} className="botao botao-tinta">
                  {d.home.hospedagemVer}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- PERGUNTAS FREQUENTES ---------------- */}
      <section className="moldura pt-24 md:pt-40" aria-labelledby="faq">
        <div className="grid gap-8 md:grid-cols-12">
          <h2 id="faq" className="titulo-display text-head md:col-span-4">
            {d.home.faqTitulo}
          </h2>
          <div className="md:col-span-8 md:columns-2 md:gap-14">
            {d.faq.map((f) => (
              <p key={f.p} className="mb-5 break-inside-avoid">
                <strong className="font-bold">{f.p}</strong> {f.r}
              </p>
            ))}
          </div>
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: d.faq.map((f) => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } })),
            }),
          }}
        />
      </section>

      {/* ---------------- INSTAGRAM: o cartão-resposta ---------------- */}
      <section className="mt-24 overflow-hidden bg-oceano md:mt-40" aria-labelledby="instagram">
        <div className="moldura grid gap-10 pt-16 md:grid-cols-12 md:pt-24">
          <p className="max-w-[26ch] self-end pb-4 text-[1.375rem] leading-snug text-white md:col-span-4 md:pb-24 md:text-[1.5rem]">
            {d.home.instaLado}
          </p>
          <div className="mx-auto -mb-12 w-[92%] -rotate-1 bg-papel px-6 pb-24 pt-10 text-center md:col-span-7 md:col-start-6 md:-mb-16 md:w-full md:rotate-2 md:px-14 md:pb-32 md:pt-14">
            <h2 id="instagram" className="text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] font-bold leading-tight">
              {d.home.instaTitulo}
            </h2>
            <p className="script mt-3 text-[2.25rem] leading-none text-coral-forte md:text-[2.75rem]">{EMPRESA.instagramUsuario}</p>
            <p className="mx-auto mt-5 max-w-[36ch]">{d.home.instaTexto}</p>
            <a
              href={EMPRESA.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex min-h-14 w-full items-center justify-center bg-tinta px-6 font-bold text-white transition-colors hover:bg-oceano-medio"
            >
              {d.home.instaBotao}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

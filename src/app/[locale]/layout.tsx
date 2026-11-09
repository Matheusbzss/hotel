import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed, Barlow_Semi_Condensed } from 'next/font/google';
import { notFound } from 'next/navigation';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { Cabecalho } from '@/components/Cabecalho';
import { BarraCarrinho } from '@/components/carrinho/BarraCarrinho';
import { CarrinhoProvider } from '@/components/carrinho/CarrinhoContexto';
import { GavetaCarrinho } from '@/components/carrinho/GavetaCarrinho';
import { GrupoProvider } from '@/components/grupo/GrupoContexto';
import { Rastreamento } from '@/components/Rastreamento';
import { Revelar } from '@/components/Revelar';
import { Rodape } from '@/components/Rodape';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { HREFLANG, IDIOMAS, LOCALE_INTL, OG_LOCALE, isIdioma, rota } from '@/i18n/config';
import { cambioParaTela } from '@/lib/cambio-tela';
import { urlDoSite } from '@/lib/site';
import '../globals.css';

/**
 * Barlow em três larguras, como um sistema de placas (design-dna.json > typography):
 * Regular no texto, Semi Condensed nos títulos e números, Condensed no gancho.
 * Servida pelo próprio site: o navegador do cliente não chama o Google. Só o alfabeto latino e os pesos em uso:
 * cada arquivo a mais disputa a conexão do celular com a primeira foto. Português, os dois espanhóis e inglês cabem no "latin".
 */
const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-barlow', display: 'swap' });
const barlowSemi = Barlow_Semi_Condensed({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-barlow-semi', display: 'swap' });
const barlowCond = Barlow_Condensed({ subsets: ['latin'], weight: ['600'], variable: '--font-barlow-cond', display: 'swap' });

// sem "dynamicParams = false" aqui: ele valeria para todas as páginas de baixo, e a casa cadastrada no painel
// não abriria até o próximo deploy. Idioma que não existe nem chega aqui: o proxy manda para o 404.
export function generateStaticParams() {
  return IDIOMAS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    metadataBase: new URL(urlDoSite()),
    title: { default: d.meta.titulo, template: `%s | ${EMPRESA.marca}` },
    description: d.meta.descricao,
    applicationName: EMPRESA.marca,
    openGraph: {
      siteName: EMPRESA.marca,
      locale: OG_LOCALE[locale],
      type: 'website',
    },
    twitter: { card: 'summary_large_image' },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#063643',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function LayoutIdioma({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  // o aproximado em dólar do total da gaveta do carrinho, só em espanhol e inglês
  const cambio = await cambioParaTela(locale);
  const textosCarrinho = {
    ...d.carrinho,
    noPix: d.preco.noPix,
    noCartao: d.preco.noCartao,
    dolar: d.preco.dolar,
    dataPasseio: d.passeio.data,
    escolhaData: d.grupo.escolhaData,
    opcao: d.checkout.opcao,
    aPartirDe: d.comum.aPartirDe,
  };

  const organizacao = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: EMPRESA.marca,
    url: urlDoSite(),
    description: d.meta.descricao,
    email: EMPRESA.email,
    logo: `${urlDoSite()}/logo/orla-nativa-emblema-512.png`,
    image: `${urlDoSite()}/fotos/buzios/escuna-no-mar.jpg`,
    address: { '@type': 'PostalAddress', addressLocality: EMPRESA.cidade, addressRegion: EMPRESA.uf, addressCountry: 'BR' },
    areaServed: ['Armação dos Búzios', 'Cabo Frio', 'Arraial do Cabo', 'Rio de Janeiro'],
    // html lang e OG locale saem das tabelas de src/i18n/config.ts: 'es' é o espanhol neutro, 'es-AR' o da Argentina
    knowsLanguage: ['pt-BR', 'en', 'es', 'es-AR'],
    ...(EMPRESA.perfis.length ? { sameAs: EMPRESA.perfis } : {}),
  };

  return (
    <html lang={HREFLANG[locale]} className={`${barlow.variable} ${barlowSemi.variable} ${barlowCond.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#conteudo"
          className="sr-only z-50 rounded-[4px] bg-(--color-acao) px-5 py-3 font-semibold text-(--color-tinta) focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {d.nav.pularConteudo}
        </a>
        <CarrinhoProvider idioma={locale}>
          <Cabecalho idioma={locale} d={d} />
          <GrupoProvider>{children}</GrupoProvider>
          <Rodape idioma={locale} d={d} />
          <GavetaCarrinho
            locale={LOCALE_INTL[locale]}
            hrefFinalizar={rota(locale, '/checkout')}
            hrefPasseios={rota(locale, '/passeios')}
            dolar={cambio.taxa}
            notaCambio={cambio.nota}
            textos={textosCarrinho}
          />
          <BarraCarrinho locale={LOCALE_INTL[locale]} hrefFinalizar={rota(locale, '/checkout')} textos={textosCarrinho} />
        </CarrinhoProvider>
        <Revelar />
        <Rastreamento
          pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID}
          googleId={process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}
          textos={d.cookies}
          linkPrivacidade={rota(locale, '/politica-de-privacidade')}
        />
        <DadosEstruturados dados={organizacao} />
      </body>
    </html>
  );
}

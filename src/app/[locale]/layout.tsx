import type { Metadata, Viewport } from 'next';
import { TikTok_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Cabecalho } from '@/components/Cabecalho';
import { GrupoProvider } from '@/components/grupo/GrupoContexto';
import { Rastreamento } from '@/components/Rastreamento';
import { Revelar } from '@/components/Revelar';
import { Rodape } from '@/components/Rodape';
import { WhatsAppFlutuante } from '@/components/WhatsAppFlutuante';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { HREFLANG, IDIOMAS, OG_LOCALE, isIdioma, rota } from '@/i18n/config';
import { urlDoSite } from '@/lib/site';
import '../globals.css';

/** Uma família só: larga e pesada nos títulos, largura normal no texto. */
const tiktok = TikTok_Sans({ subsets: ['latin', 'latin-ext'], axes: ['wdth', 'opsz'], variable: '--font-tiktok', display: 'swap' });

export const dynamicParams = false;

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
  themeColor: '#082f3f',
  width: 'device-width',
  initialScale: 1,
};

export default async function LayoutIdioma({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);

  const organizacao = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: EMPRESA.marca,
    legalName: EMPRESA.razaoSocial,
    taxID: EMPRESA.cnpj,
    url: urlDoSite(),
    email: EMPRESA.email,
    telephone: EMPRESA.telefoneExibicao,
    logo: `${urlDoSite()}/logo/agencia-victor-hugo-emblema-512.png`,
    sameAs: [EMPRESA.instagramUrl],
    address: { '@type': 'PostalAddress', addressLocality: EMPRESA.cidade, addressRegion: EMPRESA.uf, addressCountry: 'BR' },
    areaServed: ['Armação dos Búzios', 'Cabo Frio', 'Arraial do Cabo'],
    availableLanguage: ['pt-BR', 'en', 'es'],
  };

  return (
    <html lang={HREFLANG[locale]} className={tiktok.variable}>
      <body className="min-h-dvh">
        <a
          href="#conteudo"
          className="sr-only z-50 bg-sol px-4 py-3 font-semibold text-mar focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {d.nav.pularConteudo}
        </a>
        <Cabecalho idioma={locale} d={d} />
        <GrupoProvider>{children}</GrupoProvider>
        <Rodape idioma={locale} d={d} />
        <WhatsAppFlutuante rotulo={d.comum.whatsapp} mensagem={d.contato.msg} />
        <Revelar />
        <Rastreamento
          pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID}
          textos={d.cookies}
          linkPrivacidade={rota(locale, '/politica-de-privacidade')}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizacao) }} />
      </body>
    </html>
  );
}

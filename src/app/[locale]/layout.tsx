import type { Metadata, Viewport } from 'next';
import { Albert_Sans, Imbue, Yellowtail } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Cabecalho } from '@/components/Cabecalho';
import { Rastreamento } from '@/components/Rastreamento';
import { Rodape } from '@/components/Rodape';
import { WhatsAppFlutuante } from '@/components/WhatsAppFlutuante';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { HREFLANG, IDIOMAS, OG_LOCALE, isIdioma, rota } from '@/i18n/config';
import { urlDoSite } from '@/lib/site';
import '../globals.css';

const imbue = Imbue({ subsets: ['latin', 'latin-ext'], axes: ['opsz'], variable: '--font-imbue', display: 'swap' });
const yellowtail = Yellowtail({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--font-yellowtail', display: 'swap' });
const albert = Albert_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-albert', display: 'swap' });

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
  themeColor: '#FF7A66',
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
    <html lang={HREFLANG[locale]} className={`${imbue.variable} ${yellowtail.variable} ${albert.variable}`}>
      <body className="min-h-dvh">
        <a href="#conteudo" className="sr-only z-50 bg-sol px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          {d.nav.pularConteudo}
        </a>
        <Cabecalho idioma={locale} d={d} />
        <main id="conteudo">{children}</main>
        <Rodape idioma={locale} d={d} />
        <WhatsAppFlutuante rotulo={d.comum.whatsapp} mensagem={d.contato.msg} />
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

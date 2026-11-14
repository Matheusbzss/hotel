import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaginaLegal } from '@/components/PaginaLegal';
import { RedefinirCookies } from '@/components/RedefinirCookies';
import { textosLegais } from '@/content/legal/online';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { emailLigado } from '@/lib/email/enviar';
import { pagamentoOnlineNoAr } from '@/lib/formas-pagamento';
import { alternates, openGraphDaPagina } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/politica-de-privacidade'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const doc = texto(textosLegais(pagamentoOnlineNoAr(), emailLigado()).privacidade, locale);
  return {
    title: doc.titulo,
    description: doc.descricao,
    alternates: alternates(locale, '/politica-de-privacidade'),
    openGraph: openGraphDaPagina(locale, { title: doc.titulo, description: doc.descricao, url: rota(locale, '/politica-de-privacidade') }),
  };
}

export default async function Pagina({ params }: PageProps<'/[locale]/politica-de-privacidade'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  // com o pagamento online no ar para o público, a versão dele (src/content/legal/online.ts); sem ele e com os e-mails
  // ligados (RESEND_API_KEY), a de hoje com a privacidade dos e-mails; senão, a de hoje
  const legais = textosLegais(pagamentoOnlineNoAr(), emailLigado());
  return (
    <PaginaLegal
      doc={texto(legais.privacidade, locale)}
      atualizadoEm={legais.atualizadoEm.privacidade}
      idioma={locale}
      d={d}
      caminho="/politica-de-privacidade"
      titulo={d.rodape.privacidade}
      acao={d.legal.acoes.privacidade}
      extra={<RedefinirCookies rotulo={d.cookies.gerenciar} />}
    />
  );
}

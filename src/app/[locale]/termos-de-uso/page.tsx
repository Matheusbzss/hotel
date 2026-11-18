import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaginaLegal } from '@/components/PaginaLegal';

import { textosLegais } from '@/content/legal/online';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { emailLigado } from '@/lib/email/enviar';
import { pagamentoOnlineNoAr } from '@/lib/formas-pagamento';
import { alternates, openGraphDaPagina } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/termos-de-uso'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const doc = texto(textosLegais(pagamentoOnlineNoAr(), emailLigado()).termos, locale);
  return {
    title: doc.titulo,
    description: doc.descricao,
    alternates: alternates(locale, '/termos-de-uso'),
    openGraph: openGraphDaPagina(locale, { title: doc.titulo, description: doc.descricao, url: rota(locale, '/termos-de-uso') }),
  };
}

export default async function Pagina({ params }: PageProps<'/[locale]/termos-de-uso'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  // com o pagamento online no ar para o público, a versão dele (src/content/legal/online.ts); sem ele e com os e-mails
  // ligados (RESEND_API_KEY), a de hoje com a privacidade dos e-mails; senão, a de hoje
  const legais = textosLegais(pagamentoOnlineNoAr(), emailLigado());
  return (
    <PaginaLegal
      doc={texto(legais.termos, locale)}
      atualizadoEm={legais.atualizadoEm.termos}
      idioma={locale}
      d={d}
      caminho="/termos-de-uso"
      titulo={d.rodape.termos}
      acao={d.legal.acoes.termos}
    />
  );
}

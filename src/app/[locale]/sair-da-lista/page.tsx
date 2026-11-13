import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EMPRESA } from '@/config/empresa';
import { fmt, isIdioma, rota } from '@/i18n/config';
import { textosConsulta } from '@/lib/consulta-textos';

export async function generateMetadata({ params }: PageProps<'/[locale]/sair-da-lista'>): Promise<Metadata> {
  const { locale } = await params;
  return { ...(isIdioma(locale) ? { title: textosConsulta(locale).sairSemLinkTitulo } : {}), robots: { index: false, follow: false } };
}

/**
 * A volta do link "sair da lista" dos lembretes do carrinho (/api/email/sair, que já tirou o e-mail da lista e manda
 * para cá com ?pronto=1, ou ?erro=1 quando o link não valia). O link assinado nunca chega a esta página.
 */
export default async function SairDaLista({ params, searchParams }: PageProps<'/[locale]/sair-da-lista'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const T = textosConsulta(locale);
  const q = await searchParams;
  const [titulo, texto] =
    q.pronto === '1'
      ? [T.sairTitulo, T.sairTexto]
      : q.erro === '1'
        ? [T.sairErroTitulo, fmt(T.sairErroTexto, { email: EMPRESA.email })]
        : [T.sairSemLinkTitulo, T.sairSemLinkTexto];

  return (
    <main id="conteudo" className="tom-fundo moldura pb-32 pt-16">
      <h1 className="display text-head">{titulo}</h1>
      <p className="mt-4 max-w-[44ch] text-lead">{texto}</p>
      <Link href={rota(locale, '/')} className="botao mt-8 w-full sm:w-auto">
        {T.voltarSite}
      </Link>
    </main>
  );
}

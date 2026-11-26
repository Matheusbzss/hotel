import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TextoComEmail } from '@/components/TextoComEmail';
import { EMPRESA } from '@/config/empresa';
import { isIdioma, rota } from '@/i18n/config';
import { textosConsulta } from '@/lib/consulta-textos';
import { linkEmail } from '@/lib/email';

export async function generateMetadata({ params }: PageProps<'/[locale]/sair-da-lista'>): Promise<Metadata> {
  const { locale } = await params;
  return { ...(isIdioma(locale) ? { title: textosConsulta(locale).sairSemLinkTitulo } : {}), robots: { index: false, follow: false } };
}

/**
 * A página do link "sair da lista" dos lembretes do carrinho. O link do e-mail (/api/email/sair) só confere o link e
 * manda para cá com ?confirmar=1: a pessoa confirma no botão (um POST para a mesma rota, que leva o link guardado num
 * cookie dela) e volta com ?pronto=1. Assim, os filtros de e-mail que abrem os links sozinhos não tiram ninguém da
 * lista. ?erro=1: o link não valia (ou o cookie venceu), e o caminho é escrever para a equipe. O link assinado nunca
 * chega a esta página.
 */
export default async function SairDaLista({ params, searchParams }: PageProps<'/[locale]/sair-da-lista'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const T = textosConsulta(locale);
  const q = await searchParams;
  const estado = q.pronto === '1' ? 'pronto' : q.erro === '1' ? 'erro' : q.confirmar === '1' ? 'confirmar' : 'sem-link';
  const titulo = {
    pronto: T.sairTitulo,
    erro: T.sairErroTitulo,
    confirmar: T.sairConfirmarTitulo,
    'sem-link': T.sairSemLinkTitulo,
  }[estado];
  const voltar = rota(locale, '/');

  return (
    // pagina-curta: no computador, o rodapé fica no pé da tela, sem a faixa do fundo embaixo dele (globals.css)
    <main id="conteudo" className="pagina-curta tom-fundo moldura pb-32 pt-16">
      <h1 className="display text-head">{titulo}</h1>
      <p className="mt-4 max-w-[44ch] text-lead">
        {estado === 'erro' ? (
          <TextoComEmail texto={T.sairErroTexto} email={EMPRESA.email} href={linkEmail(T.sairSemLinkTitulo)} />
        ) : estado === 'pronto' ? (
          T.sairTexto
        ) : estado === 'confirmar' ? (
          T.sairConfirmarTexto
        ) : (
          T.sairSemLinkTexto
        )}
      </p>
      {estado === 'confirmar' ? (
        <form method="post" action="/api/email/sair" className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* só o idioma da página, para o caso de o link guardado não chegar: o link nunca vai no formulário */}
          <input type="hidden" name="idioma" value={locale} />
          <button type="submit" className="botao w-full sm:w-auto">
            {T.sairConfirmarBotao}
          </button>
          <Link href={voltar} className="link inline-flex min-h-11 items-center font-semibold">
            {T.voltarSite}
          </Link>
        </form>
      ) : (
        <Link href={voltar} className="botao mt-8 w-full sm:w-auto">
          {T.voltarSite}
        </Link>
      )}
    </main>
  );
}

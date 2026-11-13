import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FormularioConsulta } from '@/components/FormularioConsulta';
import { TextoComEmail } from '@/components/TextoComEmail';
import { EMPRESA } from '@/config/empresa';
import { isIdioma } from '@/i18n/config';
import { textosConsulta } from '@/lib/consulta-textos';
import { linkEmail } from '@/lib/email';
import { emailLigado } from '@/lib/email/enviar';

// a página não entra no Google: é só o caminho de quem perdeu o link do pedido
export async function generateMetadata({ params }: PageProps<'/[locale]/consultar-pedido'>): Promise<Metadata> {
  const { locale } = await params;
  return { ...(isIdioma(locale) ? { title: textosConsulta(locale).titulo } : {}), robots: { index: false, follow: false } };
}

/**
 * "Consultar meu pedido" (Etapa 6): o e-mail da compra e o código do pedido; se baterem, o link privado vai para o
 * e-mail. A tela nunca mostra o pedido e responde sempre a mesma coisa. Sem o envio de e-mail ligado (RESEND_API_KEY),
 * a página manda escrever para a equipe. O e-mail da equipe é sempre um link de e-mail (um toque no celular).
 */
export default async function ConsultarPedido({ params }: PageProps<'/[locale]/consultar-pedido'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const T = textosConsulta(locale);
  const ligado = emailLigado();
  const mailto = linkEmail(T.semEmailAssunto);

  return (
    // pagina-curta: no computador, o rodapé fica no pé da tela, sem a faixa do fundo embaixo dele (globals.css)
    <main id="conteudo" className="pagina-curta tom-fundo">
      <div className="moldura grid gap-8 pb-24 pt-8 md:pb-32 md:pt-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h1 className="display text-head">{T.titulo}</h1>
          <p className="mt-4 max-w-[44ch] text-lead">
            {ligado ? T.texto : <TextoComEmail texto={T.semEmailTexto} email={EMPRESA.email} href={mailto} />}
          </p>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <div className="tom-papel px-6 pb-8 pt-2 md:px-8">
            {ligado ? (
              <FormularioConsulta idioma={locale} textos={T} emailEmpresa={EMPRESA.email} hrefEmail={mailto} />
            ) : (
              <div className="pt-6">
                <p className="break-all font-semibold">
                  <a href={mailto} className="link">
                    {EMPRESA.email}
                  </a>
                </p>
                <a href={mailto} className="botao mt-6 w-full sm:w-auto" data-evento="Contact">
                  {T.semEmailBotao}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

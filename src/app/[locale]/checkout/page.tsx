import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { FormularioCarrinho } from '@/components/carrinho/FormularioCarrinho';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { cambioParaTela } from '@/lib/cambio-tela';
import { COOKIE_CARRINHO, itensVisiveis, lerCarrinho } from '@/lib/carrinho-servidor';
import { linkEmail } from '@/lib/email';
import { pagamentoDoCheckout } from '@/lib/reserva-publica';

/** A aba mostra o mesmo título da página ("Finalizar reserva | Orla Nativa"); o checkout continua fora do Google. */
export async function generateMetadata({ params }: PageProps<'/[locale]/checkout'>): Promise<Metadata> {
  const { locale } = await params;
  return { ...(isIdioma(locale) ? { title: dicionario(locale).checkout.titulo } : {}), robots: { index: false, follow: false } };
}

/** O checkout único: fecha o carrinho do cliente num pedido só. */
export default async function CheckoutCarrinho({ params }: PageProps<'/[locale]/checkout'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const loja = await cookies();
  const carrinho = await lerCarrinho(loja.get(COOKIE_CARRINHO)?.value).catch(() => ({ itens: [], pedido: undefined }));
  const inicial = itensVisiveis(carrinho.itens, locale, d);
  // cartão e Pix (o interruptor, a Stripe e o prazo) e o pedido em aberto do carrinho, decididos aqui no servidor
  const { pagamentoOnline, pedidoAberto } = await pagamentoDoCheckout(
    locale,
    inicial,
    carrinho.pedido,
    sessaoValida(loja.get(COOKIE_ADMIN)?.value),
  );
  // o aproximado em dólar e a nota da cotação, só em espanhol e inglês
  const cambio = await cambioParaTela(locale);

  return (
    <main id="conteudo" className="tom-fundo">
      <div className="moldura pb-24 pt-4 md:pb-32 md:pt-8">
        <h1 className="display text-head">{d.checkout.titulo}</h1>
        <Link href={rota(locale, '/passeios')} className="link mt-3 inline-flex min-h-11 items-center gap-2 font-semibold">
          <span aria-hidden="true">←</span> {d.carrinho.continuar}
        </Link>
        <div className="mt-10">
          <FormularioCarrinho
            idioma={locale}
            locale={LOCALE_INTL[locale]}
            inicial={inicial}
            dolar={cambio.taxa}
            notaCambio={cambio.nota}
            pagamentoOnline={pagamentoOnline}
            pedidoAberto={pedidoAberto}
            // o e-mail da equipe, montado aqui (o endereço vem dos dados da empresa, que não vão para o navegador inteiros)
            contato={{ href: linkEmail(d.contato.assunto, d.contato.msg), rotulo: d.contato.botao }}
            textos={{
              checkout: d.checkout,
              transfer: d.transfer,
              carrinho: d.carrinho,
              preco: d.preco,
              diminuir: d.comum.diminuir,
              aumentar: d.comum.aumentar,
              dataPasseio: d.passeio.data,
              escolhaData: d.grupo.escolhaData,
              aPartirDe: d.comum.aPartirDe,
              tentarDeNovo: d.reserva.tentarNovamente,
            }}
            links={{
              termos: rota(locale, '/termos-de-uso'),
              politica: rota(locale, '/politica-de-cancelamento'),
              privacidade: rota(locale, '/politica-de-privacidade'),
              reserva: rota(locale, '/reserva'),
              pedido: rota(locale, '/pedido'),
              passeios: rota(locale, '/passeios'),
            }}
          />
        </div>
      </div>
    </main>
  );
}

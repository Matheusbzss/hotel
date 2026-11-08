import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { FormularioCarrinho } from '@/components/carrinho/FormularioCarrinho';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { cambioParaTela } from '@/lib/cambio-tela';
import { COOKIE_CARRINHO, itensVisiveis, lerCarrinho } from '@/lib/carrinho-servidor';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** O checkout único: fecha o carrinho do cliente num pedido só. */
export default async function CheckoutCarrinho({ params }: PageProps<'/[locale]/checkout'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const { itens } = await lerCarrinho((await cookies()).get(COOKIE_CARRINHO)?.value).catch(() => ({ itens: [] }));
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
            inicial={itensVisiveis(itens, locale, d)}
            dolar={cambio.taxa}
            notaCambio={cambio.nota}
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
            }}
            links={{
              termos: rota(locale, '/termos-de-uso'),
              politica: rota(locale, '/politica-de-cancelamento'),
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

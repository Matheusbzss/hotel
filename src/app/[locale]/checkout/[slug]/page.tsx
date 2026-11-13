import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { obterPasseio } from '@/data/passeios';
import { isIdioma, rota } from '@/i18n/config';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * O checkout de um passeio só (o caminho antigo da Pagar.me) não existe mais: tudo passa pelo carrinho e pelo
 * checkout único. Quem chega por um link antigo (/checkout/escuna-buzios) vai para o cartão de reserva do
 * passeio, que põe no carrinho e segue para /checkout; sem passeio no endereço, para o próprio checkout.
 * Este redirecionamento fica: os links antigos já circulam (e-mails, WhatsApp, anúncios) e não podem dar em
 * página não encontrada.
 */
export default async function CheckoutDeUmPasseio({ params }: PageProps<'/[locale]/checkout/[slug]'>) {
  const { locale, slug } = await params;
  if (!isIdioma(locale)) notFound();
  redirect(obterPasseio(slug) ? `${rota(locale, `/passeios/${slug}`)}#reservar` : rota(locale, '/checkout'));
}

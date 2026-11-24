import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { conferirNaStripe } from '@/app/api/pedido/pedido-stripe';
import { FormularioCarrinho } from '@/components/carrinho/FormularioCarrinho';
import { PedidoPago } from '@/components/carrinho/PedidoPago';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { cambioParaTela } from '@/lib/cambio-tela';
import { COOKIE_CARRINHO, itensVisiveis, lerCarrinho, type CarrinhoGuardado } from '@/lib/carrinho-servidor';
import { linkEmail } from '@/lib/email';
import { emailLigado } from '@/lib/email/enviar';
import { ipDaRequisicao } from '@/lib/limite-ip';
import { pagamentoDoCheckout } from '@/lib/reserva-publica';
import { obterReservaDoPedido } from '@/lib/reservas';
import { whatsappDoRobo } from '@/lib/whatsapp';

/**
 * O mais que o checkout espera pela consulta à Stripe antes de abrir. O cliente da Stripe espera até 20 s por tentativa
 * e tenta 3 vezes (src/lib/stripe.ts): sem o limite, com a Stripe lenta, o checkout levaria perto de 1 minuto para abrir.
 */
const LIMITE_DA_CONSULTA_MS = 3000;

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
  const codigoDoCarrinho = loja.get(COOKIE_CARRINHO)?.value;
  let carrinho: Pick<CarrinhoGuardado, 'itens' | 'pedido'> = await lerCarrinho(codigoDoCarrinho).catch(() => ({ itens: [] }));
  // quem pagou o Pix no app do banco pode voltar antes de o aviso da Stripe chegar: como a página do pedido, o servidor
  // relê a sessão na Stripe (conferirNaStripe: a porta de sempre, uma consulta a cada 10 s por pedido e um teto por IP).
  // Pago, o carrinho relido traz o pedido pago e a página leva a ele. O checkout espera no máximo 3 s: com a Stripe lenta,
  // abre como está (com "continuar o pagamento") e a consulta termina depois da resposta (after). O IP é lido antes:
  // dentro do after, a página não pode ler a requisição
  if (carrinho.pedido?.status === 'pendente') {
    const ip = ipDaRequisicao(await headers());
    const r = await obterReservaDoPedido(carrinho.pedido.codigo).catch(() => null);
    if (r) {
      const consulta = conferirNaStripe(r, { origem: 'pagina', ip }).catch(() => null);
      after(() => consulta);
      const conferida = await Promise.race([consulta, new Promise<null>((ok) => setTimeout(() => ok(null), LIMITE_DA_CONSULTA_MS))]);
      if (conferida && conferida.status !== 'pendente') carrinho = await lerCarrinho(codigoDoCarrinho).catch(() => carrinho);
    }
  }
  const inicial = itensVisiveis(carrinho.itens, locale, d);
  // cartão e Pix (o interruptor, a Stripe e o prazo), se o pagamento online vale para este visitante, o pedido em aberto
  // do carrinho e o pedido pago, decididos aqui no servidor
  const { pagamentoOnline, pagamentoLigado, pedidoAberto, pedidoPago } = await pagamentoDoCheckout(
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
          {pedidoPago ? (
            // o carrinho virou um pedido pago: no lugar do formulário (que nem é montado, então o carrinho velho que uma
            // aba antiga guarde na memória não aparece), a frase e a passagem para o pedido, com a página inteira
            // carregando. Nunca o redirecionamento do servidor: com o checkout aberto por um link do próprio site, ele
            // entraria no pedido pela navegação interna, com as tags de anúncio da página anterior
            <PedidoPago href={pedidoPago.href} codigo={pedidoPago.codigo} texto={d.carrinho.pedidoPago} botao={d.carrinho.verPedido} />
          ) : (
            <FormularioCarrinho
              idioma={locale}
              locale={LOCALE_INTL[locale]}
              inicial={inicial}
              dolar={cambio.taxa}
              notaCambio={cambio.nota}
              pagamentoOnline={pagamentoOnline}
              // a página guardada que abriu com o carrinho vazio (sem formas) pede as formas ao servidor quando ganha itens
              pagamentoLigado={pagamentoLigado}
              pedidoAberto={pedidoAberto}
              // a ajuda do e-mail só fala dos lembretes quando os e-mails estão ligados (sem a chave do Resend, nada sai)
              lembretesLigados={emailLigado()}
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
                robo: d.comum.robo,
                roboWhatsapp: whatsappDoRobo(d),
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
          )}
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormularioTransfer, type PedidoTransfer, type PontaPedido, type TrechoPedido } from '@/components/transfer/FormularioTransfer';
import { IDS_LUGARES, type IdLugar } from '@/data/transfer';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Busca = Record<string, string | string[] | undefined>;

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const numero = (v: string | string[] | undefined, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(um(v))) || 0));

function ponta(q: Busca, campo: string): PontaPedido | null {
  const lugar = um(q[campo]);
  if (!(IDS_LUGARES as string[]).includes(lugar)) return null;
  return { lugar: lugar as IdLugar, endereco: um(q[`${campo}Endereco`]).slice(0, 160) };
}

function trecho(q: Busca, saida: string, destino: string, data: string, hora: string): TrechoPedido | null {
  const s = ponta(q, saida);
  const d = ponta(q, destino);
  const dia = um(q[data]);
  const h = um(q[hora]);
  if (!s || !d || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(h)) return null;
  return { saida: s, destino: d, data: dia, hora: h };
}

/** O transfer montado no cartão da página chega pela URL; o servidor confere tudo de novo na reserva. */
function lerPedido(q: Busca): PedidoTransfer | null {
  const veiculo = um(q.veiculo);
  const ida = trecho(q, 'saida', 'destino', 'data', 'hora');
  if (!ida || (veiculo !== 'carro' && veiculo !== 'van')) return null;
  let volta: TrechoPedido | undefined;
  if (um(q.volta) === '1') {
    const v = trecho(q, 'voltaSaida', 'voltaDestino', 'dataVolta', 'horaVolta');
    if (!v) return null;
    volta = v;
  }
  return {
    veiculo,
    ida,
    volta,
    passageiros: numero(q.pessoas, 1, 17),
    malas: { grandes: numero(q.grandes, 0, 40), medias: numero(q.medias, 0, 40), mao: numero(q.mao, 0, 40) },
  };
}

export default async function CheckoutTransfer({ params, searchParams }: PageProps<'/[locale]/transfer/checkout'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const T = d.transfer;
  const pedido = lerPedido(await searchParams);

  return (
    <main id="conteudo" className="tom-fundo">
      <div className="moldura pb-24 pt-4 md:pb-32 md:pt-8">
        <h1 className="display text-head">{T.checkoutTitulo}</h1>
        <Link href={rota(locale, '/transfer')} className="link mt-3 inline-flex min-h-11 items-center gap-2 font-semibold">
          <span aria-hidden="true">←</span> {T.titulo}
        </Link>
        <div className="mt-10">
          {pedido ? (
            <FormularioTransfer
              idioma={locale}
              locale={LOCALE_INTL[locale]}
              pedido={pedido}
              textos={{
                checkout: d.checkout,
                transfer: T,
                dataHora: d.horario.dataHora,
                diminuir: d.comum.diminuir,
                aumentar: d.comum.aumentar,
              }}
              links={{
                termos: rota(locale, '/termos-de-uso'),
                politica: rota(locale, '/politica-de-cancelamento'),
                reserva: rota(locale, '/reserva'),
                transfer: rota(locale, '/transfer'),
              }}
            />
          ) : (
            // sem trajeto válido na URL: volta para o cartão do transfer
            <div className="max-w-[44ch]">
              <p className="text-lead">{T.trajetoIncompleto}</p>
              <Link href={rota(locale, '/transfer')} className="botao mt-6">
                {T.reservarTitulo}
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

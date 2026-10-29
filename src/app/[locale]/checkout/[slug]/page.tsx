import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormularioCheckout } from '@/components/FormularioCheckout';
import { obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { pagarmeConfigurado } from '@/lib/pagarme';
import { nomeCidade } from '@/lib/passeio-view';
import { tabelaPreco } from '@/lib/precos';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const numero = (v: string | string[] | undefined, padrao: number) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? Math.min(30, Math.max(0, Math.floor(n))) : padrao;
};

export default async function Checkout({ params, searchParams }: PageProps<'/[locale]/checkout/[slug]'>) {
  const { locale, slug } = await params;
  const q = await searchParams;
  const p = obterPasseio(slug);
  if (!isIdioma(locale) || !p) notFound();
  const d = dicionario(locale);
  const dataQ = Array.isArray(q.data) ? q.data[0] : q.data;

  return (
    <div className="moldura pb-24 pt-6 md:pb-32 md:pt-10">
      <Link
        href={rota(locale, `/passeios/${p.slug}`)}
        className="inline-flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline"
      >
        <span aria-hidden="true">←</span> {p.nome[locale]}
      </Link>
      <h1 className="titulo-display mt-4 text-head">{d.checkout.titulo}</h1>
      <div className="mt-10">
        <FormularioCheckout
          idioma={locale}
          locale={LOCALE_INTL[locale]}
          passeio={{ slug: p.slug, nome: p.nome[locale], cidade: nomeCidade(p, locale), duracao: p.duracao[locale] }}
          tabela={tabelaPreco(p)}
          inicial={{ data: typeof dataQ === 'string' ? dataQ : '', adultos: numero(q.adultos, 2) || 1, criancas: numero(q.criancas, 0) }}
          pagamentoOnline={pagarmeConfigurado()}
          chavePublica={process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY}
          links={{
            termos: rota(locale, '/termos-de-uso'),
            politica: rota(locale, '/politica-de-cancelamento'),
            reserva: rota(locale, '/reserva'),
          }}
          textos={{
            ...d.checkout,
            adultos: d.comum.adultos,
            criancas: d.comum.criancas,
            diminuir: d.comum.diminuir,
            aumentar: d.comum.aumentar,
            pessoa: d.comum.pessoa,
            pessoas: d.comum.pessoas,
            adulto: d.comum.adulto,
            crianca: d.comum.crianca,
            unidadeSingular: p.unidade === 'veiculo' ? d.comum.veiculo : d.comum.embarcacao,
            unidadePlural: p.unidade === 'veiculo' ? d.comum.veiculos : d.comum.embarcacoes,
          }}
        />
      </div>
    </div>
  );
}

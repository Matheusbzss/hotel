import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormularioCheckout } from '@/components/FormularioCheckout';
import { obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { pagarmeConfigurado } from '@/lib/pagarme';
import { contadoresPessoas, nomeCidade, regrasCriancas, semFaixas } from '@/lib/passeio-view';
import { opcoesPasseio, tabelaPreco, temOpcoes } from '@/lib/precos';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const numero = (v: string | string[] | undefined, padrao: number) => {
  const n = Number(primeiro(v));
  return Number.isFinite(n) ? Math.min(30, Math.max(0, Math.floor(n))) : padrao;
};

export default async function Checkout({ params, searchParams }: PageProps<'/[locale]/checkout/[slug]'>) {
  const { locale, slug } = await params;
  const q = await searchParams;
  const p = obterPasseio(slug);
  if (!isIdioma(locale) || !p) notFound();
  const d = dicionario(locale);
  const dataQ = primeiro(q.data);

  return (
    <main id="conteudo" className="tom-claro">
      <div className="moldura pb-24 pt-4 md:pb-32 md:pt-8">
        <Link href={rota(locale, `/passeios/${p.slug}`)} className="link inline-flex min-h-11 items-center gap-2 font-semibold">
          <span aria-hidden="true">←</span> {p.nome[locale]}
        </Link>
        <h1 className="largo mt-4 text-head">{d.checkout.titulo}</h1>
        <div className="mt-10">
          <FormularioCheckout
            idioma={locale}
            locale={LOCALE_INTL[locale]}
            passeio={{ slug: p.slug, nome: p.nome[locale], cidade: nomeCidade(p, locale), duracao: p.duracao[locale] }}
            opcoes={opcoesPasseio(p).map((o) => ({ id: o.id, nome: o.nome[locale], tabela: tabelaPreco(p, o) }))}
            mostrarOpcoes={temOpcoes(p)}
            contadores={contadoresPessoas(tabelaPreco(p), d)}
            regras={regrasCriancas(p, d)}
            semFaixas={semFaixas(p)}
            inicial={{
              data: typeof dataQ === 'string' ? dataQ : '',
              opcao: primeiro(q.opcao) ?? '',
              pessoas: { adultos: numero(q.adultos, 2) || 1, criancasMeia: numero(q.meia, 0), criancasGratis: numero(q.gratis, 0) },
            }}
            pagamentoOnline={pagarmeConfigurado()}
            chavePublica={process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY}
            links={{
              termos: rota(locale, '/termos-de-uso'),
              politica: rota(locale, '/politica-de-cancelamento'),
              reserva: rota(locale, '/reserva'),
            }}
            textos={{
              ...d.checkout,
              diminuir: d.comum.diminuir,
              aumentar: d.comum.aumentar,
              unidadeSingular: p.unidade === 'veiculo' ? d.comum.veiculo : d.comum.embarcacao,
              unidadePlural: p.unidade === 'veiculo' ? d.comum.veiculos : d.comum.embarcacoes,
              rotulos: d.comum.rotulos,
            }}
          />
        </div>
      </div>
    </main>
  );
}

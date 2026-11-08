import Image from 'next/image';
import { altDaFoto } from '@/data/fotos-alt';
import { TRAJETOS, VEICULOS, precoDoTrajeto, type Idioma, type Veiculo } from '@/data/transfer';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { textosCotacao } from '@/lib/cotacao';
import { textoDolar } from '@/lib/dolar';
import { precoPixCentavos } from '@/lib/orcamento';

/** Os textos do cartão de reserva do transfer. */
export function textosWidgetTransfer(d: Dicionario) {
  return {
    ...d.transfer,
    escolhaData: d.passeio.escolhaData,
    diminuir: d.comum.diminuir,
    aumentar: d.comum.aumentar,
    noPix: d.preco.noPix,
    noCartao: d.preco.noCartao,
    dolar: d.preco.dolar,
    adicionar: d.carrinho.adicionar,
    reservarAgora: d.carrinho.reservarAgora,
    semCobranca: d.carrinho.semCobranca,
    adicionando: d.carrinho.adicionando,
    erroAdicionar: d.carrinho.erroAdicionar,
    cheio: d.carrinho.cheio,
    cotacao: textosCotacao(d),
  };
}

const VEICULOS_EM_ORDEM: Veiculo[] = ['carro', 'van'];

/** A ficha do transfer: veículos, espera, cadeirinha e pedágio. */
export function FichaTransfer({ d, className = '' }: { d: Dicionario; className?: string }) {
  return (
    <dl className={`ficha ${className}`}>
      {d.transfer.ficha.map((f, i) => (
        // as duas primeiras têm texto longo e ocupam a linha toda
        <div key={f.titulo} className={i < 2 ? 'largo' : undefined}>
          <dt>{f.titulo}</dt>
          <dd>{f.texto}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Os trajetos com preço fixo, com o preço do carro e da van por trecho: no Pix em destaque e no cartão,
 * cada um com o aproximado em dólar ao lado nas páginas em espanhol e inglês.
 */
export function PrecosTransfer({
  d,
  idioma,
  dolar = null,
  className = '',
}: {
  d: Dicionario;
  idioma: Idioma;
  /** Reais por dólar, para o "≈ US$" (null no português e sem cotação). */
  dolar?: number | null;
  className?: string;
}) {
  const T = d.transfer;
  const locale = LOCALE_INTL[idioma];
  const usd = (centavos: number) => textoDolar(centavos, dolar, d.preco.dolar, locale);
  const preco = (reais: number | null) => {
    if (reais === null) return <span className="cifra text-lead font-semibold">{T.sobCotacao}</span>;
    const centavos = Math.round(reais * 100);
    const usdPix = usd(precoPixCentavos(centavos));
    const usdCartao = usd(centavos);
    return (
      <>
        <span className="cifra text-lead font-semibold">{formatarCifra(precoPixCentavos(centavos), locale)}</span>{' '}
        <span className="text-small font-semibold text-(--color-sucesso)">{d.preco.noPix}</span>
        {usdPix && <span className="whitespace-nowrap text-small text-(--color-tinta-suave)"> · {usdPix}</span>}
        <span className="block text-small text-(--color-tinta-suave)">
          <span className="numeros font-semibold text-(--color-tinta)">{formatarCifra(centavos, locale)}</span> {d.preco.noCartao}
          {usdCartao && <span className="whitespace-nowrap"> · {usdCartao}</span>}
        </span>
      </>
    );
  };
  return (
    <section aria-labelledby="precos-transfer" className={className}>
      <h2 id="precos-transfer" className="text-lead font-semibold">
        {T.precosTitulo}
      </h2>
      <p className="mt-2 max-w-[60ch] text-(--color-tinta-suave)">{T.precosTexto}</p>
      {/* o nome em cima e os dois veículos embaixo em qualquer largura: com o ≈ US$ ao lado de cada preço,
          a coluna de preços ao lado do nome espremia o nome no computador */}
      <ul className="mt-5 grid gap-(--vao-celula)">
        {TRAJETOS.map((t) => (
          <li key={t.de} className="celula grid gap-3 px-4 py-3.5">
            <p className="font-semibold">{t.nome[idioma]}</p>
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              {VEICULOS_EM_ORDEM.map((v) => (
                <div key={v}>
                  <dt className="text-small text-(--color-tinta-suave)">{VEICULOS[v].nome[idioma]}</dt>
                  <dd>{preco(precoDoTrajeto(t, v))}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-small text-(--color-tinta-suave)">{T.outrosTrajetos}</p>
    </section>
  );
}

/** Os dois veículos, com foto real, modelos, lugares e malas. */
export function VeiculosTransfer({ d, idioma, className = '' }: { d: Dicionario; idioma: Idioma; className?: string }) {
  const T = d.transfer;
  return (
    <section aria-labelledby="veiculos-transfer" className={className}>
      <h2 id="veiculos-transfer" className="text-lead font-semibold">
        {T.veiculosTitulo}
      </h2>
      <ul className="mt-5 grid gap-6 sm:grid-cols-2">
        {VEICULOS_EM_ORDEM.map((v) => {
          const V = VEICULOS[v];
          return (
            <li key={v}>
              <figure>
                <div className="relative aspect-[4/3] overflow-hidden rounded-[4px]">
                  <Image
                    src={V.foto}
                    alt={altDaFoto(V.foto, idioma, V.nome[idioma])}
                    fill
                    sizes="(min-width: 640px) 30vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-3">
                  <strong className="block font-[family-name:var(--font-semi)] text-lead font-semibold">{V.nome[idioma]}</strong>
                  <span className="block text-small text-(--color-tinta-suave)">{V.modelos[idioma]}</span>
                  <span className="mt-1 block">
                    {T.ateNPessoas.replace('{n}', String(V.capacidade))} · {V.malas[idioma]}
                  </span>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Como funciona: o motorista no desembarque, a espera e o caminho direto. */
export function ComoFuncionaTransfer({ d, className = '' }: { d: Dicionario; className?: string }) {
  const T = d.transfer;
  return (
    <section aria-labelledby="como-transfer" className={className}>
      <h2 id="como-transfer" className="text-lead font-semibold">
        {T.comoTitulo}
      </h2>
      <ol className="mt-5 grid gap-3">
        {T.como.map((passo, i) => (
          <li key={passo} className="flex gap-4">
            <span className="numeros w-6 shrink-0 font-semibold text-(--color-turquesa-texto)" aria-hidden="true">
              {i + 1}
            </span>
            <span>{passo}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** As regras do transfer: cadeirinha, bagagem extra, pedágio e cancelamento. */
export function RegrasTransfer({ d, className = '' }: { d: Dicionario; className?: string }) {
  const T = d.transfer;
  return (
    <section aria-labelledby="regras-transfer" className={className}>
      <h2 id="regras-transfer" className="text-lead font-semibold">
        {T.regrasTitulo}
      </h2>
      <ul className="mt-4 grid gap-2.5">
        {T.regras.map((r) => (
          <li key={r} className="flex gap-2.5">
            <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-(--color-turquesa-texto)" aria-hidden="true" />
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}

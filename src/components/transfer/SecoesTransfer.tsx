import Image from 'next/image';
import { TRAJETOS, VEICULOS, type Idioma, type Veiculo } from '@/data/transfer';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';

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

/** Os trajetos com preço fixo, com o preço do carro e da van por trecho. */
export function PrecosTransfer({ d, idioma, className = '' }: { d: Dicionario; idioma: Idioma; className?: string }) {
  const T = d.transfer;
  const preco = (reais: number | null) => (reais === null ? T.sobCotacao : formatarCifra(reais * 100, LOCALE_INTL[idioma]));
  return (
    <section aria-labelledby="precos-transfer" className={className}>
      <h2 id="precos-transfer" className="text-lead font-semibold">
        {T.precosTitulo}
      </h2>
      <p className="mt-2 max-w-[60ch] text-(--color-tinta-suave)">{T.precosTexto}</p>
      <ul className="mt-5 grid gap-(--vao-celula)">
        {TRAJETOS.map((t) => (
          <li key={t.de} className="celula grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6">
            <p className="font-semibold">{t.nome[idioma]}</p>
            <dl className="flex gap-6">
              {VEICULOS_EM_ORDEM.map((v) => (
                <div key={v}>
                  <dt className="text-small text-(--color-tinta-suave)">{VEICULOS[v].nome[idioma]}</dt>
                  <dd className="cifra text-lead font-semibold">{preco(t.preco[v])}</dd>
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
                  <Image src={V.foto} alt={V.nome[idioma]} fill sizes="(min-width: 640px) 30vw, 100vw" className="object-cover" />
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

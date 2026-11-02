import { REGRAS_CASAS } from '@/data/casas';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';

/** As regras das casas, só com o que o dono já preencheu (campo vazio não aparece). */
export function RegrasCasas({ d, idioma, className = '' }: { d: Dicionario; idioma: Idioma; className?: string }) {
  const R = REGRAS_CASAS;
  const T = d.casas.regras;
  const reais = (valor: number) => formatarCifra(valor * 100, LOCALE_INTL[idioma]);
  const itens: [string, string | null][] = [
    [T.sinal, `${R.sinalPorcento}%`],
    [T.diaria, R.diaria === null ? null : reais(R.diaria)],
    [T.minimoNoites, R.minimoNoites === null ? null : fmt(T.noites, { n: R.minimoNoites })],
    [T.checkIn, R.checkIn],
    [T.checkOut, R.checkOut],
    [T.capacidade, R.capacidadeMaxima === null ? null : fmt(T.pessoas, { n: R.capacidadeMaxima })],
    [T.festas, R.festasEBarulho?.[idioma] ?? null],
    [T.pets, R.pets?.[idioma] ?? null],
    [T.caucao, R.caucao === null ? null : reais(R.caucao)],
    [T.limpeza, R.taxaLimpeza === null ? null : reais(R.taxaLimpeza)],
  ];
  const preenchidos = itens.filter((i): i is [string, string] => i[1] !== null);
  return (
    <section aria-labelledby="regras-casas" className={className}>
      <h2 id="regras-casas" className="subtitulo">
        {T.titulo}
      </h2>
      <dl className="ficha mt-4">
        {preenchidos.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

import Image from 'next/image';
import type { Cidade } from '@/data/passeios';
import { menorPrecoDaZona, type Zona } from '@/data/transfer';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, rota, type Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { CartaoInclinavel } from '../Inclinar';

/** A cidade do trilho vira a zona de preço do transfer (o Rio inclui os dois aeroportos). */
const ZONA: Record<Cidade, Zona> = {
  buzios: 'buzios',
  'arraial-do-cabo': 'arraial-do-cabo',
  'cabo-frio': 'cabo-frio',
  'rio-de-janeiro': 'rio',
};

/**
 * O transfer como mais uma opção no trilho de cada cidade: a foto real do carro no aeroporto, o preço
 * "a partir de" por veículo e o atalho para a página do transfer com a cidade já no destino.
 */
export function CardTransfer({ cidade, idioma, d }: { cidade: Cidade; idioma: Idioma; d: Dicionario }) {
  const T = d.transfer;
  const menor = menorPrecoDaZona(ZONA[cidade]);
  const preco = menor === null ? null : formatarCifra(menor * 100, LOCALE_INTL[idioma]);
  const rotulo = [T.titulo, T.cartaoTexto, preco && `${d.comum.aPartirDe} ${preco} ${T.porVeiculo}`].filter(Boolean).join(', ');
  return (
    <CartaoInclinavel href={rota(idioma, `/transfer?destino=${cidade}`)} rotulo={rotulo}>
      <div className="cartao-foto">
        <div className="absolute inset-0">
          <Image
            src="/fotos/transfer/carro-creta-aeroporto.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 46vw, 80vw"
            className="object-cover"
            style={{ objectPosition: '50% 45%' }}
          />
        </div>
        <div className="etiquetas" aria-hidden="true">
          <span className="etiqueta vidro vidro-escuro">{T.etiquetas[0]}</span>
        </div>
      </div>
      <div className="cartao-texto" aria-hidden="true">
        <h3 className="cartao-titulo">{T.titulo}</h3>
        {preco && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-small text-(--color-tinta-suave)">{d.comum.aPartirDe}</span>
            <strong className="cifra text-figure">{preco}</strong>
            <span className="text-small text-(--color-tinta-suave)">{T.porVeiculo}</span>
          </p>
        )}
        <p className="mt-1 text-caption text-(--color-tinta-suave)">{T.cartaoTexto}</p>
      </div>
    </CartaoInclinavel>
  );
}

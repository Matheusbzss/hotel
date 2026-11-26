'use client';

import { useEffect, useState } from 'react';
import type { Idioma } from '@/i18n/config';
import { linhaDoTrajeto, type LinhaDoTrajeto, type TextosLinhaDoTrajeto } from '@/lib/linha-do-trajeto';
import { Pedaco, Pedacos } from '../ComDolar';

/**
 * Pacote 34 (ENT-05): com o trajeto no link (o do anúncio), logo embaixo do título, o trajeto e o preço do trecho no
 * carro, para o cliente conferir em segundos se é o preço do anúncio, sem descer pelo cartão inteiro. A conta e os
 * textos são os de src/lib/linha-do-trajeto.ts. A página do transfer é estática: a linha é montada no navegador, com o
 * endereço da página, como o cartão do transfer faz com as listas (WidgetTransfer). Sem trajeto no link, nada aparece.
 */
export function TrajetoDoLink({
  idioma,
  locale,
  dolar,
  textos,
  className = '',
}: {
  idioma: Idioma;
  locale: string;
  /** Reais por dólar, para o "≈ US$" (null no português e sem cotação). */
  dolar: number | null;
  textos: TextosLinhaDoTrajeto;
  className?: string;
}) {
  const [linha, setLinha] = useState<LinhaDoTrajeto | null>(null);
  useEffect(() => {
    setLinha(linhaDoTrajeto(window.location.search, idioma, locale, dolar, textos));
  }, [idioma, locale, dolar, textos]);
  if (!linha) return null;
  const { grande, embaixo } = linha;
  return (
    <div className={className}>
      <p className="font-semibold">{linha.trajeto}</p>
      <p className="text-small opacity-85">{linha.veiculo}</p>
      {/* o preço como nos cartões dos passeios: cada pedaço inteiro, e o "·" só entre dois pedaços da mesma linha; o que
          não cabe desce inteiro (no celular, o do Pix vai para a linha de baixo) */}
      <p className="mt-1.5">
        <Pedacos folga="justa">
          <Pedaco forte className="cifra text-lead">
            {grande.valor}
          </Pedaco>
          <Pedaco className="text-small font-semibold whitespace-nowrap">{grande.rotulo}</Pedaco>
          {grande.dolar && (
            <Pedaco ponto className="text-small">
              {grande.dolar}
            </Pedaco>
          )}
          <Pedaco ponto className="text-small">
            <span className="numeros font-semibold">{embaixo.valor}</span> {embaixo.rotulo}
          </Pedaco>
        </Pedacos>
      </p>
    </div>
  );
}

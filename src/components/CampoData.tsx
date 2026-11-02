import type { ComponentProps } from 'react';

/**
 * Campo de data com a dica ("Escolha a data") enquanto está vazio. Vazio, cada navegador mostra uma coisa
 * (o iPhone, nada; os outros, dd/mm/aaaa); com a dica, todos ficam iguais até a pessoa tocar no campo.
 */
export function CampoData({
  valor,
  dica,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'value' | 'className'> & { valor: string; dica: string }) {
  return (
    <div className="relative">
      <input {...props} type="date" className="campo" value={valor} data-vazio={valor ? undefined : ''} />
      {!valor && (
        <span className="campo-dica" aria-hidden="true">
          {dica}
        </span>
      )}
    </div>
  );
}

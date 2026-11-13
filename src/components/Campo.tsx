import type { ReactNode } from 'react';

/** Um campo de formulário: o rótulo, o controle e a ajuda ou o erro embaixo. */
export function Campo({
  id,
  rotulo,
  erro,
  ajuda,
  children,
  className = '',
}: {
  id: string;
  rotulo: string;
  erro?: string;
  ajuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      {children}
      {ajuda && !erro && (
        <span id={`${id}-ajuda`} className="ajuda">
          {ajuda}
        </span>
      )}
      {erro && (
        <span id={`${id}-erro`} className="erro-campo" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}

export const descricao = (id: string, erro?: string, ajuda?: string) => (erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined);

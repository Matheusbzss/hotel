import type { ReactNode, Ref } from 'react';

/**
 * Pacote 34 (ENT-02): o pedaço de um cartão de reserva com um campo (o rótulo, o campo e o aviso). Quando o campo falta
 * no toque em Reservar, ele ganha o fundo rosado (.bloco-campo, em src/app/globals.css), o aviso aparece embaixo dele e
 * a tela vai até ele (levarAoCampo, em src/lib/levar-ao-campo.ts). Sem falta, fica igual a antes: nada muda de lugar.
 */
export function BlocoCampo({
  falta,
  aviso,
  className = '',
  children,
  ref,
}: {
  falta: boolean;
  /** O aviso embaixo do campo, só quando ele falta. */
  aviso?: string;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className={`bloco-campo ${className}`} data-falta={falta ? '' : undefined}>
      {children}
      {falta && aviso && <span className="erro-campo">{aviso}</span>}
    </div>
  );
}

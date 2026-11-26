'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconeCasa } from './IconeCasa';

/**
 * A folha que sobe do rodapé no celular e vira uma caixa no meio da tela no computador (design-dna: modal_style), com o
 * fundo mar-fundo a 60%, sem desfoque. O botão que abre fica no lugar dela. Esc, o X e um toque fora fecham.
 */
export function FolhaCasa({
  rotulo,
  titulo,
  fechar,
  classeBotao,
  children,
}: {
  rotulo: ReactNode;
  titulo: string;
  fechar: string;
  classeBotao: string;
  children: ReactNode;
}) {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);

  // com a folha aberta, a página de trás não rola
  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    const soltar = () => document.documentElement.style.removeProperty('overflow');
    el.addEventListener('close', soltar);
    return () => {
      el.removeEventListener('close', soltar);
      soltar();
    };
  }, []);

  const abrir = () => {
    document.documentElement.style.overflow = 'hidden';
    dialogo.current?.showModal();
  };

  return (
    <>
      <button type="button" className={classeBotao} onClick={abrir} aria-haspopup="dialog">
        {rotulo}
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={`${id}-titulo`}
        className="folha-casa tom-papel"
        onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}
      >
        <div className="folha-casa-topo">
          <h2 id={`${id}-titulo`} className="text-lead font-semibold">
            {titulo}
          </h2>
          <button type="button" className="folha-casa-fechar" onClick={() => dialogo.current?.close()} aria-label={fechar}>
            <IconeCasa nome="fechar" className="size-5" />
          </button>
        </div>
        <div className="folha-casa-corpo">{children}</div>
      </dialog>
    </>
  );
}

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { textoPessoas, type RotulosPessoas } from '@/lib/pessoas';
import { hojeEmBuzios, somarDias } from '@/lib/validacao';
import { Contador } from './Contador';
import { useGrupo } from './GrupoContexto';

export interface TextosSeletorGrupo {
  data: string;
  quemVai: string;
  adultos: string;
  adultosAjuda: string;
  criancasMeia: string;
  criancasMeiaAjuda: string;
  criancasGratis: string;
  criancasGratisAjuda: string;
  pronto: string;
  diminuir: string;
  aumentar: string;
  rotulos: RotulosPessoas;
}

/** "Data" e "Quem vai": o grupo que define os totais da página. */
export function SeletorGrupo({ textos: T, className = '' }: { textos: TextosSeletorGrupo; className?: string }) {
  const { grupo, alterar } = useGrupo();
  const [aberto, setAberto] = useState(false);
  const [hoje, setHoje] = useState('');
  const idData = useId();
  const idPainel = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setHoje(hojeEmBuzios()), []);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener('keydown', tecla);
    window.addEventListener('pointerdown', fora);
    return () => {
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('pointerdown', fora);
    };
  }, [aberto]);

  const resumo = textoPessoas({ adultos: grupo.adultos, criancas: grupo.criancas6a10 + grupo.criancas0a5 }, T.rotulos);

  return (
    <div ref={raiz} className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      <div>
        <label htmlFor={idData} className="rotulo">
          {T.data}
        </label>
        <input
          id={idData}
          type="date"
          className="campo"
          value={grupo.data}
          min={hoje || undefined}
          max={hoje ? somarDias(hoje, 366) : undefined}
          onChange={(e) => alterar({ data: e.target.value })}
        />
      </div>
      <div>
        <span className="rotulo" id={`${idPainel}-rotulo`}>
          {T.quemVai}
        </span>
        <button
          ref={botaoRef}
          type="button"
          className="campo flex items-center justify-between gap-3 text-left"
          aria-expanded={aberto}
          aria-controls={idPainel}
          aria-labelledby={`${idPainel}-rotulo ${idPainel}-valor`}
          onClick={() => setAberto((v) => !v)}
        >
          <span id={`${idPainel}-valor`} className="truncate">
            {resumo}
          </span>
          <svg viewBox="0 0 24 24" className={`size-5 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true">
            <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </button>
      </div>
      {aberto && (
        <div id={idPainel} className="tom-papel col-span-full space-y-4 p-4">
          <Contador
            rotulo={T.adultos}
            ajuda={T.adultosAjuda}
            valor={grupo.adultos}
            min={1}
            max={30}
            aoMudar={(v) => alterar({ adultos: v })}
            textos={T}
          />
          <Contador
            rotulo={T.criancasMeia}
            ajuda={T.criancasMeiaAjuda}
            valor={grupo.criancas6a10}
            min={0}
            max={20}
            aoMudar={(v) => alterar({ criancas6a10: v })}
            textos={T}
          />
          <Contador
            rotulo={T.criancasGratis}
            ajuda={T.criancasGratisAjuda}
            valor={grupo.criancas0a5}
            min={0}
            max={20}
            aoMudar={(v) => alterar({ criancas0a5: v })}
            textos={T}
          />
          <button
            type="button"
            className="botao w-full"
            onClick={() => {
              setAberto(false);
              botaoRef.current?.focus();
            }}
          >
            {T.pronto}
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * Uma parte que abre ao tocar, sem sair da página: fechada, mostra `fechado` (as 10 comodidades principais); aberta,
 * troca por `aberto` (a lista inteira, em grupos). Os dois já vêm prontos do servidor: o texto todo fica na página.
 */
export function Expandir({
  fechado,
  aberto,
  rotuloAbrir,
  rotuloFechar,
}: {
  fechado: ReactNode;
  aberto: ReactNode;
  rotuloAbrir: string;
  rotuloFechar: string;
}) {
  const id = useId();
  const [aberta, setAberta] = useState(false);
  return (
    <div>
      <div hidden={aberta}>{fechado}</div>
      <div id={id} hidden={!aberta}>
        {aberto}
      </div>
      <button
        type="button"
        className="botao botao-vazado mt-6 w-full sm:w-auto"
        aria-expanded={aberta}
        aria-controls={id}
        onClick={() => setAberta((v) => !v)}
      >
        {aberta ? rotuloFechar : rotuloAbrir}
      </button>
    </div>
  );
}

/**
 * A descrição da casa: o primeiro parágrafo em até 4 linhas e o "ler mais", que abre o resto do texto logo abaixo. O
 * texto inteiro já está na página (o leitor de tela e o Google leem tudo); só a tela esconde. Sem mais parágrafos, o
 * primeiro aparece inteiro (sem botão, nada pode ficar cortado).
 */
export function LerMais({
  resumo,
  paragrafos,
  textos,
}: {
  /** O primeiro parágrafo. */
  resumo: string;
  /** Os outros, que o "ler mais" abre. */
  paragrafos: string[];
  textos: { lerMais: string; lerMenos: string };
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  return (
    <div className="texto-corrido max-w-[62ch]">
      <p className={aberto || !paragrafos.length ? undefined : 'line-clamp-4'}>{resumo}</p>
      {paragrafos.length > 0 && (
        <>
          <div id={id} hidden={!aberto} className="mt-4">
            {paragrafos.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
          </div>
          <button
            type="button"
            className="link mt-3 inline-flex min-h-11 items-center font-semibold"
            aria-expanded={aberto}
            aria-controls={id}
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? textos.lerMenos : textos.lerMais}
          </button>
        </>
      )}
    </div>
  );
}

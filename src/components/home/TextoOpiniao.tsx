'use client';

import { useState } from 'react';

/** A partir daqui o texto aparece cortado, para os cartões não ficarem do tamanho do mais longo. */
const LONGO = 240;

/** O texto da avaliação, inteiro na página: o longo abre no "Ler mais". */
export function TextoOpiniao({ texto, lerMais, lerMenos }: { texto: string; lerMais: string; lerMenos: string }) {
  const [aberto, setAberto] = useState(false);
  const longo = texto.length > LONGO;
  return (
    <div className="mt-1 flex-1">
      <p className={`whitespace-pre-line ${longo && !aberto ? 'line-clamp-6' : ''}`}>{texto}</p>
      {longo && (
        <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="link mt-1 text-small">
          {aberto ? lerMenos : lerMais}
        </button>
      )}
    </div>
  );
}

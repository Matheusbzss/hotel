'use client';

import { useState } from 'react';

/** Copia um texto para colar em outro site. */
export function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="min-h-11 shrink-0 bg-superficie px-4 text-small font-semibold text-mar hover:bg-borda"
      onClick={() => navigator.clipboard.writeText(texto).then(() => setCopiado(true))}
    >
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}

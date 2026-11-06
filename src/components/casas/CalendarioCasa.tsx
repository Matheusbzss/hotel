'use client';

import { useMemo, useState } from 'react';

/** AAAA-MM-DD de um dia em UTC (as contas de calendário não dependem do fuso do aparelho). */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const diaUtc = (dataIso: string) => new Date(`${dataIso}T12:00:00Z`);

function somarDias(dataIso: string, n: number) {
  const d = diaUtc(dataIso);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/**
 * O calendário da casa: um mês por vez. O primeiro toque marca a chegada e o segundo, a saída. Dias que
 * já passaram e noites ocupadas ficam riscados; a saída não pode atravessar uma noite ocupada.
 */
export function CalendarioCasa({
  hoje,
  ocupadas,
  chegada,
  saida,
  aoMudar,
  locale,
  textos: T,
}: {
  /** AAAA-MM-DD no fuso de Búzios ('' antes de o aparelho responder). */
  hoje: string;
  /** As noites já reservadas ou bloqueadas (AAAA-MM-DD). */
  ocupadas: string[];
  chegada: string;
  saida: string;
  aoMudar: (datas: { chegada: string; saida: string }) => void;
  locale: string;
  textos: { mesAnterior: string; proximoMes: string; ocupada: string };
}) {
  const ocupada = useMemo(() => new Set(ocupadas), [ocupadas]);
  const inicio = chegada || hoje || iso(new Date());
  const [mes, setMes] = useState(inicio.slice(0, 7));

  const primeiro = diaUtc(`${mes}-01`);
  const nomeMes = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(primeiro);
  // a semana começa no domingo (Brasil, Argentina e EUA); 01/01/2023 foi um domingo
  const semana = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(diaUtc(somarDias('2023-01-01', i))),
  );
  const vazios = primeiro.getUTCDay();
  const diasNoMes = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() + 1, 0)).getUTCDate();
  const dias = Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);

  const mudarMes = (n: number) => {
    const d = diaUtc(`${mes}-01`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMes(iso(d).slice(0, 7));
  };
  const podeVoltar = !hoje || mes > hoje.slice(0, 7);

  /** Escolhendo a saída: só vale se nenhuma noite entre a chegada e ela estiver ocupada. */
  const saidaLivre = (dia: string) => {
    for (let n = chegada; n < dia; n = somarDias(n, 1)) if (ocupada.has(n)) return false;
    return true;
  };
  const escolhendoSaida = Boolean(chegada && !saida);

  const tocar = (dia: string) => {
    if (escolhendoSaida && dia > chegada) aoMudar({ chegada, saida: dia });
    else aoMudar({ chegada: dia, saida: '' });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => mudarMes(-1)}
          disabled={!podeVoltar}
          aria-label={T.mesAnterior}
          className="flex size-11 items-center justify-center rounded-[4px] disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.75" />
          </svg>
        </button>
        <p className="font-semibold first-letter:uppercase" aria-live="polite">
          {nomeMes}
        </p>
        <button
          type="button"
          onClick={() => mudarMes(1)}
          aria-label={T.proximoMes}
          className="flex size-11 items-center justify-center rounded-[4px]"
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.75" />
          </svg>
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-y-1 text-center" role="grid">
        {semana.map((d, i) => (
          <span key={i} className="pb-1 text-caption font-semibold text-(--color-tinta-suave)" aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: vazios }, (_, i) => (
          <span key={`v${i}`} aria-hidden="true" />
        ))}
        {dias.map((dia) => {
          const passou = Boolean(hoje) && dia < hoje;
          const bloqueado = passou || (escolhendoSaida && dia > chegada ? !saidaLivre(dia) : ocupada.has(dia));
          const ponta = dia === chegada || dia === saida;
          const noMeio = Boolean(chegada && saida) && dia > chegada && dia < saida;
          const rotulo = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(diaUtc(dia));
          return (
            <button
              key={dia}
              type="button"
              onClick={() => tocar(dia)}
              disabled={bloqueado}
              aria-pressed={ponta}
              aria-label={ocupada.has(dia) ? `${rotulo}, ${T.ocupada}` : rotulo}
              className={`numeros mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-[4px] text-small font-semibold transition-colors duration-150 ${
                ponta
                  ? 'bg-(--color-tinta) text-white'
                  : noMeio
                    ? 'bg-(--color-superficie)'
                    : bloqueado
                      ? 'cursor-not-allowed text-(--color-tinta-suave) line-through opacity-60'
                      : 'hover:shadow-[inset_0_0_0_1px_var(--color-tinta)]'
              }`}
            >
              {Number(dia.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

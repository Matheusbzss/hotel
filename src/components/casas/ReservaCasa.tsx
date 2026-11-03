'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { SINAL_PORCENTO, faixasDaEstadia, orcamentoCasa, type TabelaDiarias } from '@/lib/diarias';
import { formatarDataIso, hojeEmBuzios } from '@/lib/validacao';
import { Contador } from '../grupo/Contador';
import { CalendarioCasa } from './CalendarioCasa';

export interface TextosReservaCasa {
  reservarTitulo: string;
  chegada: string;
  saida: string;
  escolhaDatas: string;
  escolhaSaida: string;
  hospedes: string;
  noitesLinha: string;
  umaNoiteLinha: string;
  taxaLimpeza: string;
  total: string;
  sinal: string;
  restante: string;
  minimo: string;
  ocupada: string;
  reservar: string;
  reservaEmBreve: string;
  mesAnterior: string;
  proximoMes: string;
  limpar: string;
  mudarDatas: string;
  diminuir: string;
  aumentar: string;
}

/**
 * O cartão de reserva da casa: as datas no calendário, os hóspedes e a conta noite a noite (com a
 * temporada e os feriados), a taxa de limpeza, o total, o sinal e o restante.
 */
export function ReservaCasa({
  tabela,
  capacidade,
  ocupadas,
  reservaAberta,
  hrefReserva,
  locale,
  textos: T,
}: {
  tabela: TabelaDiarias;
  capacidade: number;
  /** As noites já reservadas ou bloqueadas (AAAA-MM-DD). */
  ocupadas: string[];
  /** false até o checkout das casas existir: o botão avisa que a reserva abre em breve. */
  reservaAberta: boolean;
  hrefReserva: string;
  locale: string;
  textos: TextosReservaCasa;
}) {
  const [hoje, setHoje] = useState('');
  const [datas, setDatas] = useState({ chegada: '', saida: '' });
  const [hospedes, setHospedes] = useState(Math.min(2, capacidade));
  // com as datas certas o calendário fecha e a conta aparece logo abaixo delas (no computador, o cartão
  // cabe na tela); tocar nas datas abre de novo
  const [calendarioAberto, setCalendarioAberto] = useState(true);
  useEffect(() => setHoje(hojeEmBuzios()), []);

  const mudarDatas = (novas: { chegada: string; saida: string }) => {
    setDatas(novas);
    if (novas.chegada && novas.saida && orcamentoCasa(tabela, novas.chegada, novas.saida).ok) setCalendarioAberto(false);
  };
  const limparDatas = () => {
    setDatas({ chegada: '', saida: '' });
    setCalendarioAberto(true);
  };

  const { chegada, saida } = datas;
  const o = chegada && saida ? orcamentoCasa(tabela, chegada, saida) : null;
  const cifra = (reais: number) => formatarCifra(reais * 100, locale);
  const aviso = !chegada ? T.escolhaDatas : !saida ? T.escolhaSaida : o?.motivo === 'minimo' ? fmt(T.minimo, { n: o.minimoNoites }) : '';
  const q = new URLSearchParams({ chegada, saida, hospedes: String(hospedes) });

  return (
    <div id="reservar" className="scroll-mt-24 rounded-cartao border border-(--color-borda) bg-(--color-papel) p-5 sm:p-6">
      <h2 className="text-lead font-semibold">{T.reservarTitulo}</h2>
      <button
        type="button"
        className="mt-4 grid w-full grid-cols-2 gap-1.5 rounded-[4px] text-left"
        aria-expanded={calendarioAberto}
        aria-controls="calendario-casa"
        onClick={() => setCalendarioAberto((v) => !v)}
      >
        {(
          [
            [T.chegada, chegada],
            [T.saida, saida],
          ] as const
        ).map(([rotulo, data]) => (
          <span key={rotulo} className="block rounded-[4px] bg-(--color-superficie) px-3 py-2">
            <span className="block text-caption text-(--color-tinta-suave)">{rotulo}</span>
            <span className="block font-semibold">{data ? formatarDataIso(data, locale) : '—'}</span>
          </span>
        ))}
      </button>
      {calendarioAberto && (
        <div id="calendario-casa" className="mt-4">
          <CalendarioCasa hoje={hoje} ocupadas={ocupadas} chegada={chegada} saida={saida} aoMudar={mudarDatas} locale={locale} textos={T} />
        </div>
      )}
      {chegada && (
        <div className="mt-1 flex flex-wrap gap-x-5">
          {!calendarioAberto && (
            <button type="button" className="link min-h-11 text-small font-semibold" onClick={() => setCalendarioAberto(true)}>
              {T.mudarDatas}
            </button>
          )}
          <button type="button" className="link min-h-11 text-small font-semibold" onClick={limparDatas}>
            {T.limpar}
          </button>
        </div>
      )}

      <div className="mt-4">
        <Contador rotulo={T.hospedes} valor={hospedes} min={1} max={capacidade} aoMudar={setHospedes} textos={T} />
      </div>

      {aviso && (
        <p className="mt-4 text-small text-(--color-tinta-suave)" aria-live="polite">
          {aviso}
        </p>
      )}

      {o?.ok && (
        <dl className="mt-5 space-y-2 border-t border-(--color-borda) pt-4">
          {faixasDaEstadia(o).map((f) => (
            <div key={`${f.noites}-${f.diaria}`} className="flex justify-between gap-4">
              <dt>{fmt(f.noites === 1 ? T.umaNoiteLinha : T.noitesLinha, { n: f.noites, valor: cifra(f.diaria) })}</dt>
              <dd className="numeros font-semibold">{cifra(f.noites * f.diaria)}</dd>
            </div>
          ))}
          {o.taxaLimpeza > 0 && (
            <div className="flex justify-between gap-4">
              <dt>{T.taxaLimpeza}</dt>
              <dd className="numeros font-semibold">{cifra(o.taxaLimpeza)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 border-t border-(--color-borda) pt-3">
            <dt className="font-semibold">{T.total}</dt>
            <dd className="cifra text-figure">{cifra(o.total)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{fmt(T.sinal, { p: SINAL_PORCENTO })}</dt>
            <dd className="numeros font-semibold">{cifra(o.sinal)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-(--color-tinta-suave)">
            <dt>{T.restante}</dt>
            <dd className="numeros">{cifra(o.restante)}</dd>
          </div>
        </dl>
      )}

      {reservaAberta ? (
        <a
          href={o?.ok ? `${hrefReserva}?${q.toString()}` : undefined}
          aria-disabled={!o?.ok}
          className={`botao mt-5 w-full ${o?.ok ? '' : 'pointer-events-none opacity-50'}`}
        >
          {fmt(T.reservar, { p: SINAL_PORCENTO })}
        </a>
      ) : (
        <p className="mt-5 rounded-[4px] bg-(--color-superficie) px-4 py-3 text-center font-semibold">{T.reservaEmBreve}</p>
      )}
    </div>
  );
}

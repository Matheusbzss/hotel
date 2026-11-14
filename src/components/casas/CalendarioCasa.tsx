'use client';

import { useMemo } from 'react';
import type { Pacote } from '@/lib/estadia';
import { IconeCasa } from './IconeCasa';

/** AAAA-MM-DD de um dia em UTC (as contas de calendário não dependem do fuso do aparelho). */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const diaUtc = (dataIso: string) => new Date(`${dataIso}T12:00:00Z`);
const somarDias = (dataIso: string, n: number) => {
  const d = diaUtc(dataIso);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
/** O mês (AAAA-MM) n meses depois. */
export const somarMeses = (mes: string, n: number) => {
  const d = diaUtc(`${mes}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d).slice(0, 7);
};

export interface TextosCalendario {
  mesAnterior: string;
  proximoMes: string;
  ocupada: string;
}

/**
 * O calendário da casa: dois meses lado a lado no computador, um no celular. O primeiro toque marca a entrada e o
 * segundo, a saída (quem decide o que o toque faz é o quadro de reserva, ReservaCasa). Dias que já passaram e noites
 * ocupadas ficam apagados (as ocupadas, riscadas); escolhendo a saída, ela não pode atravessar uma noite ocupada. As
 * noites de pacote ficam numa faixa de cor, e as datas escolhidas, numa faixa escura.
 */
export function CalendarioCasa({
  mes,
  aoMudarMes,
  hoje,
  ocupadas,
  pacoteDaNoite,
  nomeDoPacote,
  entrada,
  saida,
  aoTocar,
  locale,
  textos: T,
}: {
  /** O primeiro mês na tela (AAAA-MM). */
  mes: string;
  aoMudarMes: (mes: string) => void;
  /** O primeiro dia em que ainda dá para entrar (AAAA-MM-DD, fuso de Búzios). */
  hoje: string;
  ocupadas: ReadonlySet<string>;
  pacoteDaNoite: ReadonlyMap<string, Pacote>;
  nomeDoPacote: (p: Pacote) => string;
  entrada: string;
  saida: string;
  aoTocar: (dia: string) => void;
  locale: string;
  textos: TextosCalendario;
}) {
  const escolhendoSaida = Boolean(entrada && !saida);
  // escolhendo a saída: ela vai até a primeira noite ocupada depois da entrada (a saída pode cair numa noite ocupada)
  const limiteDaSaida = useMemo(() => {
    if (!escolhendoSaida) return '';
    for (let n = entrada, i = 0; i < 400; n = somarDias(n, 1), i++) if (ocupadas.has(n)) return n;
    return '9999-12-31';
  }, [escolhendoSaida, entrada, ocupadas]);

  const semana = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        // a semana começa no domingo (Brasil, Argentina e EUA); 01/01/2023 foi um domingo
        new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(diaUtc(somarDias('2023-01-01', i))),
      ),
    [locale],
  );
  const formatoMes = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const formatoDia = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
  const mesDeHoje = (hoje || iso(new Date())).slice(0, 7);
  const podeVoltar = mes > mesDeHoje;
  // até um ano e meio à frente (os pacotes do ano estão lá dentro)
  const podeAvancar = mes < somarMeses(mesDeHoje, 17);

  const mesInteiro = (m: string, segundo: boolean) => {
    const primeiro = diaUtc(`${m}-01`);
    const vazios = primeiro.getUTCDay();
    const diasNoMes = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() + 1, 0)).getUTCDate();
    const dias = Array.from({ length: diasNoMes }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
    const nome = formatoMes.format(primeiro);
    return (
      <div key={m} className={`cal-mes ${segundo ? 'cal-mes-segundo' : ''}`}>
        <p className="cal-mes-nome" aria-live={segundo ? undefined : 'polite'}>
          {nome}
        </p>
        <div className="cal-semana" aria-hidden="true">
          {semana.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="cal-dias">
          {Array.from({ length: vazios }, (_, i) => (
            <span key={`v${i}`} aria-hidden="true" />
          ))}
          {dias.map((dia) => {
            const passou = Boolean(hoje) && dia < hoje;
            const ocupada = ocupadas.has(dia);
            const comoSaida = escolhendoSaida && dia > entrada;
            const desativado = comoSaida ? dia > limiteDaSaida : passou || ocupada;
            const pacote = pacoteDaNoite.get(dia);
            const noite = (d: string) => pacote && pacoteDaNoite.get(d) === pacote;
            const faixaPacote = pacote
              ? noite(somarDias(dia, -1))
                ? noite(somarDias(dia, 1))
                  ? 'meio'
                  : 'fim'
                : noite(somarDias(dia, 1))
                  ? 'inicio'
                  : 'unico'
              : undefined;
            const ponta = dia === entrada || dia === saida;
            const faixa =
              entrada && saida && dia >= entrada && dia <= saida
                ? dia === entrada
                  ? 'inicio'
                  : dia === saida
                    ? 'fim'
                    : 'meio'
                : undefined;
            const estado = ponta ? undefined : ocupada && !comoSaida ? 'ocupada' : passou || desativado ? 'apagado' : undefined;
            const rotulo = [formatoDia.format(diaUtc(dia)), ocupada ? T.ocupada : '', pacote ? nomeDoPacote(pacote) : '']
              .filter(Boolean)
              .join(', ');
            return (
              <button
                key={dia}
                type="button"
                onClick={() => aoTocar(dia)}
                disabled={desativado}
                aria-pressed={ponta}
                aria-label={rotulo}
                className="cal-dia"
                data-pacote={faixaPacote}
                data-faixa={faixa}
                data-ponta={ponta ? '' : undefined}
                data-estado={estado}
              >
                <span className="cal-num">{Number(dia.slice(8))}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="cal">
      <div className="cal-setas">
        <button type="button" onClick={() => aoMudarMes(somarMeses(mes, -1))} disabled={!podeVoltar} aria-label={T.mesAnterior}>
          <IconeCasa nome="esquerda" className="size-5" />
        </button>
        <button type="button" onClick={() => aoMudarMes(somarMeses(mes, 1))} disabled={!podeAvancar} aria-label={T.proximoMes}>
          <IconeCasa nome="direita" className="size-5" />
        </button>
      </div>
      <div className="cal-meses">
        {mesInteiro(mes, false)}
        {mesInteiro(somarMeses(mes, 1), true)}
      </div>
    </div>
  );
}

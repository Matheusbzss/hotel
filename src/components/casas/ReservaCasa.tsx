'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DESCONTO_PIX_PORCENTO } from '@/config/precos';
import { fmt, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { formatarCifra } from '@/lib/cifra';
import {
  ajustesDaEstadia,
  linhasDaConta,
  opcoesDoPacote,
  pacotePorNoite,
  pacotesDaNoite,
  primeiraNoiteLivre,
  type AjusteDeDatas,
  type LinhaDaConta,
} from '@/lib/conta-casa';
import type { TextosCotacao } from '@/lib/cotacao';
import { SINAL_PORCENTO } from '@/lib/diarias';
import { textoDolar } from '@/lib/dolar';
import {
  NOITES_LIVRES_DO_FIM_DE_SEMANA,
  contaEstadia,
  gruposDePacotes,
  menorDiariaCentavos,
  noitesDoPacote,
  partesDaEstadia,
  primeiraEntradaPossivel,
  type Pacote,
  type TabelaEstadia,
} from '@/lib/estadia';
import { precoPixCentavos } from '@/lib/orcamento';
import { FormularioCotacao } from '../FormularioCotacao';
import { Contador } from '../grupo/Contador';
import { BarraCasa } from './BarraCasa';
import { CalendarioCasa, type TextosCalendario } from './CalendarioCasa';
import { FolhaCasa } from './FolhaCasa';

export interface TextosReservaCasa extends TextosCalendario {
  datasTitulo: string;
  limpar: string;
  regraHorario: string;
  regraMinimo: string;
  regraFimDeSemana: string;
  diariasDaCasa: string;
  diariaUnica: string;
  pacotesTitulo: string;
  pacotesTexto: string;
  pacoteOpcoes: string;
  pacoteOpcao: string;
  /** "Ver os {n} pacotes" e "Ver menos". */
  verPacotes: string;
  menosPacotes: string;
  legendaPacote: string;
  legendaOcupada: string;
  escolhaDatas: string;
  escolhaSaida: string;
  minimo: string;
  avisoFimDeSemana: string;
  incluirFimDeSemana: string;
  avisoPacote: string;
  /** "Incluir o {pacote}" e, quando o feriado tem mais de uma opção, "Incluir o {pacote} de {n} diárias". */
  incluirPacote: string;
  incluirPacoteDe: string;
  mudarChegada: string;
  mudarSaida: string;
  /** "{diarias}, de {de} a {ate}": o resultado de um ajuste e as datas da conta. */
  ajusteResultado: string;
  avisoOcupada: string;
  avisoDatas: string;
  avisoPreco: string;
  reservarTitulo: string;
  diariaAPartir: string;
  noPix: string;
  noCartao: string;
  chegada: string;
  saida: string;
  hospedes: string;
  diminuir: string;
  aumentar: string;
  nDiarias: string;
  umaDiaria: string;
  linhaSemana: string;
  linhaSemanaUma: string;
  linhaFimDeSemana: string;
  linhaFimDeSemanaUma: string;
  linhaFeriado: string;
  linhaFeriadoUma: string;
  linhaTemporada: string;
  linhaTemporadaUma: string;
  linhaPacote: string;
  contaTitulo: string;
  /** Os títulos das colunas da conta, pela forma de pagamento do sinal. */
  colunaPix: string;
  colunaCartao: string;
  total: string;
  sinalHoje: string;
  naChegada: string;
  chegadaComo: string;
  pixNoTotal: string;
  incluido: string;
  semCaucao: string;
  verValores: string;
  verDatas: string;
  /** "{diarias} · {de} a {ate}", na barra do celular. */
  barraDatas: string;
  reservar: string;
  reservaEmBreve: string;
  pedir: string;
  avisemeTitulo: string;
  avisemeTexto: string;
  rotuloMensagem: string;
  /** "{n} hóspedes", para a mensagem do "Avise-me". */
  hospedesN: string;
  fechar: string;
  /** "≈ US$ {v}". */
  dolar: string;
}

const LINHA: Record<LinhaDaConta['tipo'], [keyof TextosReservaCasa, keyof TextosReservaCasa]> = {
  semana: ['linhaSemanaUma', 'linhaSemana'],
  'fim-de-semana': ['linhaFimDeSemanaUma', 'linhaFimDeSemana'],
  feriado: ['linhaFeriadoUma', 'linhaFeriado'],
  temporada: ['linhaTemporadaUma', 'linhaTemporada'],
  pacote: ['linhaPacote', 'linhaPacote'],
};

/** Quantas etiquetas de pacote aparecem antes do "Ver os N pacotes": 3 no celular, 4 no computador. */
const ETIQUETAS_CELULAR = 3;
const ETIQUETAS_COMPUTADOR = 4;

/**
 * Preço e datas da casa (Etapa 7, partes 7 e E). Duas peças, lado a lado no computador e uma embaixo da outra no
 * celular: o calendário (com as regras, os pacotes e, logo abaixo dele, o resumo da conta ou o aviso com os ajustes de
 * um toque) e o quadro da reserva (a diária a partir de, os hóspedes, o botão e a conta inteira, no Pix e no cartão). A
 * conta é a de src/lib/estadia.ts, a mesma que o servidor refaz antes de cobrar. Enquanto a venda das casas está
 * fechada, no lugar do botão de reservar fica o aviso e o "Avise-me".
 *
 * As duas peças moram num bloco #reservar: no celular, a barra fixa (com as datas e o total, depois de escolher) leva
 * até ele e some enquanto ele aparece; no computador, o bloco se desfaz (display: contents) e cada peça vai para a sua
 * coluna da página.
 */
export function ReservaCasa({
  tabela,
  ocupadas,
  hojeServidor,
  capacidade,
  nomeCasa,
  reservaAberta,
  hrefReserva,
  idioma,
  locale,
  dolar,
  notaCambio,
  textos: T,
  textosCotacao,
}: {
  tabela: TabelaEstadia;
  /** As noites já reservadas ou bloqueadas, de hoje em diante (AAAA-MM-DD). */
  ocupadas: string[];
  /** O primeiro dia de entrada possível quando a página foi feita; o aparelho confere de novo ao abrir. */
  hojeServidor: string;
  capacidade: number;
  nomeCasa: string;
  /** false até o pagamento das casas existir: no lugar do botão, o aviso e o "Avise-me". */
  reservaAberta: boolean;
  hrefReserva: string;
  idioma: Idioma;
  locale: string;
  /** Reais por dólar, só em espanhol e inglês (null: sem o ≈ US$). */
  dolar: number | null;
  notaCambio: string;
  textos: TextosReservaCasa;
  textosCotacao: TextosCotacao;
}) {
  const ocupadasSet = useMemo(() => new Set(ocupadas), [ocupadas]);
  const [hoje, setHoje] = useState(hojeServidor);
  useEffect(() => setHoje(primeiraEntradaPossivel()), []);
  // o calendário abre no mês da primeira noite livre (e não num mês todo bloqueado)
  const [mes, setMes] = useState(() => primeiraNoiteLivre(hojeServidor, new Set(ocupadas)).slice(0, 7));
  const [datas, setDatas] = useState({ entrada: '', saida: '' });
  // as opções do feriado que o cliente tocou (o Réveillon de 4 ou de 5 diárias)
  const [opcoes, setOpcoes] = useState<Pacote[] | null>(null);
  const [hospedes, setHospedes] = useState(Math.min(2, capacidade));
  const [todosPacotes, setTodosPacotes] = useState(false);
  // a cada saída escolhida (ou ajuste), o resumo ou o aviso embaixo do calendário entra na tela
  const [revelar, setRevelar] = useState(0);
  const resultado = useRef<HTMLDivElement>(null);

  const pacoteDaNoite = useMemo(() => pacotePorNoite(tabela.pacotes), [tabela.pacotes]);
  // um pacote com noite ocupada não se vende; o feriado sem opção livre sai das etiquetas
  const livre = (p: Pacote) => noitesDoPacote(p).every((n) => !ocupadasSet.has(n));
  const grupos = gruposDePacotes(tabela.pacotes.filter((p) => p.entrada >= hoje && livre(p)));
  const menor = menorDiariaCentavos(tabela);
  // Argentina e Chile começam a semana na segunda; Brasil e EUA, no domingo
  const inicioDaSemana = idioma === 'es' || idioma === 'es-ar' ? 1 : 0;

  const nome = (p: Pacote) => texto(p.nome, idioma);
  const cifra = (centavos: number) => formatarCifra(centavos, locale);
  const usd = (centavos: number) => textoDolar(centavos, dolar, T.dolar, locale);
  const formatoCurtoEn = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const formatoComAnoEn = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const formatoDiaDaSemana = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const formatoLongo = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const dia = (dataIso: string) => new Date(`${dataIso}T12:00:00Z`);
  // "28/12" em português e espanhol (o Intl do es-AR escreve "2/1" para 02/01); "Dec 28" em inglês
  const curta = (dataIso: string) =>
    idioma === 'en' ? formatoCurtoEn.format(dia(dataIso)) : `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}`;
  // nas etiquetas, o pacote do ano seguinte leva o ano ("12/11/2027"): o 12/11 deste ano acabou de passar
  const curtaComAno = (dataIso: string) =>
    dataIso.slice(0, 4) <= hoje.slice(0, 4)
      ? curta(dataIso)
      : idioma === 'en'
        ? formatoComAnoEn.format(dia(dataIso))
        : `${curta(dataIso)}/${dataIso.slice(0, 4)}`;
  // "qui 10/12" e "jue 10/12"; "Thu, Dec 10" em inglês
  const comDia = (dataIso: string) => {
    const semana = formatoDiaDaSemana.format(dia(dataIso)).replace(/\.$/, '');
    return idioma === 'en' ? `${semana}, ${curta(dataIso)}` : `${semana} ${curta(dataIso)}`;
  };
  const longa = (dataIso: string) => formatoLongo.format(dia(dataIso));
  const opcaoTexto = (p: Pacote) => fmt(T.pacoteOpcao, { n: noitesDoPacote(p).length, de: curta(p.entrada), ate: curta(p.saida) });
  const nDiarias = (n: number) => (n === 1 ? T.umaDiaria : fmt(T.nDiarias, { n }));
  const estadiaTexto = (de: string, ate: string, n: number) =>
    fmt(T.ajusteResultado, { diarias: nDiarias(n), de: comDia(de), ate: comDia(ate) });

  const { entrada, saida } = datas;
  const opcoesConta = { ocupadas: ocupadasSet, hoje };
  const conta = entrada && saida ? contaEstadia(tabela, entrada, saida, opcoesConta) : null;
  const ajustes = conta && !conta.ok ? ajustesDaEstadia(tabela, entrada, saida, opcoesConta) : [];

  useEffect(() => {
    if (!revelar) return;
    const el = resultado.current;
    if (!el) return;
    const caixa = el.getBoundingClientRect();
    // escondido (no computador, o resumo fica no quadro ao lado) ou já à vista: nada a fazer
    if (!caixa.height || (caixa.top >= 0 && caixa.bottom <= window.innerHeight)) return;
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'nearest' });
  }, [revelar]);

  const escolherPacote = (p: Pacote) => {
    setDatas({ entrada: p.entrada, saida: p.saida });
    setMes(p.entrada.slice(0, 7));
    const doFeriado = opcoesDoPacote(tabela.pacotes, p);
    setOpcoes(doFeriado.length > 1 ? doFeriado : null);
    setRevelar((n) => n + 1);
  };
  const tocarGrupo = (grupo: Pacote[]) => {
    if (grupo.length === 1) return escolherPacote(grupo[0]);
    setOpcoes(grupo);
    setMes(grupo[0].entrada.slice(0, 7));
    setDatas({ entrada: '', saida: '' });
  };
  const tocarDia = (diaTocado: string) => {
    if (entrada && !saida && diaTocado > entrada) {
      setDatas({ entrada, saida: diaTocado });
      setRevelar((n) => n + 1);
      return;
    }
    // uma noite de pacote leva o pacote inteiro; se ela está em mais de uma opção do feriado, o cliente escolhe
    const doPacote = pacotesDaNoite(tabela.pacotes, diaTocado);
    if (doPacote.length === 1) return escolherPacote(doPacote[0]);
    if (doPacote.length > 1) {
      setOpcoes(opcoesDoPacote(tabela.pacotes, doPacote[0]));
      setDatas({ entrada: '', saida: '' });
      return;
    }
    setOpcoes(null);
    setDatas({ entrada: diaTocado, saida: '' });
  };
  const ajustar = (novas: { entrada: string; saida: string }) => {
    setDatas(novas);
    setMes(novas.entrada.slice(0, 7));
    setRevelar((n) => n + 1);
  };
  const limpar = () => {
    setDatas({ entrada: '', saida: '' });
    setOpcoes(null);
  };
  const irParaCalendario = () => {
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('datas-casa')?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  };

  // o que o calendário diz embaixo dele quando a escolha esbarra numa regra
  let aviso = '';
  if (!entrada) aviso = opcoes ? '' : T.escolhaDatas;
  else if (!saida) aviso = T.escolhaSaida;
  else if (conta && !conta.ok) {
    if (conta.motivo === 'minimo') aviso = fmt(T.minimo, { n: conta.minimoNoites });
    else if (conta.motivo === 'fim-de-semana') aviso = fmt(T.avisoFimDeSemana, { n: NOITES_LIVRES_DO_FIM_DE_SEMANA });
    else if (conta.motivo === 'pacote' && conta.pacoteIncompleto?.length)
      aviso = fmt(T.avisoPacote, { pacote: nome(conta.pacoteIncompleto[0]) });
    else aviso = conta.motivo === 'ocupada' ? T.avisoOcupada : conta.motivo === 'preco' ? T.avisoPreco : T.avisoDatas;
  }
  const rotuloDoAjuste = (a: AjusteDeDatas) => {
    // dois pacotes de uma vez (a estadia que pega o Natal e o Réveillon): os dois nomes
    if (a.tipo === 'pacote' && a.pacotes && a.pacotes.length > 1)
      return fmt(T.incluirPacote, {
        pacote: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(a.pacotes.map(nome)),
      });
    if (a.tipo === 'pacote' && a.pacote) {
      const variasOpcoes = opcoesDoPacote(tabela.pacotes, a.pacote).length > 1;
      return variasOpcoes
        ? fmt(T.incluirPacoteDe, { pacote: nome(a.pacote), n: noitesDoPacote(a.pacote).length })
        : fmt(T.incluirPacote, { pacote: nome(a.pacote) });
    }
    return a.tipo === 'fim-de-semana' ? T.incluirFimDeSemana : a.tipo === 'chegada' ? T.mudarChegada : T.mudarSaida;
  };

  const textoDaLinha = (l: LinhaDaConta) => {
    const [uma, varias] = LINHA[l.tipo];
    return fmt(T[l.noites === 1 ? uma : varias], { n: l.noites, valor: cifra(l.diariaCentavos), pacote: l.pacote ? nome(l.pacote) : '' });
  };
  const valor = (centavos: number, forte = false): ReactNode => (
    <>
      <span className={`numeros ${forte ? 'cifra text-lead' : 'font-semibold'}`}>{cifra(centavos)}</span>
      {usd(centavos) && <span className="block text-caption font-normal text-(--color-tinta-suave)">{usd(centavos)}</span>}
    </>
  );

  const mensagem = [
    nomeCasa,
    conta?.ok ? fmt('{de} – {ate}', { de: longa(entrada), ate: longa(saida) }) : '',
    fmt(T.hospedesN, { n: hospedes }),
  ]
    .filter(Boolean)
    .join(' · ');
  const consulta = new URLSearchParams({ chegada: entrada, saida, hospedes: String(hospedes) });

  // as etiquetas além das 3 primeiras (celular) ou das 4 primeiras (computador) esperam o "Ver os N pacotes"
  const classeDaEtiqueta = (i: number) =>
    todosPacotes || i < ETIQUETAS_CELULAR ? undefined : i < ETIQUETAS_COMPUTADOR ? 'hidden lg:block' : 'hidden';
  const comBotaoDeTodos = grupos.length > ETIQUETAS_CELULAR;

  return (
    <>
      {menor !== null && (
        <BarraCasa
          rotulo={
            conta?.ok
              ? fmt(T.barraDatas, { diarias: nDiarias(conta.noites.length), de: curta(entrada), ate: curta(saida) })
              : T.diariaAPartir
          }
          pix={cifra(conta?.ok ? conta.totalPixCentavos : precoPixCentavos(menor))}
          noPix={T.noPix}
          cartao={cifra(conta?.ok ? conta.totalCentavos : menor)}
          noCartao={T.noCartao}
          botao={conta?.ok ? T.verValores : T.verDatas}
          href={conta?.ok ? '#conta-casa' : '#datas-casa'}
        />
      )}

      <div id="reservar" className="reserva-casa">
        <section id="datas-casa" className="reserva-casa-datas" aria-labelledby="datas-titulo">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="datas-titulo" className="titulo-casa">
              {T.datasTitulo}
            </h2>
            {(entrada || opcoes) && (
              <button type="button" className="link min-h-11 shrink-0 text-small font-semibold" onClick={limpar}>
                {T.limpar}
              </button>
            )}
          </div>
          <p className="linha-pontuada regras-calendario">
            <span>
              <span className="pedaco">{T.regraHorario}</span>
              {tabela.minimoNoites > 1 && <span className="pedaco">{fmt(T.regraMinimo, { n: tabela.minimoNoites })}</span>}
              {tabela.fimDeSemanaJunto && <span className="pedaco">{T.regraFimDeSemana}</span>}
            </span>
          </p>
          {tabela.diariaCentavos > 0 && (
            <p className="mt-2 text-small text-(--color-tinta-suave)">
              {tabela.diariaFimDeSemanaCentavos
                ? fmt(T.diariasDaCasa, { semana: cifra(tabela.diariaCentavos), fimDeSemana: cifra(tabela.diariaFimDeSemanaCentavos) })
                : fmt(T.diariaUnica, { semana: cifra(tabela.diariaCentavos) })}
            </p>
          )}

          {grupos.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold">{T.pacotesTitulo}</h3>
              <p className="mt-1 text-small text-(--color-tinta-suave)">{T.pacotesTexto}</p>
              <ul className="pacotes-casa">
                {grupos.map((g, i) => {
                  const ativo = conta?.pacotes.some((p) => g.includes(p)) || (opcoes !== null && opcoes[0] === g[0]);
                  return (
                    <li key={`${g[0].entrada}-${g[0].saida}`} className={classeDaEtiqueta(i)}>
                      <button type="button" className="etiqueta-pacote" aria-pressed={ativo} onClick={() => tocarGrupo(g)}>
                        {nome(g[0])}
                        <span className="numeros font-normal">{curtaComAno(g[0].entrada)}</span>
                      </button>
                    </li>
                  );
                })}
                {comBotaoDeTodos && (
                  <li className={grupos.length <= ETIQUETAS_COMPUTADOR ? 'lg:hidden' : undefined}>
                    <button
                      type="button"
                      className="link pacotes-casa-todos"
                      aria-expanded={todosPacotes}
                      onClick={() => setTodosPacotes((v) => !v)}
                    >
                      {todosPacotes ? T.menosPacotes : fmt(T.verPacotes, { n: grupos.length })}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}

          {opcoes && (
            <div className="pacote-opcoes" role="group" aria-labelledby="pacote-opcoes-titulo">
              <p id="pacote-opcoes-titulo" className="font-semibold">
                {fmt(T.pacoteOpcoes, { pacote: nome(opcoes[0]) })}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {opcoes.map((p) => {
                  const v = partesDaEstadia(noitesDoPacote(p).length * p.diariaCentavos);
                  return (
                    <button
                      key={`${p.entrada}-${p.saida}`}
                      type="button"
                      className="pacote-opcao"
                      aria-pressed={entrada === p.entrada && saida === p.saida}
                      disabled={!livre(p)}
                      onClick={() => escolherPacote(p)}
                    >
                      <span className="block font-semibold">{opcaoTexto(p)}</span>
                      <span className="mt-1 block text-small">
                        <span className="numeros font-semibold">{cifra(v.totalPixCentavos)}</span>{' '}
                        <span className="text-(--color-sucesso)">{T.noPix}</span>
                      </span>
                      <span className="block text-small text-(--color-tinta-suave)">
                        <span className="numeros">{cifra(v.totalCentavos)}</span> {T.noCartao}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="cal-caixa">
            <CalendarioCasa
              mes={mes}
              aoMudarMes={setMes}
              hoje={hoje}
              ocupadas={ocupadasSet}
              pacoteDaNoite={pacoteDaNoite}
              nomeDoPacote={nome}
              entrada={entrada}
              saida={saida}
              aoTocar={tocarDia}
              locale={locale}
              inicioDaSemana={inicioDaSemana}
              textos={T}
            />
            <ul className="cal-legenda" aria-hidden="true">
              {tabela.pacotes.length > 0 && (
                <li>
                  <span className="cal-legenda-pacote" />
                  {T.legendaPacote}
                </li>
              )}
              {ocupadas.length > 0 && (
                <li>
                  <span className="cal-legenda-ocupada">13</span>
                  {T.legendaOcupada}
                </li>
              )}
            </ul>
          </div>

          {/* embaixo do calendário: o resumo da conta (no celular; no computador ela está no quadro ao lado) ou o aviso
              da regra, com os ajustes de um toque já resolvidos até as datas finais */}
          <div ref={resultado} className="aviso-calendario" aria-live="polite">
            {conta?.ok ? (
              <div className="resumo-estadia lg:hidden">
                <p className="font-semibold">{estadiaTexto(entrada, saida, conta.noites.length)}</p>
                <p className="linha-pontuada mt-1.5">
                  <span>
                    <span className="pedaco">
                      {T.total} <strong className="cifra text-lead">{cifra(conta.totalPixCentavos)}</strong>{' '}
                      <span className="text-small font-semibold text-(--color-sucesso)">{T.noPix}</span>
                    </span>
                    <span className="pedaco text-small">
                      {fmt(T.sinalHoje, { p: SINAL_PORCENTO })}{' '}
                      <span className="numeros font-semibold">{cifra(conta.sinalPixCentavos)}</span> {T.noPix}
                    </span>
                  </span>
                </p>
                <a href="#conta-casa" className="link mt-1 inline-flex min-h-11 items-center font-semibold">
                  {T.verValores}
                </a>
              </div>
            ) : (
              <>
                {aviso && <p>{aviso}</p>}
                {ajustes.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {ajustes.map((a) => (
                      <button
                        key={`${a.entrada}-${a.saida}`}
                        type="button"
                        className="ajuste-datas"
                        onClick={() => ajustar({ entrada: a.entrada, saida: a.saida })}
                      >
                        <span className="block font-semibold">{rotuloDoAjuste(a)}</span>
                        <span className="mt-0.5 block text-small text-(--color-tinta-suave)">
                          {estadiaTexto(a.entrada, a.saida, a.noites)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="reserva-casa-caixa" aria-labelledby="reserva-titulo">
          <h2 id="reserva-titulo" className="text-lead font-semibold">
            {T.reservarTitulo}
          </h2>

          {!conta?.ok && menor !== null && (
            <div className="mt-3">
              <p className="text-small text-(--color-tinta-suave) first-letter:uppercase">{T.diariaAPartir}</p>
              <p className="linha-pontuada mt-1">
                <span>
                  <span className="pedaco">
                    <strong className="cifra text-figure">{cifra(precoPixCentavos(menor))}</strong>{' '}
                    <span className="text-small font-semibold text-(--color-sucesso)">{T.noPix}</span>
                  </span>
                  {usd(precoPixCentavos(menor)) && (
                    <span className="pedaco text-small text-(--color-tinta-suave)">{usd(precoPixCentavos(menor))}</span>
                  )}
                </span>
              </p>
              <p className="linha-pontuada text-small text-(--color-tinta-suave)">
                <span>
                  <span className="pedaco">
                    <span className="numeros font-semibold text-(--color-tinta)">{cifra(menor)}</span> {T.noCartao}
                  </span>
                  {usd(menor) && <span className="pedaco">{usd(menor)}</span>}
                </span>
              </p>
            </div>
          )}

          {/* no computador, as datas em campos (tocar leva ao calendário); no celular, o calendário fica logo acima */}
          <div className="mt-4 hidden grid-cols-2 gap-1.5 lg:grid">
            {(
              [
                [T.chegada, entrada],
                [T.saida, saida],
              ] as const
            ).map(([rotulo, data]) => (
              <button key={rotulo} type="button" className="data-casa" onClick={irParaCalendario}>
                <span className="block text-caption text-(--color-tinta-suave)">{rotulo}</span>
                <span className="block font-semibold">{data ? longa(data) : '—'}</span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Contador rotulo={T.hospedes} valor={hospedes} min={1} max={capacidade} aoMudar={setHospedes} textos={T} />
          </div>

          {conta?.ok && (
            <div id="conta-casa" className="conta-casa lg:order-2">
              <p className="font-semibold">{estadiaTexto(entrada, saida, conta.noites.length)}</p>
              <ul className="mt-1.5 grid gap-1 text-small">
                {linhasDaConta(conta.noites).map((l) => (
                  <li key={`${l.tipo}-${l.diariaCentavos}-${l.pacote?.entrada ?? ''}`} className="flex justify-between gap-4">
                    <span>{textoDaLinha(l)}</span>
                    <span className="numeros shrink-0">{cifra(l.noites * l.diariaCentavos)}</span>
                  </li>
                ))}
              </ul>
              <table className="conta-casa-tabela">
                <caption className="sr-only">{T.contaTitulo}</caption>
                <thead>
                  <tr>
                    <td />
                    <th scope="col">
                      <span className="text-(--color-sucesso)">{T.colunaPix}</span>
                      <span className="block text-caption font-normal text-(--color-tinta-suave)">
                        {fmt(T.pixNoTotal, { p: DESCONTO_PIX_PORCENTO })}
                      </span>
                    </th>
                    <th scope="col">{T.colunaCartao}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{T.total}</th>
                    <td>{valor(conta.totalPixCentavos, true)}</td>
                    <td>{valor(conta.totalCentavos)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{fmt(T.sinalHoje, { p: SINAL_PORCENTO })}</th>
                    <td>{valor(conta.sinalPixCentavos)}</td>
                    <td>{valor(conta.sinalCentavos)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{T.naChegada}</th>
                    <td>{valor(conta.chegadaPixCentavos)}</td>
                    <td>{valor(conta.chegadaCentavos)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-small text-(--color-tinta-suave)">{T.chegadaComo}</p>
            </div>
          )}

          {/* no computador, o botão sobe para logo depois dos hóspedes: o quadro preso no topo nunca o esconde */}
          <div className="mt-5 lg:order-1">
            {reservaAberta ? (
              <a
                href={conta?.ok ? `${hrefReserva}?${consulta.toString()}` : undefined}
                aria-disabled={!conta?.ok}
                className={`botao w-full ${conta?.ok ? '' : 'pointer-events-none'}`}
              >
                {fmt(T.reservar, { p: SINAL_PORCENTO })}
              </a>
            ) : (
              <>
                <p className="em-breve-casa">{T.reservaEmBreve}</p>
                <FolhaCasa rotulo={T.pedir} titulo={T.avisemeTitulo} fechar={T.fechar} classeBotao="botao mt-2 w-full">
                  <p>{T.avisemeTexto}</p>
                  <FormularioCotacao
                    key={mensagem}
                    tipo="casa"
                    idioma={idioma}
                    rotuloMensagem={T.rotuloMensagem}
                    botao={T.pedir}
                    mensagemInicial={mensagem}
                    textos={textosCotacao}
                  />
                </FolhaCasa>
              </>
            )}
          </div>

          <p className="linha-pontuada incluido-casa lg:order-2">
            <span>
              <span className="pedaco">{T.incluido}</span>
              <span className="pedaco">{T.semCaucao}</span>
            </span>
          </p>
          {dolar && notaCambio && <p className="mt-3 text-caption text-(--color-tinta-suave) lg:order-2">{notaCambio}</p>}
        </aside>
      </div>
    </>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import {
  IDS_LUGARES,
  primeiroDiaTransfer,
  LUGARES,
  VEICULOS,
  cabeNaVan,
  cabeNoCarro,
  precoTrecho,
  type IdLugar,
  type Idioma,
  type Malas,
  type Veiculo,
} from '@/data/transfer';
import type { TrechoEscolhido } from '@/lib/carrinho';
import type { PontaCotacao, TextosCotacao } from '@/lib/cotacao';
import { formatarCifra } from '@/lib/cifra';
import { textoDolar } from '@/lib/dolar';
import { precoPixCentavos } from '@/lib/orcamento';
import { rastrear } from '@/lib/pixel';
import { hojeEmBuzios, somarDias } from '@/lib/validacao';
import { CampoData } from '../CampoData';
import { FormularioCotacao } from '../FormularioCotacao';
import { useCarrinho } from '../carrinho/CarrinhoContexto';
import { Cifra } from '../Cifra';
import { Contador } from '../grupo/Contador';
import { useGrupo } from '../grupo/GrupoContexto';

export interface TextosTransfer {
  reservarTitulo: string;
  saida: string;
  destino: string;
  escolha: string;
  aeroportos: string;
  cidades: string;
  endereco: string;
  outraCidade: string;
  inverter: string;
  data: string;
  escolhaData: string;
  hora: string;
  horaAjudaAeroporto: string;
  idaVolta: string;
  volta: string;
  mudarVolta: string;
  dataVolta: string;
  horaVolta: string;
  passageiros: string;
  passageirosAjuda: string;
  malas: string;
  malasGrandes: string;
  malasMedias: string;
  malasMao: string;
  veiculo: string;
  ateNPessoas: string;
  naoCabe: string;
  sobCotacao: string;
  total: string;
  totalIdaVolta: string;
  escolhaTrajeto: string;
  trajetoIncompleto: string;
  erroData: string;
  erroHora: string;
  erroVolta: string;
  sobCotacaoTitulo: string;
  sobCotacaoTexto: string;
  grupoGrande: string;
  pedirCotacao: string;
  cotacao: TextosCotacao;
  diminuir: string;
  aumentar: string;
  noPix: string;
  noCartao: string;
  /** "≈ US$ {v}" */
  dolar: string;
  adicionar: string;
  reservarAgora: string;
  adicionando: string;
  erroAdicionar: string;
  cheio: string;
}

interface Ponta {
  lugar: IdLugar | '';
  endereco: string;
  /** Só para "Outra cidade". */
  cidade: string;
}

const PONTA_VAZIA: Ponta = { lugar: '', endereco: '', cidade: '' };

/** Saída ou destino: o lugar da lista e, fora dos aeroportos, o hotel, a pousada ou o endereço. */
function CampoPonta({
  rotulo,
  valor,
  aoMudar,
  idioma,
  T,
}: {
  rotulo: string;
  valor: Ponta;
  aoMudar: (p: Ponta) => void;
  idioma: Idioma;
  T: TextosTransfer;
}) {
  const id = useId();
  const lugar = valor.lugar ? LUGARES[valor.lugar] : null;
  const aeroportos = IDS_LUGARES.filter((l) => LUGARES[l].aeroporto);
  const cidades = IDS_LUGARES.filter((l) => !LUGARES[l].aeroporto);
  return (
    <div>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <select id={id} className="campo" value={valor.lugar} onChange={(e) => aoMudar({ ...valor, lugar: e.target.value as IdLugar | '' })}>
        <option value="">{T.escolha}</option>
        <optgroup label={T.aeroportos}>
          {aeroportos.map((l) => (
            <option key={l} value={l}>
              {LUGARES[l].nome[idioma]}
            </option>
          ))}
        </optgroup>
        <optgroup label={T.cidades}>
          {cidades.map((l) => (
            <option key={l} value={l}>
              {LUGARES[l].nome[idioma]}
            </option>
          ))}
        </optgroup>
      </select>
      {lugar?.zona === 'outra' && (
        <>
          <label htmlFor={`${id}-cidade`} className="sr-only">
            {T.outraCidade}
          </label>
          <input
            id={`${id}-cidade`}
            className="campo mt-1.5"
            placeholder={T.outraCidade}
            value={valor.cidade}
            maxLength={80}
            onChange={(e) => aoMudar({ ...valor, cidade: e.target.value })}
          />
        </>
      )}
      {lugar && !lugar.aeroporto && (
        <>
          <label htmlFor={`${id}-end`} className="sr-only">
            {T.endereco}
          </label>
          <input
            id={`${id}-end`}
            className="campo mt-1.5"
            placeholder={T.endereco}
            value={valor.endereco}
            maxLength={160}
            autoComplete="street-address"
            onChange={(e) => aoMudar({ ...valor, endereco: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

/**
 * Cartão do transfer: saída e destino, data e horário, ida e volta, passageiros e malas. Com o trajeto
 * escolhido, mostra o preço do carro e da van (o que cabe o grupo vem marcado) ou, sem preço fixo,
 * o pedido de cotação por e-mail.
 */
export function WidgetTransfer({
  idioma,
  locale,
  finalizarHref,
  dolar = null,
  textos: T,
}: {
  idioma: Idioma;
  locale: string;
  /** O checkout único, para onde o "Reservar agora" leva com o transfer já no carrinho. */
  finalizarHref: string;
  /** Reais por dólar, para o "≈ US$" das páginas em espanhol e inglês (null no português). */
  dolar?: number | null;
  textos: TextosTransfer;
}) {
  const router = useRouter();
  const { grupo, pronto } = useGrupo();
  const [hoje, setHoje] = useState('');
  const [saida, setSaida] = useState<Ponta>(PONTA_VAZIA);
  const [destino, setDestino] = useState<Ponta>(PONTA_VAZIA);
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [idaVolta, setIdaVolta] = useState(false);
  // depois que a pessoa marca ou desmarca a volta, a escolha dela vale (o site para de sugerir)
  const [voltaMexida, setVoltaMexida] = useState(false);
  const [voltaEditada, setVoltaEditada] = useState(false);
  const [voltaSaida, setVoltaSaida] = useState<Ponta>(PONTA_VAZIA);
  const [voltaDestino, setVoltaDestino] = useState<Ponta>(PONTA_VAZIA);
  const [dataVolta, setDataVolta] = useState('');
  const [horaVolta, setHoraVolta] = useState('');
  const [pessoas, setPessoas] = useState(2);
  const [malas, setMalas] = useState<Malas>({ grandes: 0, medias: 0, mao: 0 });
  const [escolhido, setEscolhido] = useState<Veiculo | null>(null);
  const [enviando, setEnviando] = useState<'' | 'agora' | 'carrinho'>('');
  const { itens, carregado, adicionar } = useCarrinho();
  // o item do carrinho que o cliente está mudando (?mudar=): o cartão abre com o que ele tinha escolhido
  const [mudando, setMudando] = useState('');
  const idData = useId();
  const idHora = useId();
  const idDataVolta = useId();
  const idHoraVolta = useId();

  // o cartão da cidade abre o transfer com o destino escolhido (?destino=buzios)
  useEffect(() => {
    setHoje(hojeEmBuzios());
    const d = new URLSearchParams(window.location.search).get('destino');
    if (d && (IDS_LUGARES as string[]).includes(d)) setDestino({ ...PONTA_VAZIA, lugar: d as IdLugar });
  }, []);

  // o transfer começa com o grupo e a data escolhidos no site
  const aplicado = useRef(false);
  useEffect(() => {
    if (!pronto || aplicado.current) return;
    aplicado.current = true;
    setPessoas(Math.min(17, Math.max(1, grupo.adultos + grupo.criancas6a10 + grupo.criancas0a5)));
    // transfer só a partir de amanhã: a data do grupo entra se ainda der
    if (grupo.data && grupo.data >= primeiroDiaTransfer(hojeEmBuzios())) setData(grupo.data);
  }, [pronto, grupo]);

  const mudarLido = useRef(false);
  useEffect(() => {
    if (!pronto || !carregado || mudarLido.current) return;
    mudarLido.current = true;
    const id = new URLSearchParams(window.location.search).get('mudar');
    const e = itens.find((i) => i.id === id)?.escolha;
    if (!id || e?.tipo !== 'transfer') return;
    const ponta = (p: TrechoEscolhido['saida']): Ponta => ({ ...PONTA_VAZIA, lugar: p.lugar, endereco: p.endereco ?? '' });
    setMudando(id);
    setSaida(ponta(e.ida.saida));
    setDestino(ponta(e.ida.destino));
    setData(e.ida.data);
    setHora(e.ida.hora);
    setVoltaMexida(true);
    setIdaVolta(Boolean(e.volta));
    if (e.volta) {
      setVoltaEditada(true);
      setVoltaSaida(ponta(e.volta.saida));
      setVoltaDestino(ponta(e.volta.destino));
      setDataVolta(e.volta.data);
      setHoraVolta(e.volta.hora);
    }
    setPessoas(e.passageiros);
    setMalas(e.malas);
    setEscolhido(e.veiculo);
  }, [pronto, carregado, itens]);

  // ida e volta: marcada quando sai de um aeroporto (quem chega, volta); desmarcada quando vai para um
  useEffect(() => {
    if (voltaMexida) return;
    if (saida.lugar && LUGARES[saida.lugar].aeroporto) setIdaVolta(true);
    else if (destino.lugar && LUGARES[destino.lugar].aeroporto) setIdaVolta(false);
  }, [saida.lugar, destino.lugar, voltaMexida]);

  // a volta faz o caminho inverso, até a pessoa mudar
  const vSaida = voltaEditada ? voltaSaida : destino;
  const vDestino = voltaEditada ? voltaDestino : saida;

  const trechos: [IdLugar, IdLugar][] = [];
  if (saida.lugar && destino.lugar) trechos.push([saida.lugar, destino.lugar]);
  if (idaVolta && vSaida.lugar && vDestino.lugar) trechos.push([vSaida.lugar, vDestino.lugar]);
  const completo = trechos.length === (idaVolta ? 2 : 1);

  const total = (v: Veiculo): number | null => {
    if (!completo) return null;
    let soma = 0;
    for (const [de, para] of trechos) {
      const p = precoTrecho(de, para, v);
      if (p === null) return null;
      soma += p;
    }
    return soma;
  };
  /** O total no Pix, em centavos: cada trecho com o desconto (o mesmo cálculo do checkout). */
  const totalPix = (v: Veiculo): number | null => {
    if (total(v) === null) return null;
    return trechos.reduce((s, [de, para]) => s + precoPixCentavos(Math.round((precoTrecho(de, para, v) ?? 0) * 100)), 0);
  };
  const cabe: Record<Veiculo, boolean> = { carro: cabeNoCarro(pessoas, malas), van: cabeNaVan(pessoas, malas) };
  const sugerido: Veiculo | null = cabe.carro ? 'carro' : cabe.van ? 'van' : null;
  const veiculo = escolhido && cabe[escolhido] ? escolhido : sugerido;
  const precoEscolhido = veiculo ? total(veiculo) : null;
  const cifra = (reais: number) => formatarCifra(Math.round(reais * 100), locale);
  const pixEscolhido = veiculo ? totalPix(veiculo) : null;
  const usd = (reais: number) => textoDolar(Math.round(reais * 100), dolar, T.dolar, locale);

  const nomePonta = (p: Ponta) => {
    if (!p.lugar) return '—';
    const base = p.lugar === 'outra-cidade' ? p.cidade || LUGARES[p.lugar].nome[idioma] : LUGARES[p.lugar].nome[idioma];
    return p.endereco ? `${base}, ${p.endereco}` : base;
  };
  // o que vai para o pedido de cotação: "Outra cidade" leva o nome que o cliente digitou
  const pontaCotacao = (p: Ponta): PontaCotacao => ({
    lugar: p.lugar,
    ...(p.endereco.trim() ? { endereco: p.endereco.trim() } : {}),
    ...(p.lugar === 'outra-cidade' && p.cidade.trim() ? { cidade: p.cidade.trim() } : {}),
  });

  const primeiroDia = hoje ? primeiroDiaTransfer(hoje) : '';
  // fora dos aeroportos, cada ponta precisa do hotel, da pousada ou do endereço
  const pontaOk = (p: Ponta) => Boolean(p.lugar) && (LUGARES[p.lugar as IdLugar].aeroporto || p.endereco.trim().length >= 3);
  function problema(): string {
    if (![saida, destino, ...(idaVolta ? [vSaida, vDestino] : [])].every(pontaOk)) return T.trajetoIncompleto;
    if (!data || (primeiroDia && data < primeiroDia)) return T.erroData;
    if (!hora) return T.erroHora;
    if (idaVolta && (!dataVolta || !horaVolta || `${dataVolta}T${horaVolta}` <= `${data}T${hora}`)) return T.erroVolta;
    return '';
  }
  const [erro, setErro] = useState('');
  // o aviso some assim que a pessoa corrige o que faltava
  useEffect(() => {
    if (erro) setErro(problema());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saida, destino, vSaida, vDestino, data, hora, idaVolta, dataVolta, horaVolta]);

  /** Põe no carrinho: "Adicionar" abre a gaveta; "Reservar agora" segue direto para o checkout. */
  const colocar = async (para: 'agora' | 'carrinho') => {
    if (!veiculo || precoEscolhido === null) return;
    const p = problema();
    if (p) {
      setErro(p);
      return;
    }
    const ponta = (x: Ponta) => ({ lugar: x.lugar as IdLugar, ...(x.endereco.trim() ? { endereco: x.endereco.trim() } : {}) });
    setEnviando(para);
    const r = await adicionar(
      {
        tipo: 'transfer',
        veiculo,
        ida: { saida: ponta(saida), destino: ponta(destino), data, hora },
        ...(idaVolta ? { volta: { saida: ponta(vSaida), destino: ponta(vDestino), data: dataVolta, hora: horaVolta } } : {}),
        passageiros: pessoas,
        malas,
      },
      { abrir: para === 'carrinho', ...(mudando ? { substituir: mudando } : {}) },
    );
    if (r.ok) {
      setMudando('');
      rastrear('AddToCart', { content_ids: ['transfer'], content_type: 'product', value: precoEscolhido, currency: 'BRL' });
      if (para === 'agora') {
        // fica "adicionando" até a página do checkout abrir
        router.push(finalizarHref);
        return;
      }
    } else setErro(r.erro === 'cheio' ? T.cheio : T.erroAdicionar);
    setEnviando('');
  };

  const inverter = () => {
    setSaida(destino);
    setDestino(saida);
  };
  const aeroportoNaIda = Boolean(saida.lugar && LUGARES[saida.lugar].aeroporto);

  return (
    <div id="reservar" className="scroll-mt-24 rounded-cartao border border-(--color-borda) bg-(--color-papel) p-5 sm:p-6">
      <h2 className="text-lead font-semibold">{T.reservarTitulo}</h2>

      <div className="mt-4 grid gap-3">
        <CampoPonta rotulo={T.saida} valor={saida} aoMudar={setSaida} idioma={idioma} T={T} />
        <button
          type="button"
          onClick={inverter}
          className="-my-1 inline-flex min-h-11 items-center gap-2 justify-self-end text-small font-semibold text-(--color-turquesa-texto)"
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <path d="M7 4v15m0 0-4-4m4 4 4-4M17 20V5m0 0-4 4m4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.75" />
          </svg>
          {T.inverter}
        </button>
        <CampoPonta rotulo={T.destino} valor={destino} aoMudar={setDestino} idioma={idioma} T={T} />
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <div>
          <label htmlFor={idData} className="rotulo">
            {T.data}
          </label>
          <CampoData
            id={idData}
            valor={data}
            dica={T.escolhaData}
            min={primeiroDia || undefined}
            max={hoje ? somarDias(hoje, 366) : undefined}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={idHora} className="rotulo">
            {T.hora}
          </label>
          <input id={idHora} type="time" className="campo" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
      </div>
      {aeroportoNaIda && <p className="ajuda">{T.horaAjudaAeroporto}</p>}

      <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
        <input
          type="checkbox"
          checked={idaVolta}
          onChange={(e) => {
            setIdaVolta(e.target.checked);
            setVoltaMexida(true);
          }}
          className="size-6 shrink-0 accent-[var(--color-mar)]"
        />
        {T.idaVolta}
      </label>
      {idaVolta && (
        <div className="mt-2 grid gap-3 rounded-[4px] bg-(--color-superficie) p-3">
          {voltaEditada ? (
            <>
              <CampoPonta
                rotulo={`${T.volta}: ${T.saida.toLowerCase()}`}
                valor={voltaSaida}
                aoMudar={setVoltaSaida}
                idioma={idioma}
                T={T}
              />
              <CampoPonta
                rotulo={`${T.volta}: ${T.destino.toLowerCase()}`}
                valor={voltaDestino}
                aoMudar={setVoltaDestino}
                idioma={idioma}
                T={T}
              />
            </>
          ) : (
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-small">
              <span>
                <strong>{T.volta}:</strong> {nomePonta(vSaida)} → {nomePonta(vDestino)}
              </span>
              <button
                type="button"
                className="link min-h-11 font-semibold"
                onClick={() => {
                  setVoltaSaida(destino);
                  setVoltaDestino(saida);
                  setVoltaEditada(true);
                }}
              >
                {T.mudarVolta}
              </button>
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
            <div>
              <label htmlFor={idDataVolta} className="rotulo">
                {T.dataVolta}
              </label>
              <CampoData
                id={idDataVolta}
                valor={dataVolta}
                dica={T.escolhaData}
                min={data || primeiroDia || undefined}
                onChange={(e) => setDataVolta(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={idHoraVolta} className="rotulo">
                {T.horaVolta}
              </label>
              <input id={idHoraVolta} type="time" className="campo" value={horaVolta} onChange={(e) => setHoraVolta(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <Contador rotulo={T.passageiros} ajuda={T.passageirosAjuda} valor={pessoas} min={1} max={30} aoMudar={setPessoas} textos={T} />
        <fieldset className="min-w-0 space-y-3">
          <legend className="font-semibold">{T.malas}</legend>
          <Contador
            rotulo={T.malasGrandes}
            valor={malas.grandes}
            min={0}
            max={40}
            aoMudar={(v) => setMalas((m) => ({ ...m, grandes: v }))}
            textos={T}
          />
          <Contador
            rotulo={T.malasMedias}
            valor={malas.medias}
            min={0}
            max={40}
            aoMudar={(v) => setMalas((m) => ({ ...m, medias: v }))}
            textos={T}
          />
          <Contador
            rotulo={T.malasMao}
            valor={malas.mao}
            min={0}
            max={40}
            aoMudar={(v) => setMalas((m) => ({ ...m, mao: v }))}
            textos={T}
          />
        </fieldset>
      </div>

      <fieldset className="mt-5 min-w-0">
        <legend className="rotulo">{T.veiculo}</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {(['carro', 'van'] as Veiculo[]).map((v) => {
            const preco = total(v);
            const pix = totalPix(v);
            return (
              <label
                key={v}
                className="filtro cursor-pointer flex-col items-start !gap-0 whitespace-normal py-2.5 text-left has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-turquesa"
                data-ativo={veiculo === v}
              >
                <input
                  type="radio"
                  name="veiculo"
                  value={v}
                  checked={veiculo === v}
                  disabled={!cabe[v]}
                  onChange={() => setEscolhido(v)}
                  className="sr-only"
                />
                <span>{VEICULOS[v].nome[idioma]}</span>
                <span className="text-small font-normal">{T.ateNPessoas.replace('{n}', String(VEICULOS[v].capacidade))}</span>
                <span className="numeros mt-1 text-small">
                  {!cabe[v]
                    ? T.naoCabe
                    : !completo
                      ? '—'
                      : preco === null || pix === null
                        ? T.sobCotacao
                        : `${formatarCifra(pix, locale)} ${T.noPix}`}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!completo ? (
        <p className="mt-5 border-t border-(--color-borda) pt-4 text-small text-(--color-tinta-suave)">{T.escolhaTrajeto}</p>
      ) : veiculo && precoEscolhido !== null ? (
        <>
          <div className="mt-5 border-t border-(--color-borda) pt-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-semibold">
                {idaVolta ? T.totalIdaVolta : T.total} <span className="text-(--color-sucesso)">{T.noPix}</span>
              </span>
              <span aria-hidden="true">
                <Cifra centavos={pixEscolhido ?? 0} locale={locale} className="cifra text-figure-lg" />
              </span>
            </div>
            <p className="mt-1 flex items-baseline justify-between gap-4 text-small text-(--color-tinta-suave)" aria-hidden="true">
              <span>
                {idaVolta ? T.totalIdaVolta : T.total} {T.noCartao}
                {usd(precoEscolhido) && ` · ${usd(precoEscolhido)}`}
              </span>
              <Cifra centavos={Math.round(precoEscolhido * 100)} locale={locale} className="numeros font-semibold text-(--color-tinta)" />
            </p>
            <span className="sr-only" aria-live="polite">
              {`${T.noPix}: ${formatarCifra(pixEscolhido ?? 0, locale)}. ${T.noCartao}: ${cifra(precoEscolhido)}.`}
            </span>
          </div>
          {erro && (
            <p className="mt-4 bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
              {erro}
            </p>
          )}
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => colocar('agora')}
              disabled={Boolean(enviando)}
              aria-busy={enviando === 'agora'}
              className="botao w-full"
            >
              {enviando === 'agora' ? T.adicionando : T.reservarAgora}
            </button>
            <button
              type="button"
              onClick={() => colocar('carrinho')}
              disabled={Boolean(enviando)}
              aria-busy={enviando === 'carrinho'}
              className="botao botao-vazado w-full"
            >
              {enviando === 'carrinho' ? T.adicionando : T.adicionar}
            </button>
          </div>
        </>
      ) : (
        // sem preço fixo (ou grupo maior que a van): o pedido de cotação vai para o painel, já com o trajeto
        <div className="mt-5 border-t border-(--color-borda) pt-4">
          <p className="font-semibold">{T.sobCotacaoTitulo}</p>
          <p className="mt-1 text-small">{veiculo ? T.sobCotacaoTexto : T.grupoGrande}</p>
          <FormularioCotacao
            tipo="transfer"
            idioma={idioma}
            trajeto={{
              ida: { saida: pontaCotacao(saida), destino: pontaCotacao(destino), data, hora },
              ...(idaVolta
                ? { volta: { saida: pontaCotacao(vSaida), destino: pontaCotacao(vDestino), data: dataVolta, hora: horaVolta } }
                : {}),
              passageiros: pessoas,
              malas,
            }}
            telefoneObrigatorio
            rotuloMensagem={T.cotacao.mensagemOpcional}
            botao={T.pedirCotacao}
            textos={T.cotacao}
          />
        </div>
      )}
    </div>
  );
}

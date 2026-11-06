'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { formatarHora, horasDisponiveis, primeiroDiaComHorario } from '@/lib/horarios';
import { textoDolar } from '@/lib/dolar';
import { calcular, normalizarPessoas, precoPixCentavos, totalPixCentavos, type Pessoas, type TabelaPreco } from '@/lib/orcamento';
import type { FaixaContador } from '@/lib/passeio-view';
import { rastrear } from '@/lib/pixel';
import { dataPasseioValida, hojeEmBuzios, somarDias } from '@/lib/validacao';
import { CampoData } from './CampoData';
import { useCarrinho } from './carrinho/CarrinhoContexto';
import { Cifra } from './Cifra';
import { Contador } from './grupo/Contador';
import { pessoasDoGrupo, useGrupo } from './grupo/GrupoContexto';

export interface OpcaoWidget {
  id: string;
  nome: string;
  tabela: TabelaPreco;
}

export interface TextosWidget {
  titulo: string;
  data: string;
  total: string;
  escolhaData: string;
  escolhaOpcao: string;
  unidadesAviso: string;
  pessoa: string;
  pessoas: string;
  unidadeSingular: string;
  unidadePlural: string;
  rotuloUnidade: string;
  aPartirDe: string;
  diminuir: string;
  aumentar: string;
  revisao: string;
  semHorarioHoje: string;
  noPix: string;
  noCartao: string;
  /** "≈ US$ {v}" */
  dolar: string;
  /** "Horário de saída" ou "Horário de busca na hospedagem". */
  rotuloHorario: string;
  escolhaHorario: string;
  adicionar: string;
  reservarAgora: string;
  adicionando: string;
  erroAdicionar: string;
  cheio: string;
}

/**
 * Cartão de reserva: opção, data e pessoas, com o total na hora (no Pix em destaque e no cartão) e,
 * embaixo do botão, as garantias. Abre com o grupo escolhido no site.
 */
export function WidgetReserva({
  slug,
  nome,
  horas,
  opcoes,
  mostrarOpcoes,
  contadores,
  regras,
  locale,
  finalizarHref,
  garantias,
  dolar = null,
  textos: T,
}: {
  slug: string;
  nome: string;
  /** Os horários do passeio ("HH:MM"): quando os de hoje já passaram, a data começa amanhã. */
  horas: string[];
  opcoes: OpcaoWidget[];
  mostrarOpcoes: boolean;
  contadores: FaixaContador[];
  regras: string[];
  locale: string;
  /** O checkout único, para onde o "Reservar agora" leva com o item já no carrinho. */
  finalizarHref: string;
  /** As garantias (cancelamento, chuva, voucher, pagamento) logo abaixo do botão. */
  garantias?: ReactNode;
  /** Reais por dólar, para o "≈ US$" das páginas em espanhol e inglês (null no português). */
  dolar?: number | null;
  textos: TextosWidget;
}) {
  const router = useRouter();
  const { grupo, alterar, pronto } = useGrupo();
  const [opcaoId, setOpcaoId] = useState(opcoes[0].id);
  const [hoje, setHoje] = useState('');
  const [primeiroDia, setPrimeiroDia] = useState('');
  const [pessoas, setPessoas] = useState<Pessoas>(() => normalizarPessoas(opcoes[0].tabela, { adultos: 2 }));
  const [erroData, setErroData] = useState(false);
  const [hora, setHora] = useState(horas.length === 1 ? horas[0] : '');
  const [erroHora, setErroHora] = useState(false);
  const [enviando, setEnviando] = useState<'' | 'agora' | 'carrinho'>('');
  const [erroEnvio, setErroEnvio] = useState('');
  const { itens, carregado, adicionar } = useCarrinho();
  // o item do carrinho que o cliente está mudando (?mudar=): o cartão abre com o que ele tinha escolhido
  const [mudando, setMudando] = useState('');
  const dataRef = useRef<HTMLInputElement>(null);
  const idData = useId();
  const idHora = useId();
  const idioma = locale.slice(0, 2) as Idioma;
  const opcao = opcoes.find((o) => o.id === opcaoId) ?? opcoes[0];

  // quando o grupo salvo na sessão é lido, a reserva começa com ele
  const aplicado = useRef(false);
  useEffect(() => {
    if (!pronto || aplicado.current) return;
    aplicado.current = true;
    setPessoas(pessoasDoGrupo(grupo, opcoes[0].tabela));
  }, [pronto, grupo, opcoes]);

  const mudarLido = useRef(false);
  useEffect(() => {
    if (!pronto || !carregado || mudarLido.current) return;
    mudarLido.current = true;
    const id = new URLSearchParams(window.location.search).get('mudar');
    const e = itens.find((i) => i.id === id)?.escolha;
    if (!id || e?.tipo !== 'passeio' || e.slug !== slug) return;
    setMudando(id);
    if (e.opcao) setOpcaoId(e.opcao);
    alterar({ data: e.data });
    setHora(e.hora);
    setPessoas({ adultos: e.adultos, criancasMeia: e.meia, criancasGratis: e.gratis });
  }, [pronto, carregado, itens, slug, alterar]);

  useEffect(() => {
    setHoje(hojeEmBuzios());
    setPrimeiroDia(primeiroDiaComHorario(horas));
  }, [horas]);

  useEffect(() => {
    rastrear('ViewContent', {
      content_ids: [slug],
      content_name: nome,
      content_type: 'product',
      value: opcoes[0].tabela.precoCentavos / 100,
      currency: 'BRL',
    });
  }, [slug, nome, opcoes]);

  const orc = useMemo(() => calcular(opcao.tabela, pessoas), [opcao, pessoas]);
  const totalPix = totalPixCentavos(orc);
  const brl = (c: number) => formatarCifra(c, locale);
  const menorPreco = Math.min(...opcoes.map((o) => o.tabela.precoCentavos));
  const usd = (c: number) => textoDolar(c, dolar, T.dolar, locale);
  const totalPessoas = pessoas.adultos + pessoas.criancasMeia + pessoas.criancasGratis;
  // a data do grupo é hoje, mas os horários de hoje já passaram
  const semHorarioHoje = Boolean(primeiroDia) && grupo.data === hoje && hoje < primeiroDia;
  // no dia de hoje, os horários que já passaram ficam apagados
  const livres = hoje ? horasDisponiveis(horas, grupo.data) : horas;

  /** Põe no carrinho: "Adicionar" abre a gaveta; "Reservar agora" segue direto para o checkout. */
  const colocar = async (destino: 'agora' | 'carrinho') => {
    setErroEnvio('');
    if (!dataPasseioValida(grupo.data) || semHorarioHoje) {
      setErroData(true);
      dataRef.current?.focus();
      return;
    }
    if (!hora || !livres.includes(hora)) {
      setErroHora(true);
      return;
    }
    setEnviando(destino);
    const r = await adicionar(
      {
        tipo: 'passeio',
        slug,
        ...(mostrarOpcoes ? { opcao: opcao.id } : {}),
        data: grupo.data,
        hora,
        adultos: pessoas.adultos,
        meia: pessoas.criancasMeia,
        gratis: pessoas.criancasGratis,
      },
      { abrir: destino === 'carrinho', ...(mudando ? { substituir: mudando } : {}) },
    );
    if (r.ok) {
      setMudando('');
      rastrear('AddToCart', {
        content_ids: [slug],
        content_name: nome,
        content_type: 'product',
        value: orc.totalCentavos / 100,
        currency: 'BRL',
      });
      if (destino === 'agora') {
        // fica "adicionando" até a página do checkout abrir
        router.push(finalizarHref);
        return;
      }
    } else setErroEnvio(r.erro === 'cheio' ? T.cheio : T.erroAdicionar);
    setEnviando('');
  };

  return (
    // abaixo da cápsula do menu, que também fica presa no topo
    <div id="reservar" className="scroll-mt-24">
      <div className="rounded-cartao border border-(--color-borda) bg-(--color-papel) p-5 sm:p-6">
        <h2 className="text-lead font-semibold">{T.titulo}</h2>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          {mostrarOpcoes && <span className="text-small text-(--color-tinta-suave)">{T.aPartirDe}</span>}
          <strong className="cifra text-figure">{brl(precoPixCentavos(menorPreco))}</strong>
          <span className="text-small font-semibold text-(--color-sucesso)">{T.noPix}</span>
          <span className="text-small text-(--color-tinta-suave)">{T.rotuloUnidade}</span>
        </p>
        <p className="text-small text-(--color-tinta-suave)">
          <span className="numeros font-semibold text-(--color-tinta)">{brl(menorPreco)}</span> {T.noCartao}
          {usd(menorPreco) && ` · ${usd(menorPreco)}`}
        </p>

        {mostrarOpcoes && (
          <fieldset className="mt-5 min-w-0">
            <legend className="rotulo">{T.escolhaOpcao}</legend>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={o.id === opcao.id}
                  onClick={() => setOpcaoId(o.id)}
                  className="filtro flex-col items-start !gap-0 py-2.5 text-left"
                >
                  <span>{o.nome}</span>
                  <span className="numeros text-small font-normal">
                    {brl(precoPixCentavos(o.tabela.precoCentavos))} {T.noPix}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label htmlFor={idData} className="rotulo mt-5">
          {T.data}
        </label>
        <CampoData
          ref={dataRef}
          id={idData}
          valor={grupo.data}
          dica={T.escolhaData}
          min={primeiroDia || undefined}
          max={hoje ? somarDias(hoje, 366) : undefined}
          onChange={(e) => {
            alterar({ data: e.target.value });
            setErroData(false);
          }}
          aria-invalid={erroData || semHorarioHoje}
          aria-describedby={erroData || semHorarioHoje ? `${idData}-erro` : undefined}
          required
        />
        {(erroData || semHorarioHoje) && (
          <span id={`${idData}-erro`} className="erro-campo">
            {semHorarioHoje ? T.semHorarioHoje : T.escolhaData}
          </span>
        )}

        {horas.length > 1 && (
          <fieldset className="mt-5 min-w-0" aria-describedby={erroHora ? `${idHora}-erro` : undefined}>
            <legend className="rotulo">{T.rotuloHorario}</legend>
            <div className="flex flex-wrap gap-1.5">
              {horas.map((h) => {
                const passou = !livres.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={hora === h}
                    disabled={passou}
                    onClick={() => {
                      setHora(h);
                      setErroHora(false);
                    }}
                    className="filtro numeros min-w-[4.5rem] justify-center disabled:opacity-40"
                  >
                    {formatarHora(h, idioma)}
                  </button>
                );
              })}
            </div>
            {erroHora && (
              <span id={`${idHora}-erro`} className="erro-campo">
                {T.escolhaHorario}
              </span>
            )}
          </fieldset>
        )}

        <div className="mt-5 space-y-4">
          {contadores.map((c) => (
            <Contador
              key={c.campo}
              rotulo={c.rotulo}
              ajuda={c.ajuda}
              valor={pessoas[c.campo]}
              min={c.campo === 'adultos' ? 1 : 0}
              max={30}
              aoMudar={(v) => setPessoas((p) => ({ ...p, [c.campo]: v }))}
              textos={T}
            />
          ))}
        </div>
        {regras.length > 0 && <p className="mt-4 text-small text-(--color-tinta-suave)">{regras.join(' ')}</p>}

        <div className="mt-5 border-t border-(--color-borda) pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold">
              {T.total} <span className="text-(--color-sucesso)">{T.noPix}</span>
            </span>
            {/* os números rolam na tela; o leitor de tela ouve só os valores finais */}
            <span aria-hidden="true">
              <Cifra centavos={totalPix} locale={locale} className="cifra text-figure-lg" />
            </span>
          </div>
          <p className="mt-1 flex items-baseline justify-between gap-4 text-small text-(--color-tinta-suave)" aria-hidden="true">
            <span>
              {T.total} {T.noCartao}
              {usd(orc.totalCentavos) && ` · ${usd(orc.totalCentavos)}`}
            </span>
            <Cifra centavos={orc.totalCentavos} locale={locale} className="numeros font-semibold text-(--color-tinta)" />
          </p>
          <span className="sr-only" aria-live="polite">
            {`${T.total} ${T.noPix}: ${brl(totalPix)}. ${T.total} ${T.noCartao}: ${brl(orc.totalCentavos)}.`}
          </span>
        </div>
        {opcao.tabela.unidade !== 'pessoa' && (
          <p className="mt-2 text-right text-small font-semibold" aria-live="polite">
            {T.unidadesAviso
              .replace('{pessoas}', `${totalPessoas} ${totalPessoas === 1 ? T.pessoa : T.pessoas}`)
              .replace('{n}', String(orc.unidades))
              .replace('{unidade}', orc.unidades === 1 ? T.unidadeSingular : T.unidadePlural)}
          </p>
        )}
        {erroEnvio && (
          <p className="mt-4 bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
            {erroEnvio}
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
        {garantias && <div className="mt-5">{garantias}</div>}
      </div>
      <p className="pt-3 text-small text-(--color-tinta-suave)">{T.revisao}</p>
    </div>
  );
}

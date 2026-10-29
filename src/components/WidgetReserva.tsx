'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { calcular, formatarCentavos, normalizarPessoas, type Pessoas, type TabelaPreco } from '@/lib/orcamento';
import type { FaixaContador } from '@/lib/passeio-view';
import { rastrear } from '@/lib/pixel';
import { dataPasseioValida, hojeEmBuzios, somarDias } from '@/lib/validacao';
import { Contador } from './grupo/Contador';
import { pessoasDoGrupo, useGrupo } from './grupo/GrupoContexto';
import { IconeWhatsApp } from './IconeWhatsApp';

export interface OpcaoWidget {
  id: string;
  nome: string;
  tabela: TabelaPreco;
}

export interface TextosWidget {
  titulo: string;
  data: string;
  total: string;
  reservar: string;
  duvidas: string;
  politica: string;
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
}

/** Cartão de reserva: opção, data e pessoas, com o total na hora. Abre com o grupo escolhido no site. */
export function WidgetReserva({
  slug,
  nome,
  opcoes,
  mostrarOpcoes,
  contadores,
  regras,
  locale,
  checkoutHref,
  whatsappHref,
  textos: T,
}: {
  slug: string;
  nome: string;
  opcoes: OpcaoWidget[];
  mostrarOpcoes: boolean;
  contadores: FaixaContador[];
  regras: string[];
  locale: string;
  checkoutHref: string;
  whatsappHref: string;
  textos: TextosWidget;
}) {
  const router = useRouter();
  const { grupo, alterar, pronto } = useGrupo();
  const [opcaoId, setOpcaoId] = useState(opcoes[0].id);
  const [hoje, setHoje] = useState('');
  const [pessoas, setPessoas] = useState<Pessoas>(() => normalizarPessoas(opcoes[0].tabela, { adultos: 2 }));
  const [erroData, setErroData] = useState(false);
  const dataRef = useRef<HTMLInputElement>(null);
  const idData = useId();
  const opcao = opcoes.find((o) => o.id === opcaoId) ?? opcoes[0];

  // quando o grupo salvo na sessão é lido, a reserva começa com ele
  const aplicado = useRef(false);
  useEffect(() => {
    if (!pronto || aplicado.current) return;
    aplicado.current = true;
    setPessoas(pessoasDoGrupo(grupo, opcoes[0].tabela));
  }, [pronto, grupo, opcoes]);

  useEffect(() => {
    setHoje(hojeEmBuzios());
    rastrear('ViewContent', {
      content_ids: [slug],
      content_name: nome,
      content_type: 'product',
      value: opcoes[0].tabela.precoCentavos / 100,
      currency: 'BRL',
    });
  }, [slug, nome, opcoes]);

  const orc = useMemo(() => calcular(opcao.tabela, pessoas), [opcao, pessoas]);
  const brl = (c: number) => formatarCentavos(c, locale);
  const totalPessoas = pessoas.adultos + pessoas.criancasMeia + pessoas.criancasGratis;

  const reservar = () => {
    if (!dataPasseioValida(grupo.data)) {
      setErroData(true);
      dataRef.current?.focus();
      return;
    }
    const q = new URLSearchParams({
      data: grupo.data,
      adultos: String(pessoas.adultos),
      meia: String(pessoas.criancasMeia),
      gratis: String(pessoas.criancasGratis),
    });
    if (mostrarOpcoes) q.set('opcao', opcao.id);
    router.push(`${checkoutHref}?${q.toString()}`);
  };

  return (
    <div id="reservar" className="scroll-mt-6">
      <div className="tom-sol p-5 sm:p-7">
        <h2 className="text-lead font-bold">{T.titulo}</h2>
        <p className="mt-1">
          {mostrarOpcoes && `${T.aPartirDe} `}
          <strong className="numeros text-lead">{brl(Math.min(...opcoes.map((o) => o.tabela.precoCentavos)))}</strong> {T.rotuloUnidade}
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
                  <span className="numeros text-small font-normal">{brl(o.tabela.precoCentavos)}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label htmlFor={idData} className="rotulo mt-5">
          {T.data}
        </label>
        <input
          ref={dataRef}
          id={idData}
          type="date"
          className="campo"
          value={grupo.data}
          min={hoje || undefined}
          max={hoje ? somarDias(hoje, 366) : undefined}
          onChange={(e) => {
            alterar({ data: e.target.value });
            setErroData(false);
          }}
          aria-invalid={erroData}
          aria-describedby={erroData ? `${idData}-erro` : undefined}
          required
        />
        {erroData && (
          <span id={`${idData}-erro`} className="erro-campo">
            {T.escolhaData}
          </span>
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
        {regras.length > 0 && <p className="mt-4 text-small">{regras.join(' ')}</p>}
        {opcao.tabela.unidade !== 'pessoa' && (
          <p className="mt-2 text-small font-semibold" aria-live="polite">
            {T.unidadesAviso
              .replace('{pessoas}', `${totalPessoas} ${totalPessoas === 1 ? T.pessoa : T.pessoas}`)
              .replace('{n}', String(orc.unidades))
              .replace('{unidade}', orc.unidades === 1 ? T.unidadeSingular : T.unidadePlural)}
          </p>
        )}

        <div className="mt-6 flex items-baseline justify-between gap-4 pt-1">
          <span className="font-semibold">{T.total}</span>
          <span className="numeros text-head font-bold leading-none" aria-live="polite">
            {brl(orc.totalCentavos)}
          </span>
        </div>
        <button type="button" onClick={reservar} className="botao mt-5 w-full">
          {T.reservar}
        </button>
      </div>
      <div className="space-y-3 pt-4">
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="botao botao-whats w-full" data-evento="Contact">
          <IconeWhatsApp className="size-5" />
          {T.duvidas}
        </a>
        <p className="text-small">{T.politica}</p>
        <p className="text-small text-(--tinta-suave)">{T.revisao}</p>
      </div>
    </div>
  );
}

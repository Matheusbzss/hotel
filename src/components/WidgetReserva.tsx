'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatarCifra } from '@/lib/cifra';
import { calcular, normalizarPessoas, type Pessoas, type TabelaPreco } from '@/lib/orcamento';
import type { FaixaContador } from '@/lib/passeio-view';
import { rastrear } from '@/lib/pixel';
import { dataPasseioValida, hojeEmBuzios, somarDias } from '@/lib/validacao';
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
  reservar: string;
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

/**
 * Cartão de reserva: opção, data e pessoas, com o total na hora e, embaixo do botão, as garantias.
 * Abre com o grupo escolhido no site.
 */
export function WidgetReserva({
  slug,
  nome,
  opcoes,
  mostrarOpcoes,
  contadores,
  regras,
  locale,
  checkoutHref,
  garantias,
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
  /** As garantias (cancelamento, chuva, voucher, pagamento) logo abaixo do botão. */
  garantias?: ReactNode;
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
  const brl = (c: number) => formatarCifra(c, locale);
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
    // abaixo da cápsula do menu, que também fica presa no topo
    <div id="reservar" className="scroll-mt-24">
      <div className="rounded-cartao border border-(--color-borda) bg-(--color-papel) p-5 sm:p-6">
        <h2 className="text-lead font-semibold">{T.titulo}</h2>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          {mostrarOpcoes && <span className="text-small text-(--color-tinta-suave)">{T.aPartirDe}</span>}
          <strong className="cifra text-figure">{brl(Math.min(...opcoes.map((o) => o.tabela.precoCentavos)))}</strong>
          <span className="text-small text-(--color-tinta-suave)">{T.rotuloUnidade}</span>
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
        <div className="relative">
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
          {/* no iPhone o campo vazio não mostra nada; esta dica só aparece lá */}
          {!grupo.data && (
            <span className="campo-dica" aria-hidden="true">
              {T.escolhaData}
            </span>
          )}
        </div>
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
        {regras.length > 0 && <p className="mt-4 text-small text-(--color-tinta-suave)">{regras.join(' ')}</p>}

        <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-(--color-borda) pt-4">
          <span className="font-semibold">{T.total}</span>
          {/* o número rola na tela; o leitor de tela ouve só o valor final */}
          <span aria-hidden="true">
            <Cifra centavos={orc.totalCentavos} locale={locale} className="cifra text-figure-lg" />
          </span>
          <span className="sr-only" aria-live="polite">
            {brl(orc.totalCentavos)}
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
        <button type="button" onClick={reservar} className="botao mt-5 w-full">
          {T.reservar}
        </button>
        {garantias && <div className="mt-5">{garantias}</div>}
      </div>
      <p className="pt-3 text-small text-(--color-tinta-suave)">{T.revisao}</p>
    </div>
  );
}

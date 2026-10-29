'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { calcular, formatarCentavos, type TabelaPreco } from '@/lib/orcamento';
import { rastrear } from '@/lib/pixel';
import { dataPasseioValida, hojeEmBuzios, somarDias } from '@/lib/validacao';
import { Contador } from './Contador';
import { IconeWhatsApp } from './IconeWhatsApp';

export interface TextosWidget {
  titulo: string;
  data: string;
  adultos: string;
  criancas: string;
  criancasAjuda: string;
  total: string;
  reservar: string;
  duvidas: string;
  politica: string;
  escolhaData: string;
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

/** Bilhete de reserva: escolha a data e as pessoas e veja o total na hora. */
export function WidgetReserva({
  slug,
  nome,
  tabela,
  locale,
  checkoutHref,
  whatsappHref,
  textos,
}: {
  slug: string;
  nome: string;
  tabela: TabelaPreco;
  locale: string;
  checkoutHref: string;
  whatsappHref: string;
  textos: TextosWidget;
}) {
  const router = useRouter();
  const [data, setData] = useState('');
  const [hoje, setHoje] = useState('');
  const [adultos, setAdultos] = useState(2);
  const [criancas, setCriancas] = useState(0);
  const [erroData, setErroData] = useState(false);
  const dataRef = useRef<HTMLInputElement>(null);
  const idData = useId();

  useEffect(() => {
    setHoje(hojeEmBuzios());
    rastrear('ViewContent', {
      content_ids: [slug],
      content_name: nome,
      content_type: 'product',
      value: tabela.precoAdultoCentavos / 100,
      currency: 'BRL',
    });
  }, [slug, nome, tabela.precoAdultoCentavos]);

  const orc = useMemo(() => calcular(tabela, adultos, criancas), [tabela, adultos, criancas]);
  const brl = (c: number) => formatarCentavos(c, locale);

  const reservar = () => {
    if (!dataPasseioValida(data)) {
      setErroData(true);
      dataRef.current?.focus();
      return;
    }
    const q = new URLSearchParams({ data, adultos: String(adultos), criancas: String(criancas) });
    router.push(`${checkoutHref}?${q.toString()}`);
  };

  const pessoasTexto = `${orc.pessoas} ${orc.pessoas === 1 ? textos.pessoa : textos.pessoas}`;

  return (
    <div id="reservar" className="scroll-mt-6">
      <div className="bilhete bg-areia-clara" style={{ ['--corte' as string]: 'calc(100% - 144px)' }}>
        <div className="faixa-guarda-sol h-3" aria-hidden="true" />
        <div className="px-6 pb-6 pt-5">
          <h2 className="text-lead font-bold">{textos.titulo}</h2>
          <p className="mt-1 text-small">
            {textos.aPartirDe} <strong className="text-[1.125rem]">{brl(tabela.precoAdultoCentavos)}</strong> {textos.rotuloUnidade}
          </p>

          <label htmlFor={idData} className="rotulo mt-5">
            {textos.data}
          </label>
          <input
            ref={dataRef}
            id={idData}
            type="date"
            className="campo"
            value={data}
            min={hoje || undefined}
            max={hoje ? somarDias(hoje, 366) : undefined}
            onChange={(e) => {
              setData(e.target.value);
              setErroData(false);
            }}
            aria-invalid={erroData}
            aria-describedby={erroData ? `${idData}-erro` : undefined}
            required
          />
          {erroData && (
            <span id={`${idData}-erro`} className="erro-campo">
              {textos.escolhaData}
            </span>
          )}

          <div className="mt-5 space-y-4">
            <Contador rotulo={textos.adultos} valor={adultos} min={1} max={30} aoMudar={setAdultos} textos={textos} />
            <Contador
              rotulo={textos.criancas}
              ajuda={textos.criancasAjuda}
              valor={criancas}
              min={0}
              max={30}
              aoMudar={setCriancas}
              textos={textos}
            />
          </div>
          {tabela.unidade !== 'pessoa' && (
            <p className="mt-4 text-small font-semibold" aria-live="polite">
              {textos.unidadesAviso
                .replace('{pessoas}', pessoasTexto)
                .replace('{n}', String(orc.unidades))
                .replace('{unidade}', orc.unidades === 1 ? textos.unidadeSingular : textos.unidadePlural)}
            </p>
          )}
        </div>
        <div className="picote-areia mx-4" aria-hidden="true" />
        <div className="bg-coral px-6 pb-6 pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold">{textos.total}</span>
            <span className="text-[2rem] font-bold leading-none" aria-live="polite">
              {brl(orc.totalCentavos)}
            </span>
          </div>
          <button type="button" onClick={reservar} className="botao botao-tinta mt-4 w-full">
            {textos.reservar}
          </button>
        </div>
      </div>
      <div className="space-y-3 pt-4">
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="botao botao-whats w-full" data-evento="Contact">
          <IconeWhatsApp className="size-5" />
          {textos.duvidas}
        </a>
        <p className="text-small">{textos.politica}</p>
        <p className="text-small text-tinta-suave">{textos.revisao}</p>
      </div>
    </div>
  );
}

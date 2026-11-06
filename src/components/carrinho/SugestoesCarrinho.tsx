'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { Idioma } from '@/i18n/config';
import type { SugestaoVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { formatarHora, horasDisponiveis, primeiroDiaComHorario } from '@/lib/horarios';
import { rastrear } from '@/lib/pixel';
import { dataPasseioValida, hojeEmBuzios, somarDias } from '@/lib/validacao';
import { CampoData } from '../CampoData';
import { useCarrinho } from './CarrinhoContexto';

export interface TextosSugestoes {
  sugestoesTitulo: string;
  sugestaoAdicionar: string;
  sugestaoAgoraNao: string;
  sugestaoVer: string;
  adicionar: string;
  adicionando: string;
  erroAdicionar: string;
  cheio: string;
  escolhaHorario: string;
  noPix: string;
  dataPasseio: string;
  escolhaData: string;
  opcao: string;
  aPartirDe: string;
}

/** Um passeio sugerido: o preço para o grupo e, ao tocar em "Adicionar", a data e o horário ali mesmo. */
function Sugestao({ s, locale, textos: T }: { s: SugestaoVisivel; locale: string; textos: TextosSugestoes }) {
  const { adicionar } = useCarrinho();
  const [aberta, setAberta] = useState(false);
  const [data, setData] = useState(s.data);
  // com um horário só (ex.: city tour às 7h), ele já vem escolhido
  const [hora, setHora] = useState(s.horas.length === 1 ? s.horas[0] : '');
  const [opcaoId, setOpcaoId] = useState(s.opcoes[0].id);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const idioma = locale.slice(0, 2) as Idioma;
  const opcao = s.opcoes.find((o) => o.id === opcaoId) ?? s.opcoes[0];
  const varias = s.opcoes.length > 1;
  const livres = horasDisponiveis(s.horas, data);
  const brl = (c: number) => formatarCifra(c, locale);

  async function confirmar() {
    setErro('');
    if (!dataPasseioValida(data)) return setErro(T.escolhaData);
    if (!livres.includes(hora)) return setErro(T.escolhaHorario);
    setEnviando(true);
    const r = await adicionar(
      {
        tipo: 'passeio',
        slug: s.slug,
        ...(varias ? { opcao: opcao.id } : {}),
        data,
        hora,
        adultos: s.pessoas.adultos,
        meia: s.pessoas.meia,
        gratis: s.pessoas.gratis,
        sugestao: true,
      },
      { abrir: false },
    );
    if (r.ok) {
      rastrear('AddToCart', {
        content_ids: [s.slug],
        content_name: s.nome,
        content_type: 'product',
        value: opcao.totalCentavos / 100,
        currency: 'BRL',
      });
      return; // o passeio vai para o carrinho e sai daqui
    }
    setErro(r.erro === 'cheio' ? T.cheio : T.erroAdicionar);
    setEnviando(false);
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-[8px] bg-(--color-superficie)">
          {/* carrega antes: a gaveta abre com a foto pronta, sem o quadrado vazio */}
          {s.foto && <Image src={s.foto} alt="" fill sizes="56px" loading="eager" className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-semi)] font-semibold leading-snug">{s.nome}</p>
          <p className="text-small">
            {varias && <span className="text-(--color-tinta-suave)">{T.aPartirDe} </span>}
            <span className="cifra font-semibold">{brl(s.opcoes[0].totalPixCentavos)}</span>{' '}
            <span className="font-semibold text-(--color-sucesso)">{T.noPix}</span>
          </p>
          <p className="text-small text-(--color-tinta-suave)">{s.pessoasTexto}</p>
        </div>
        <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="filtro shrink-0 bg-transparent">
          {aberta ? T.sugestaoAgoraNao : T.sugestaoAdicionar}
        </button>
      </div>

      {aberta && (
        // no checkout, o Enter aqui não pode enviar o formulário
        <div className="mt-3 grid gap-3" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}>
          <label className="block">
            <span className="rotulo">{T.dataPasseio}</span>
            <CampoData
              valor={data}
              dica={T.escolhaData}
              min={primeiroDiaComHorario(s.horas)}
              max={somarDias(hojeEmBuzios(), 366)}
              onChange={(e) => {
                setData(e.target.value);
                setErro('');
              }}
            />
          </label>
          {varias && (
            <fieldset className="min-w-0">
              <legend className="rotulo">{T.opcao}</legend>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
                {s.opcoes.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={o.id === opcao.id}
                    onClick={() => setOpcaoId(o.id)}
                    className="filtro flex-col items-start !gap-0 py-2 text-left"
                  >
                    <span>{o.nome}</span>
                    <span className="numeros text-small font-normal">
                      {brl(o.totalPixCentavos)} {T.noPix}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {s.horas.length > 1 && (
            <fieldset className="min-w-0">
              <legend className="rotulo">{s.rotuloHorario}</legend>
              <div className="flex flex-wrap gap-1.5">
                {s.horas.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={hora === h}
                    disabled={!livres.includes(h)}
                    onClick={() => {
                      setHora(h);
                      setErro('');
                    }}
                    className="filtro numeros min-w-[3.75rem] justify-center disabled:opacity-40"
                  >
                    {formatarHora(h, idioma)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {erro && (
            <span className="erro-campo" role="alert">
              {erro}
            </span>
          )}
          <button type="button" onClick={confirmar} disabled={enviando} aria-busy={enviando} className="botao w-full">
            {enviando ? T.adicionando : T.adicionar}
          </button>
          <a href={s.href} target="_blank" className="link justify-self-center text-small">
            {T.sugestaoVer}
          </a>
        </div>
      )}
    </li>
  );
}

/** As sugestões do carrinho e do checkout: passeios que combinam, sem pressa e sem contagem regressiva. */
export function SugestoesCarrinho({
  locale,
  textos: T,
  className = 'border-t border-(--color-borda) pt-4',
}: {
  locale: string;
  textos: TextosSugestoes;
  className?: string;
}) {
  const { sugestoes } = useCarrinho();
  if (!sugestoes.length) return null;
  return (
    <section className={className}>
      <h3 className="font-semibold">{T.sugestoesTitulo}</h3>
      <ul className="mt-1 divide-y divide-(--color-borda)">
        {sugestoes.map((s) => (
          <Sugestao key={s.slug} s={s} locale={locale} textos={T} />
        ))}
      </ul>
    </section>
  );
}

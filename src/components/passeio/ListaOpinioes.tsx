'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { levarAoCampo } from '@/lib/levar-ao-campo';

/** Uma avaliação do cartão, já pronta do servidor: o trecho curto, o texto inteiro e quem escreveu. */
export interface OpiniaoDoCartao {
  id: string;
  /** "Boris I" */
  nome: string;
  /** "Opinión original en portugués", só quando o idioma do texto é outro. */
  original?: string;
  /** A primeira frase, cortada com reticências quando passa do limite (trechoDaAvaliacao, src/lib/avaliacao.ts). */
  trecho: string;
  texto: string;
}

/**
 * O texto inteiro de uma opinião no cartão aberto, em até 6 linhas; o "Leer más" só aparece quando o texto foi cortado
 * de verdade (medido na tela, que muda com a largura e o tamanho da letra), e vira "Leer menos" depois de aberto.
 */
function TextoInteiro({ texto, lerMais, lerMenos }: { texto: string; lerMais: string; lerMenos: string }) {
  const [aberto, setAberto] = useState(false);
  const [cortado, setCortado] = useState(false);
  const paragrafo = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const p = paragrafo.current;
    if (!p || aberto) return;
    const medir = () => setCortado(p.scrollHeight > p.clientHeight + 1);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(p);
    return () => observador.disconnect();
  }, [aberto]);

  return (
    <>
      <p ref={paragrafo} className={`whitespace-pre-line ${aberto ? '' : 'line-clamp-6'}`}>
        “{texto.trim()}”
      </p>
      {(cortado || aberto) && (
        <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="link mt-1 text-small">
          {aberto ? lerMenos : lerMais}
        </button>
      )}
    </>
  );
}

/**
 * Pacote 34 (ENT-11): a lista do cartão de opiniões perto da reserva. Fechada, os 2 trechos curtos de sempre; o "Ver
 * todas las opiniones" abre o cartão ali mesmo, com todas as opiniões da agência e o texto inteiro de cada uma. Antes, o
 * link levava para a página inicial e o cliente perdia o passeio e o horário que tinha escolhido. O "Ver menos" fecha e,
 * se o título já subiu da tela, volta até ele.
 */
export function ListaOpinioes({
  iniciais,
  todas,
  idTitulo,
  textos,
}: {
  /** Os trechos do cartão fechado (trechosDoCartao). */
  iniciais: OpiniaoDoCartao[];
  /** Todas, na ordem do cartão: as iniciais primeiro, depois as outras. */
  todas: OpiniaoDoCartao[];
  /** O título do cartão (para voltar até ele ao fechar). */
  idTitulo: string;
  textos: { verTodas: string; verMenos: string; lerMais: string; lerMenos: string };
}) {
  const [aberto, setAberto] = useState(false);
  const idLista = useId();
  // só há o que abrir quando há mais opiniões ou um trecho cortado
  const temMais = todas.length > iniciais.length || iniciais.some((a) => a.trecho !== a.texto.trim());
  const itens = aberto ? todas : iniciais;

  const alternar = () => {
    setAberto(!aberto);
    // ao fechar, a lista encolhe embaixo do título: se ele estava acima da tela, a tela volta até ele (abaixo da cápsula
    // do menu), do mesmo jeito que o cartão de reserva leva até o campo que falta (sem o Safari cancelar a rolagem)
    if (aberto) {
      const titulo = document.getElementById(idTitulo);
      if (titulo && titulo.getBoundingClientRect().top < 0) levarAoCampo(titulo, null, 'start');
    }
  };

  return (
    <>
      <ul id={idLista} className="mt-4 space-y-3 border-t border-(--color-borda) pt-4">
        {itens.map((a) => (
          <li key={a.id} className="text-small">
            {aberto ? <TextoInteiro texto={a.texto} lerMais={textos.lerMais} lerMenos={textos.lerMenos} /> : <p>“{a.trecho}”</p>}
            <p className="mt-0.5 text-(--color-tinta-suave)">
              {a.nome}
              {a.original && ` · ${a.original}`}
            </p>
          </li>
        ))}
      </ul>
      {temMais && (
        // a área do toque com a altura de um dedo (44 px), com o texto no mesmo lugar do link de antes
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls={idLista}
          className="link mt-1 inline-flex min-h-11 items-center text-small"
        >
          {aberto ? textos.verMenos : textos.verTodas}
        </button>
      )}
    </>
  );
}

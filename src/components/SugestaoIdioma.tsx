'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { cookieDoIdioma, gravarIdiomaNoNavegador, paginaComSugestao, sugestaoDeIdioma, type Espanhol } from '@/i18n/chegada';
import { HREFLANG, rota, semIdioma } from '@/i18n/config';

/** Os textos da faixa, no idioma que ela sugere (nav.sugestaoIdioma do es e do es-ar). */
export interface TextosSugestao {
  pergunta: string;
  botao: string;
  fechar: string;
}

/** Os idiomas do aparelho, do preferido para o último (navigator.languages; o navigator.language nos antigos). */
function linguasDoAparelho(): readonly string[] {
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/**
 * A faixa só aparece por cima de foto (revisão do Pacote 31; o dono decidiu em 25/11: "não mostrar a faixa" nas páginas
 * sem foto no topo). Ela fica fora do fluxo, logo abaixo da cápsula: nas páginas com foto no topo (a inicial, os
 * passeios, o transfer, o contato), fica por cima da foto, como a cápsula; nas páginas sem foto no topo (a lista de
 * passeios, as políticas e os termos, a página de erro), ela taparia o título, e a página não pode abrir espaço para ela
 * sem pular. Lá, o botão do idioma (PT ⌄) continua no topo. Confere três pontos na altura do meio da faixa, a 25, 50 e
 * 75% da largura: pelo menos dois em cima de uma foto ou de um vídeo da página (dois, e não três, por causa do vão entre
 * as fotos da galeria no computador).
 */
function porCimaDeFoto(caixa: DOMRect): boolean {
  const midias = Array.from(document.querySelectorAll('img, video'))
    .filter((m) => !m.closest('.sugestao-idioma, .cabecalho'))
    .map((m) => m.getBoundingClientRect())
    .filter((m) => m.width > 0 && m.height > 0);
  const y = caixa.top + caixa.height / 2;
  const acertos = [0.25, 0.5, 0.75].filter((f) => {
    const x = caixa.left + caixa.width * f;
    return midias.some((m) => x >= m.left && x <= m.right && y >= m.top && y <= m.bottom);
  });
  return acertos.length >= 2;
}

/**
 * A faixa taparia texto da página? Mesmo por cima de foto, ela não pode tapar o título que fica em cima da foto (o da
 * página inicial, em tela baixa, com o celular deitado ou com a letra grande), pela mesma decisão do dono ("não tapar o
 * título"; conferência final do Pacote 31). Compara a caixa da faixa com o TEXTO visível de main, linha a linha, e não
 * com as caixas dos elementos: as fotos da galeria dos passeios são botões que ficam embaixo da faixa, e a faixa tem de
 * continuar ali. Pula a própria faixa, a cápsula, o que está escondido e o que é só enfeite (aria-hidden).
 */
function tapaTexto(caixa: DOMRect): boolean {
  const raiz = document.querySelector('main');
  if (!raiz) return false;
  const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const trecho = document.createRange();
  for (let no = andar.nextNode(); no; no = andar.nextNode()) {
    if (!no.textContent?.trim()) continue;
    trecho.selectNodeContents(no);
    for (const linha of trecho.getClientRects()) {
      const x = Math.min(linha.right, caixa.right) - Math.max(linha.left, caixa.left);
      const y = Math.min(linha.bottom, caixa.bottom) - Math.max(linha.top, caixa.top);
      if (x <= 2 || y <= 2) continue;
      const el = no.parentElement;
      // o texto só para leitor de tela (sr-only) fica numa caixa de 1 px, mas a linha dele mede o texto inteiro
      if (!el || el.closest('.sugestao-idioma, .cabecalho, .sr-only, [aria-hidden="true"]')) break;
      if (getComputedStyle(el).visibility === 'hidden') break;
      return true;
    }
  }
  return false;
}

/** A largura da área da página, que muda ao girar o tablet ou mudar a janela (a altura muda com a barra do Safari). */
function useLarguraDaTela(): number {
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const ler = () => setLargura(document.documentElement.clientWidth);
    ler();
    window.addEventListener('resize', ler);
    return () => window.removeEventListener('resize', ler);
  }, []);
  return largura;
}

/**
 * A faixa discreta que sugere o espanhol nas páginas em português e em inglês (Pacote 31, 25/11; Fase 4, Etapa 3:
 * "nas outras páginas, no máximo uma faixa discreta sugerindo a outra versão"). O dono escolheu a posição A em 25/11:
 * uma faixa fina logo abaixo da cápsula do topo (embaixo da tela já ficam o aviso de cookies e a barra do carrinho). As
 * páginas são estáticas e iguais para todos, então ela só aparece depois de a página carregar, pela regra de
 * sugestaoDeIdioma (src/i18n/chegada.ts): o cookie do idioma ou o primeiro idioma do aparelho. Fica por cima do
 * conteúdo, fora do fluxo: a página não pula. "Ver en español" grava o cookie com a versão sugerida e leva para a MESMA
 * página nela, como o seletor de idioma. O × grava o idioma da página, como se a pessoa o escolhesse no seletor: a
 * faixa não volta, e quem chega de fora na "/" vai para a inicial desse idioma (numa página em português, fica no
 * português; numa em inglês, vai para /en).
 */
export function SugestaoIdioma({ idioma, textos }: { idioma: 'pt' | 'en'; textos: Record<Espanhol, TextosSugestao> }) {
  const caminhoPublico = usePathname() || '/';
  const idPergunta = useId();
  const [sugerido, setSugerido] = useState<Espanhol | null>(null);
  // o que vem depois do "?" (o filtro de /passeios?cidade=…): lido do navegador ao carregar e de novo no toque, como no
  // seletor de idioma, para a troca não perder nada. Sem useSearchParams: o layout está nas páginas estáticas
  const [busca, setBusca] = useState('');

  useEffect(() => {
    setSugerido(
      sugestaoDeIdioma({
        idiomaDaPagina: idioma,
        caminho: caminhoPublico,
        cookie: cookieDoIdioma(document.cookie),
        linguas: linguasDoAparelho(),
      }),
    );
    setBusca(window.location.search);
  }, [idioma, caminhoPublico]);

  // a conferência do lugar (por cima de foto e sem tapar texto), uma vez por página e por largura da tela (girar o
  // tablet muda o desenho do topo da casa): até ela ser feita, a faixa é desenhada escondida, só para ser medida. O
  // useLayoutEffect mede e decide antes de o navegador pintar: nada pisca
  const caixa = useRef<HTMLDivElement>(null);
  const largura = useLarguraDaTela();
  const chaveDaFoto = `${caminhoPublico}|${largura}`;
  const [foto, setFoto] = useState<{ chave: string; sim: boolean } | null>(null);
  const conferindo = foto?.chave !== chaveDaFoto;
  useLayoutEffect(() => {
    if (!sugerido || !conferindo || !caixa.current) return;
    const r = caixa.current.getBoundingClientRect();
    setFoto({ chave: chaveDaFoto, sim: porCimaDeFoto(r) && !tapaTexto(r) });
  });

  // a página também é conferida aqui, e não só no efeito: numa navegação por dentro do site (para o checkout, por
  // exemplo), o estado da página anterior ainda vale no primeiro desenho da nova, antes de o efeito rodar
  if (!sugerido || !paginaComSugestao(caminhoPublico)) return null;
  if (!conferindo && !foto?.sim) return null;
  const t = textos[sugerido];
  const lerBusca = () => setBusca(window.location.search);
  const fechar = () => {
    gravarIdiomaNoNavegador(idioma);
    setSugerido(null);
  };

  // Fina, com a largura da cápsula. No celular de 390 px a pergunta cabe em duas linhas ao lado do botão e do ×, e a
  // faixa fica com a altura do botão (40 px) mais 4 px em cima e embaixo. Quando não sobram 9em para a pergunta (o que
  // ela pede para caber em duas linhas), o botão e o × descem juntos para a linha de baixo, encostados à direita, e a
  // pergunta fica com a largura toda: nada passa por cima de nada. Isso acontece abaixo de uns 350 px com a letra
  // normal e em todo celular com a letra do aparelho aumentada; o 9em cresce junto com a letra, e o min() com 100% não
  // deixa a pergunta passar da faixa com a letra enorme (revisão do Pacote 31: com a letra a 150%, a pergunta ficava
  // com uma palavra por linha, por baixo do botão; medido de 320 a 1440 px, com a letra de 100 a 200%)
  return (
    <div className="sugestao-idioma" lang={HREFLANG[sugerido]}>
      <div
        ref={caixa}
        role="region"
        aria-labelledby={idPergunta}
        className="sugestao-faixa vidro vidro-escuro mx-auto flex max-w-[calc(var(--largura-max)+1rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-(--radius-vidro) py-1 pl-3.5 pr-1 md:gap-x-3 md:py-1.5 md:pl-5 md:pr-1.5"
        style={conferindo ? { visibility: 'hidden' } : undefined}
      >
        <p id={idPergunta} className="min-w-[min(9em,100%)] flex-[1_1_0%] text-small leading-tight md:text-[1rem]">
          {t.pergunta}
        </p>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Link
            href={rota(sugerido, semIdioma(caminhoPublico) + busca)}
            prefetch={false}
            hrefLang={HREFLANG[sugerido]}
            onPointerDown={lerBusca}
            onFocus={lerBusca}
            onClick={() => gravarIdiomaNoNavegador(sugerido)}
            className="botao min-h-10 px-3 py-1.5 text-[1rem] md:px-4"
          >
            {t.botao}
          </Link>
          <button
            type="button"
            onClick={fechar}
            aria-label={t.fechar}
            title={t.fechar}
            className="flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200 hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Cidade } from '@/data/passeios';
import { fmt } from '@/i18n/config';
import type { Caixa, Mapa } from './mapa-relevo';

export interface CidadeMapa {
  id: Cidade;
  nome: string;
  x: number;
  y: number;
  esquerda: number;
  topo: number;
  foto: string;
  texto: string;
  qtd: string;
}

export interface PraiaMapa {
  id: string;
  cidade: Cidade;
  x: number;
  y: number;
  esquerda: number;
  topo: number;
}

export interface TextosMapa {
  titulo: string;
  texto: string;
  toque: string;
  fonte: string;
  voltar: string;
  verPasseios: string;
}

const TEXTURAS = {
  detalhe: '/mapa/satelite-2880.webp',
  detalheMenor: '/mapa/satelite-2048.webp',
  entorno: '/mapa/satelite-entorno.webp',
  alturas: '/mapa/altura.png',
};

/** plano: só a foto, enquanto o 3D carrega; on: 3D; off: sem 3D (aparelho sem WebGL ou economia de dados). */
type Modo = 'plano' | 'on' | 'off';

/**
 * A Região dos Lagos vista de cima: a foto de satélite real sobre o relevo, em 3D quando o aparelho permite.
 * Tocar numa cidade leva a câmera até ela, mostra as praias e um cartão com foto e o caminho para os passeios.
 */
export function MapaRegiao({
  cidades,
  praias,
  relevo,
  entorno,
  textos: T,
}: {
  cidades: CidadeMapa[];
  praias: PraiaMapa[];
  relevo: Caixa;
  entorno: Caixa;
  textos: TextosMapa;
}) {
  const palco = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const mapa = useRef<Mapa | null>(null);
  const tituloCartao = useRef<HTMLHeadingElement>(null);
  const ultimoPino = useRef<HTMLButtonElement | null>(null);
  const [modo, setModo] = useState<Modo>('plano');
  const [escolhida, setEscolhida] = useState<Cidade | null>(null);

  // o 3D só carrega quando a seção chega perto da tela; fora dela, para de desenhar
  useEffect(() => {
    const el = palco.current;
    const canvas = tela.current;
    if (!el || !canvas) return;
    const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conexao?.saveData) {
      setModo('off');
      return;
    }
    let vivo = true;
    let criado: Mapa | null = null;
    let ativo: IntersectionObserver | null = null;
    let tamanho: ResizeObserver | null = null;
    const giro = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) criado?.inclinar(e.gamma, e.beta);
    };
    const perto = new IntersectionObserver(
      async ([entrada]) => {
        if (!entrada.isIntersecting) return;
        perto.disconnect();
        try {
          const { criarMapa } = await import('./mapa-relevo');
          const m = await criarMapa({
            canvas,
            palco: el,
            relevo,
            entorno,
            texturas: TEXTURAS,
            cidades: cidades.map(({ id, x, y }) => ({ id, x, y })),
            praias: praias.map(({ id, x, y, cidade }) => ({ id, x, y, cidade })),
            celular: !matchMedia('(min-width: 1024px)').matches,
          });
          if (!vivo) {
            m?.destruir();
            return;
          }
          if (!m) {
            setModo('off');
            return;
          }
          criado = m;
          mapa.current = m;
          setModo('on');
          ativo = new IntersectionObserver(([e]) => m.ativo(e.isIntersecting));
          ativo.observe(el);
          tamanho = new ResizeObserver(() => m.redimensionar());
          tamanho.observe(el);
          window.addEventListener('deviceorientation', giro);
        } catch {
          if (vivo) setModo('off');
        }
      },
      { rootMargin: '900px 0px' },
    );
    perto.observe(el);
    return () => {
      vivo = false;
      perto.disconnect();
      ativo?.disconnect();
      tamanho?.disconnect();
      window.removeEventListener('deviceorientation', giro);
      criado?.destruir();
      mapa.current = null;
    };
  }, [cidades, praias, relevo, entorno]);

  useEffect(() => {
    if (!escolhida) return;
    tituloCartao.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && voltar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [escolhida]);

  function escolher(id: Cidade, botao: HTMLButtonElement) {
    ultimoPino.current = botao;
    setEscolhida(id);
    mapa.current?.voar(id);
  }
  function voltar() {
    setEscolhida(null);
    mapa.current?.voar(null);
    ultimoPino.current?.focus({ preventScroll: true });
  }
  function verPasseios(e: MouseEvent<HTMLAnchorElement>, id: Cidade) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent<Cidade>('orla:ver-passeios', { detail: id }));
  }

  const cidade = cidades.find((c) => c.id === escolhida);

  return (
    <section id="regiao" className="mapa-secao" aria-labelledby="mapa-titulo">
      <div className="moldura">
        <h2 id="mapa-titulo" className="titulo">
          {T.titulo}
        </h2>
        <p className="mt-3 max-w-[52ch] text-(--color-tinta-suave)">{T.texto}</p>
      </div>

      <div className="mapa-moldura">
        <div ref={palco} className="mapa-palco" data-3d={modo}>
          <div className="mapa-plano">
            <div className="mapa-plano-caixa">
              <picture>
                <source media="(min-width: 1024px)" srcSet={TEXTURAS.detalhe} />
                <img src={TEXTURAS.detalheMenor} alt={T.titulo} className="mapa-img" loading="lazy" decoding="async" />
              </picture>
              {cidades.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-pino={c.id}
                  className="pino"
                  style={{ '--x': `${c.esquerda}%`, '--y': `${c.topo}%` } as CSSProperties}
                  aria-pressed={escolhida === c.id}
                  aria-controls="mapa-cartao"
                  onClick={(e) => escolher(c.id, e.currentTarget)}
                >
                  <span className="etiqueta vidro vidro-escuro">{c.nome}</span>
                  <span className="pino-ponto" aria-hidden="true" />
                </button>
              ))}
              {praias.map((p) => (
                <span
                  key={p.id}
                  data-praia={p.id}
                  data-visivel={modo === 'off' ? (p.cidade === escolhida ? 'sim' : 'nao') : undefined}
                  className="praia-rotulo"
                  style={{ '--x': `${p.esquerda}%`, '--y': `${p.topo}%` } as CSSProperties}
                  aria-hidden="true"
                >
                  {p.id}
                </span>
              ))}
            </div>
          </div>

          <canvas ref={tela} className="mapa-canvas" data-pronto={modo === 'on' || undefined} aria-hidden="true" />

          {modo !== 'plano' && !cidade && <p className="mapa-dica etiqueta vidro vidro-escuro">{T.toque}</p>}

          {cidade && (
            <div id="mapa-cartao" className="mapa-cartao vidro vidro-claro" role="region" aria-labelledby="mapa-cartao-titulo">
              <div className="mapa-cartao-foto">
                <Image src={cidade.foto} alt="" fill sizes="(min-width: 768px) 22rem, 5.5rem" quality={72} className="object-cover" />
              </div>
              <div className="mapa-cartao-info">
                <h3 id="mapa-cartao-titulo" ref={tituloCartao} tabIndex={-1} className="subtitulo outline-none">
                  {cidade.nome}
                </h3>
                <p className="text-small text-(--color-tinta-suave)">{cidade.qtd}</p>
                <p className="mt-1 text-small">{cidade.texto}</p>
              </div>
              <a href={`#passeios-${cidade.id}`} className="botao mapa-cartao-botao" onClick={(e) => verPasseios(e, cidade.id)}>
                {fmt(T.verPasseios, { cidade: cidade.nome })}
              </a>
              <button type="button" className="mapa-fechar vidro vidro-escuro" onClick={voltar} aria-label={T.voltar} title={T.voltar}>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <p className="mapa-fonte">{T.fonte}</p>
      </div>
    </section>
  );
}

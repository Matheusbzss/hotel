'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { IconeCasa } from './IconeCasa';

export interface TextosGaleriaCasa {
  galeria: string;
  /** "Ver as {n} fotos". */
  verFotos: string;
  anterior: string;
  proxima: string;
  fechar: string;
  /** "Foto {i} de {n}". */
  fotoDe: string;
  /** "Voltar para todas as fotos". */
  voltar: string;
}

const preencher = (t: string, v: Record<string, number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/**
 * A capa pede o mesmo tamanho no celular (a foto de borda a borda) e no computador (a grande do mosaico): o navegador
 * escolhe o mesmo arquivo nos dois lugares e baixa uma vez só.
 */
const TAMANHO_CAPA = '(min-width: 1024px) 50vw, 100vw';

/**
 * As fotos da casa (Etapa 7, parte 1). No celular, de borda a borda por baixo da cápsula do menu, deslizando para o
 * lado, com o contador "1/34" em vidro (tocar abre todas). No computador, uma grande e quatro pequenas, com "Ver as 34
 * fotos". Todas as fotos abrem numa grade, e cada uma, sozinha, em tela cheia, sem passar do tamanho que ela tem (as
 * fotos de 720 px não esticam no computador).
 */
export function GaleriaCasa({ fotos, alts, textos: T }: { fotos: string[]; alts: string[]; textos: TextosGaleriaCasa }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const grade = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const [modo, setModo] = useState<'grade' | 'foto'>('grade');
  const [aberta, setAberta] = useState(0);
  // a largura de verdade da foto aberta, em pixels: a tela cheia nunca passa disso
  const [largura, setLargura] = useState<number | null>(null);
  const n = fotos.length;

  const mostrar = () => {
    if (dialogo.current?.open) return;
    document.documentElement.style.overflow = 'hidden';
    dialogo.current?.showModal();
  };
  const rolarAte = (i: number) =>
    requestAnimationFrame(() => grade.current?.querySelector<HTMLElement>(`[data-foto="${i}"]`)?.scrollIntoView({ block: 'center' }));
  const abrirGrade = (i: number) => {
    setModo('grade');
    mostrar();
    rolarAte(i);
  };
  const abrirFoto = (i: number) => {
    setLargura(null);
    setAberta(i);
    setModo('foto');
    mostrar();
  };
  const voltarParaGrade = () => {
    setModo('grade');
    rolarAte(aberta);
  };

  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    const tecla = (e: KeyboardEvent) => {
      if (modo !== 'foto') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        setLargura(null);
        setAberta((i) => (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n);
      }
    };
    const fechou = () => {
      document.documentElement.style.removeProperty('overflow');
      setModo('grade');
    };
    el.addEventListener('keydown', tecla);
    el.addEventListener('close', fechou);
    return () => {
      el.removeEventListener('keydown', tecla);
      el.removeEventListener('close', fechou);
    };
  }, [modo, n]);

  const passo = (d: number) => {
    setLargura(null);
    setAberta((i) => (i + d + n) % n);
  };

  if (!n) return null;

  return (
    <div className="galeria-casa">
      {/* celular: de borda a borda, deslizando */}
      <div className="galeria-casa-celular">
        <div
          className="galeria-casa-trilho sem-barra"
          onScroll={(e) => setAtual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {fotos.map((src, i) => (
            <button key={src} type="button" onClick={() => abrirGrade(i)} className={`galeria-casa-slide ${i > 0 ? 'adiar' : ''}`}>
              <Image
                src={src}
                alt={alts[i]}
                fill
                sizes={i === 0 ? TAMANHO_CAPA : '100vw'}
                preload={i === 0}
                fetchPriority={i === 0 ? 'high' : undefined}
                quality={80}
                className="object-cover"
              />
            </button>
          ))}
        </div>
        {n > 1 && (
          <button
            type="button"
            onClick={() => abrirGrade(atual)}
            className="galeria-contador galeria-casa-contador vidro vidro-escuro numeros"
            aria-label={`${atual + 1}/${n}. ${preencher(T.verFotos, { n })}`}
          >
            <IconeCasa nome="fotos" className="size-4" />
            <span aria-hidden="true">
              {atual + 1}/{n}
            </span>
          </button>
        )}
      </div>

      {/* computador: a grande e quatro pequenas */}
      <div className="galeria-casa-mosaico moldura">
        <div className="galeria-casa-pecas" data-quantas={Math.min(n, 5)}>
          {fotos.slice(0, 5).map((src, i) => (
            <button key={src} type="button" onClick={() => abrirFoto(i)} className="galeria-casa-peca">
              <Image
                src={src}
                alt={alts[i]}
                fill
                sizes={i === 0 ? TAMANHO_CAPA : '(min-width: 1024px) 25vw, 50vw'}
                preload={i === 0}
                fetchPriority={i === 0 ? 'high' : undefined}
                quality={80}
                className="object-cover"
              />
            </button>
          ))}
          {n > 1 && (
            <button type="button" onClick={() => abrirGrade(0)} className="etiqueta vidro vidro-escuro galeria-casa-todas">
              <IconeCasa nome="fotos" className="size-4" />
              {preencher(T.verFotos, { n })}
            </button>
          )}
        </div>
      </div>

      <dialog
        ref={dialogo}
        className="galeria-casa-dialogo"
        aria-label={T.galeria}
        onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}
      >
        <div className="galeria-casa-dialogo-topo">
          {modo === 'foto' ? (
            <button type="button" className="galeria-casa-voltar" onClick={voltarParaGrade}>
              <IconeCasa nome="esquerda" className="size-5" />
              {T.voltar}
            </button>
          ) : (
            <p className="font-semibold">
              {T.galeria} <span className="numeros font-normal text-white/75">· {n}</span>
            </p>
          )}
          <button type="button" className="botao min-h-11" onClick={() => dialogo.current?.close()}>
            {T.fechar}
          </button>
        </div>

        {modo === 'grade' ? (
          <div ref={grade} className="galeria-casa-dialogo-grade">
            {fotos.map((src, i) => (
              <button key={src} type="button" data-foto={i} onClick={() => abrirFoto(i)} className="galeria-casa-dialogo-peca">
                {/* a proporção fica num bloco por dentro: no Safari, o item da grade com aspect-ratio perdia a altura */}
                <span className="galeria-casa-dialogo-moldura">
                  <Image src={src} alt={alts[i]} fill sizes="(min-width: 640px) 50vw, 100vw" quality={75} className="object-cover" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="galeria-casa-dialogo-foto">
            <p className="numeros text-small text-white/80">{preencher(T.fotoDe, { i: aberta + 1, n })}</p>
            <div className="galeria-casa-dialogo-palco" style={largura ? { maxWidth: largura } : undefined}>
              <Image
                key={fotos[aberta]}
                src={fotos[aberta]}
                alt={alts[aberta]}
                fill
                sizes="100vw"
                quality={85}
                className="object-contain"
                onLoad={(e) => {
                  // o navegador escolheu um arquivo do srcset ("…&w=1920"): a foto tem de verdade naturalWidth × w / tela
                  // pixels, porque o servidor nunca aumenta a foto além do tamanho dela
                  const img = e.currentTarget;
                  const w = Number(new URL(img.currentSrc, window.location.href).searchParams.get('w')) || 0;
                  setLargura(Math.round(img.naturalWidth * (w ? w / window.innerWidth : 1)));
                }}
              />
            </div>
            {n > 1 && (
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => passo(-1)} className="botao min-h-12 px-5" aria-label={T.anterior}>
                  <IconeCasa nome="esquerda" className="size-6" />
                </button>
                <button type="button" onClick={() => passo(1)} className="botao min-h-12 px-5" aria-label={T.proxima}>
                  <IconeCasa nome="direita" className="size-6" />
                </button>
              </div>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}

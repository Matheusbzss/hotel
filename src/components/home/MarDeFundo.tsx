'use client';

import { useEffect, useRef } from 'react';
import type { Cena, PinoCena } from './cena-mar';
import { useEstadoHome } from './EstadoHome';

function webglDisponivel(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * O mar 3D atrás da página inicial. O texto, os botões e o boletim chegam primeiro; a cena (three.js) é
 * carregada quando o navegador fica livre e entra por cima da imagem parada do mesmo céu. Sem WebGL, com
 * "reduzir movimento" ou com economia de dados, fica só a imagem parada (e o mapa plano na seção do mapa).
 */
export function MarDeFundo({ pinos }: { pinos: PinoCena[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cenaRef = useRef<Cena | null>(null);
  const { pino } = useEstadoHome();
  const pinoRef = useRef(pino);

  useEffect(() => {
    pinoRef.current = pino;
    cenaRef.current?.destacar(pino);
  }, [pino]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const economia = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (reduzido || economia || !webglDisponivel()) return;

    let cancelado = false;
    let limpar = () => {};

    async function iniciar() {
      const [{ criarCena }, litoral, { gsap }, { ScrollTrigger }] = await Promise.all([
        import('./cena-mar'),
        import('@/data/litoral.json'),
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelado || !canvas) return;
      const janelaMar = document.getElementById('mar-janela');
      const janelaMapa = document.getElementById('mapa-janela');
      let rotulos: Map<string, HTMLElement> | null = null;
      const cena = criarCena({
        canvas,
        litoral: litoral.default as unknown as { terra: [number, number][][] },
        pinos,
        janelaMapa,
        celular: matchMedia('(max-width: 767px), (pointer: coarse)').matches,
        rotulos: () => {
          if (!rotulos) {
            rotulos = new Map();
            document.querySelectorAll<HTMLElement>('[data-pino]').forEach((el) => rotulos!.set(el.dataset.pino!, el));
          }
          return rotulos;
        },
      });
      if (!cena) return;
      cenaRef.current = cena;
      cena.destacar(pinoRef.current);

      // a câmera sobe do mar ao mapa enquanto a seção do mapa entra na tela, com 0,6 s de atraso
      gsap.registerPlugin(ScrollTrigger);
      const voo = { t: 0 };
      const tween = gsap.to(voo, {
        t: 1,
        ease: 'none',
        scrollTrigger: { trigger: janelaMapa, start: 'top bottom', end: 'top top', scrub: 0.6 },
        onUpdate: () => {
          cena.definirProgresso(voo.t);
          document.documentElement.dataset.voo = voo.t.toFixed(2);
        },
      });
      // quando a página muda de altura acima do mapa (filtro de cidade, perguntas abertas), as posições
      // da rolagem são recalculadas; sem isso a câmera voltaria para o mar
      let espera = 0;
      const ro = new ResizeObserver(() => {
        window.clearTimeout(espera);
        espera = window.setTimeout(() => ScrollTrigger.refresh(), 120);
      });
      ro.observe(document.body);

      // só desenha quando o mar ou o mapa estão na tela e a aba está visível
      const visiveis = new Set<Element>();
      const atualizar = () => cena.ativo(visiveis.size > 0 && !document.hidden);
      const io = new IntersectionObserver((entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target);
          else visiveis.delete(e.target);
        }
        atualizar();
      });
      [janelaMar, janelaMapa].forEach((el) => el && io.observe(el));
      document.addEventListener('visibilitychange', atualizar);
      const redimensionar = () => cena.redimensionar();
      window.addEventListener('resize', redimensionar);

      // inclinar o celular inclina o horizonte; no iPhone a permissão é pedida no primeiro toque no mar
      const orientacao = (e: DeviceOrientationEvent) => {
        if (e.gamma !== null && e.beta !== null) cena.inclinar(e.gamma, e.beta);
      };
      const PedirPermissao = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
      const primeiroToque = async () => {
        try {
          if ((await PedirPermissao?.()) === 'granted') window.addEventListener('deviceorientation', orientacao);
        } catch {
          // sem permissão: o mar continua respondendo ao toque
        }
      };
      if (PedirPermissao) janelaMar?.addEventListener('pointerdown', primeiroToque, { once: true });
      else window.addEventListener('deviceorientation', orientacao);

      document.documentElement.dataset.mar3d = 'on';
      requestAnimationFrame(() => canvas.setAttribute('data-pronto', ''));

      limpar = () => {
        ro.disconnect();
        window.clearTimeout(espera);
        tween.scrollTrigger?.kill();
        tween.kill();
        io.disconnect();
        document.removeEventListener('visibilitychange', atualizar);
        window.removeEventListener('resize', redimensionar);
        window.removeEventListener('deviceorientation', orientacao);
        janelaMar?.removeEventListener('pointerdown', primeiroToque);
        delete document.documentElement.dataset.mar3d;
        cena.destruir();
        cenaRef.current = null;
      };
    }

    const ocioso = 'requestIdleCallback' in window;
    const id = ocioso
      ? window.requestIdleCallback(() => void iniciar(), { timeout: 1500 })
      : window.setTimeout(() => void iniciar(), 700);
    return () => {
      cancelado = true;
      if (ocioso) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
      limpar();
    };
  }, [pinos]);

  return (
    <div className="mar-fixo" aria-hidden="true">
      <div className="mar-poster" />
      <canvas ref={canvasRef} className="mar-canvas" />
    </div>
  );
}

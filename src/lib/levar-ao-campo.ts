/** A duração da rolagem até o campo: a da entrada no site (--dur-entrada, MASTER.md). */
export const DURACAO_ROLAGEM_MS = 360;

/** A curva da rolagem: começa rápida e para devagar, perto da cubic-bezier(0.2, 0, 0, 1) do site. */
export const curvaDaRolagem = (t: number) => 1 - (1 - t) ** 4;

/**
 * Pacote 34 (ENT-02): leva a tela até o campo que falta no cartão de reserva, no meio da tela (longe da cápsula do menu,
 * presa no topo, e da barra de baixo), e põe o foco nele sem a tela pular. Com "reduzir movimento", a tela vai direto.
 * Só no navegador (usa o DOM).
 *
 * A rolagem é feita aqui, quadro a quadro, e não com o scrollIntoView suave do navegador: o toque também põe avisos na
 * página (embaixo dos campos, às vezes acima da tela), e o navegador mexe na tela para compensar o que cresceu lá em
 * cima. No Safari, esse ajuste cancelava a rolagem suave e a tela ficava parada (visto no WebKit em 26/11, no passeio e
 * no transfer; o Chrome não cancelava). Quadro a quadro, o destino é medido de novo a cada passo e o ajuste não atrapalha.
 * Começa no quadro seguinte, com os avisos já na página. O foco também vai no quadro seguinte, fora do toque: no iPhone,
 * ele não abre sozinho o calendário nem o teclado por cima da rolagem. Se a pessoa mexer na tela no meio, a rolagem para.
 */
export function levarAoCampo(
  bloco: HTMLElement | null | undefined,
  foco?: HTMLElement | null,
  /** 'start': o começo do bloco logo abaixo da cápsula do menu (com o scroll-margin-top dele), como o título de um cartão */
  posicao: 'center' | 'start' = 'center',
) {
  if (!bloco) return;
  window.requestAnimationFrame((inicio) => {
    const raiz = document.documentElement;
    /** Onde a tela tem de estar (scrollY) para o bloco ficar no lugar, medido agora. */
    const destino = () => {
      const r = bloco.getBoundingClientRect();
      const margem = Number.parseFloat(window.getComputedStyle(bloco).scrollMarginTop) || 0;
      const desvio = posicao === 'start' ? r.top - margem : r.top - (window.innerHeight - r.height) / 2;
      const maximo = raiz.scrollHeight - window.innerHeight;
      return Math.min(Math.max(0, window.scrollY + desvio), Math.max(0, maximo));
    };
    // o foco no campo (o teclado e o leitor de tela começam por ele), sem o navegador rolar por conta própria
    foco?.focus({ preventScroll: true });
    // cada passo vai direto: com o "scroll-behavior: smooth" da página, cada passo viraria outra rolagem suave
    const antes = raiz.style.scrollBehavior;
    raiz.style.scrollBehavior = 'auto';
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduzir) {
      window.scrollTo(0, destino());
      raiz.style.scrollBehavior = antes;
      return;
    }
    const de = window.scrollY;
    let parou = false;
    const parar = () => {
      parou = true;
    };
    window.addEventListener('touchstart', parar, { once: true, passive: true });
    window.addEventListener('wheel', parar, { once: true, passive: true });
    const passo = (agora: number) => {
      const t = parou ? 1 : Math.min(1, (agora - inicio) / DURACAO_ROLAGEM_MS);
      if (!parou) window.scrollTo(0, de + (destino() - de) * curvaDaRolagem(t));
      if (t < 1) {
        window.requestAnimationFrame(passo);
        return;
      }
      raiz.style.scrollBehavior = antes;
      window.removeEventListener('touchstart', parar);
      window.removeEventListener('wheel', parar);
    };
    window.requestAnimationFrame(passo);
  });
}

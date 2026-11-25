/**
 * A galeria do topo do passeio e o trilho de fotos da casa no celular (Pacote 27): no carregamento, só a 1ª foto
 * baixa. As outras nem entram na página até serem "liberadas", para não disputar a conexão com a 1ª, que é a foto
 * principal da página (o LCP). Mesmo com loading="lazy" e .adiar, o navegador pedia a 2ª e a 3ª junto com a 1ª,
 * porque estão ao lado dela, logo depois da borda da tela.
 *
 * Elas são liberadas quando a 1ª termina de carregar (onLoad), no primeiro toque ou deslize do trilho ou, por
 * garantia, depois de ESPERA_FOTOS_DA_GALERIA (o onLoad da 1ª pode ter acontecido antes de a página ficar pronta
 * para ouvir). Até lá, o slide fica só com a caixa de fundo. A tela cheia não muda.
 */

/** A espera máxima, em milissegundos, antes de as fotos 2 em diante entrarem na página. */
export const ESPERA_FOTOS_DA_GALERIA = 4000;

/** Se a foto de índice i já entra na página: a 1ª sempre; as outras, só depois de liberadas. */
export const fotoMontada = (i: number, liberadas: boolean): boolean => i === 0 || liberadas;

/** A garantia: chama liberar depois da espera, mesmo sem toque nem onLoad. Devolve a limpeza (para o useEffect). */
export function liberarDepoisDaEspera(liberar: () => void, espera = ESPERA_FOTOS_DA_GALERIA): () => void {
  const relogio = setTimeout(liberar, espera);
  return () => clearTimeout(relogio);
}

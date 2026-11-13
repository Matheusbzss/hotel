/**
 * O CÍRCULO DA LOCALIZAÇÃO APROXIMADA DE UMA CASA (Fase 4, Etapa 7). O dono marca a casa no mapa do painel; esse ponto
 * fica só no banco, na tabela casas_pontos, que é FECHADA: nem o servidor do site lê a tabela direto, só as funções do
 * painel (marcar_ponto_da_casa e ponto_da_casa). O ponto nunca vai para a página. A página mostra um círculo de
 * RAIO_CIRCULO_M em volta de um CENTRO deslocado do ponto, que o banco grava na própria casa (casas.centro_lat e
 * casas.centro_lng): a distância (de DESLOCAMENTO_MINIMO_M a DESLOCAMENTO_MAXIMO_M) e a direção são sorteadas UMA vez,
 * pelo próprio banco, quando o ponto é marcado, e a linha do ponto não se apaga. Se o dono mudar o alfinete, o centro
 * anda junto, com o mesmo deslocamento: um sorteio novo a cada vez deixaria cruzar os círculos e achar a casa.
 *
 * Como o deslocamento máximo (350 m) é menor que o raio (500 m), a casa fica sempre dentro do círculo.
 *
 * A conta do centro é a mesma do gatilho casas_pontos_centro (supabase/migrations/20261113223000_...): o ponto de
 * destino numa esfera, a partir de um ponto, uma direção (graus a partir do norte, no sentido do relógio) e uma
 * distância. tests/circulo-casa.test.ts confere a conta; tests/casas-privado.test.ts confere que a página nunca cita a
 * tabela do ponto nem a função que o lê.
 */

export const RAIO_CIRCULO_M = 500;
export const DESLOCAMENTO_MINIMO_M = 150;
export const DESLOCAMENTO_MAXIMO_M = 350;

/** O raio médio da Terra, em metros (o mesmo do gatilho no banco). */
export const RAIO_DA_TERRA_M = 6_371_008.8;

export interface Ponto {
  lat: number;
  lng: number;
}

export interface Deslocamento {
  /** A distância do ponto ao centro, em metros. */
  metros: number;
  /** A direção, em graus a partir do norte, no sentido do relógio (0 a 360). */
  direcaoGraus: number;
}

const radianos = (graus: number) => (graus * Math.PI) / 180;
const graus = (rad: number) => (rad * 180) / Math.PI;

/** O centro do círculo público: o ponto da casa andado `deslocamento.metros` na direção sorteada. */
export function centroDoCirculo(ponto: Ponto, deslocamento: Deslocamento): Ponto {
  const d = deslocamento.metros / RAIO_DA_TERRA_M;
  const t = radianos(deslocamento.direcaoGraus);
  const f1 = radianos(ponto.lat);
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(t));
  const l2 = radianos(ponto.lng) + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return { lat: graus(f2), lng: graus(l2) };
}

/** A distância entre dois pontos, em metros (haversine). */
export function distanciaMetros(a: Ponto, b: Ponto): number {
  const df = radianos(b.lat - a.lat);
  const dl = radianos(b.lng - a.lng);
  const h = Math.sin(df / 2) ** 2 + Math.cos(radianos(a.lat)) * Math.cos(radianos(b.lat)) * Math.sin(dl / 2) ** 2;
  return 2 * RAIO_DA_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Um deslocamento sorteado, como o banco sorteia (para o computador sem o banco, em .data/casas). Recebe o sorteio
 * de 0 a 1 para os testes poderem fixá-lo.
 */
export function sortearDeslocamento(sorteio: () => number = Math.random): Deslocamento {
  return {
    metros: DESLOCAMENTO_MINIMO_M + sorteio() * (DESLOCAMENTO_MAXIMO_M - DESLOCAMENTO_MINIMO_M),
    direcaoGraus: (sorteio() * 360) % 360,
  };
}

/** A casa está dentro do círculo de RAIO_CIRCULO_M em volta do centro? */
export const casaDentroDoCirculo = (ponto: Ponto, centro: Ponto) => distanciaMetros(ponto, centro) < RAIO_CIRCULO_M;

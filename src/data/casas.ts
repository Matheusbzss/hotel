import type { TabelaDiarias } from '@/lib/diarias';
import type { Cidade, Lista, Texto } from './passeios';

/**
 * CASAS DE TEMPORADA DA ORLA NATIVA: casas de alto padrão com vista para o mar, para grupos grandes (texto da
 * pendência 6 do FASE-4), reservadas no site com sinal de SINAL_PORCENTO (src/lib/diarias.ts) do total.
 *
 * As casas ficam no banco (tabelas casas, casas_tarifas e casas_bloqueios; src/lib/casas.ts) e são
 * cadastradas no painel, em /admin/casas. Com as fotos e as informações que o dono mandar:
 * 1. Fotos em /public/fotos/casas/<slug>/ (a primeira é a capa).
 * 2. Preencha o cadastro. Não invente nada: o que o dono não mandou, pergunte.
 * 3. O dono marca a casa no mapa do painel, colando as coordenadas do Google Maps (Pacote 32). O ponto fica só numa
 *    tabela fechada do banco; a página mostra um círculo em volta de um centro sorteado perto do ponto, na foto de
 *    satélite do site (/mapa/casas/<slug>). O endereço exato não é cadastrado: a equipe manda a localização pelo
 *    WhatsApp depois da reserva.
 * Sem casa no ar, a página mostra "Em breve", e "Casas" fica fora do menu e do Google.
 *
 * DIÁRIAS (as contas estão em src/lib/diarias.ts): `diaria` vale fora dos períodos; um período de
 * `temporadas` troca a diária naquelas noites, e um de `feriados` vale por cima da temporada. Cada
 * período pode ter o próprio mínimo de noites.
 * As datas são da primeira e da última NOITE do período (AAAA-MM-DD).
 */

export type CidadeCasa = Exclude<Cidade, 'rio-de-janeiro'>;

export interface Casa extends TabelaDiarias {
  slug: string;
  cidade: CidadeCasa;
  nome: Texto;
  /** A praia ou o bairro, que aparece antes da reserva ("Praia de Geribá"). */
  local: Texto;
  // Pacote 32: sem o endereço exato e sem o ponto digitado à mão (as colunas casas.endereco, lat_aprox e lng_aprox
  // continuam no banco, com o que tiverem, mas o site não lê nem grava mais). O mapa usa só o centro público do
  // círculo (CasaDoSite.centro, src/lib/casa.ts), que o banco calcula quando o dono marca a casa no painel.
  resumo: Texto;
  descricao: Texto;
  quartos: number;
  suites: number;
  banheiros: number;
  /** Quantas pessoas a casa recebe. */
  capacidade: number;
  /** Ex.: ['3 camas de casal', '4 camas de solteiro']. */
  camas: Lista;
  comodidades: Lista;
  regras: Lista;
  /** As regras de cancelamento da casa (a política do site manda olhar aqui). */
  cancelamento: Lista;
  /** Horários como '15h' ou '15h30'. */
  checkIn: string;
  checkOut: string;
  /** Em reais. */
  caucao: number;
  fotos: string[];
}

// A RESERVA DAS CASAS abre pelo interruptor RESERVA_CASAS (src/lib/reserva-casas.ts: 'desligado', o padrão, 'admin' ou
// 'publico'), e nunca sem o pagamento online. Fechada, a página mostra o calendário e a conta, e no lugar do botão de
// reservar avisa que a reserva abre em breve. Decisão do dono: quando abrir, a reserva se confirma sozinha com o sinal
// pago, sem a equipe confirmar antes.

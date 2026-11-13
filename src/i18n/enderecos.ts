import type { Idioma } from './config';

/** As tabelas têm só 'en' e 'es': o espanhol da Argentina ('es-ar') usa os mesmos endereços do 'es'. */
type IdiomaDaTabela = 'en' | 'es';
type Traducao = Record<IdiomaDaTabela, string>;

/** 'es-ar' lê a coluna 'es' das tabelas. */
const coluna = (idioma: Exclude<Idioma, 'pt'>): IdiomaDaTabela => (idioma === 'es-ar' ? 'es' : idioma);

/**
 * Os endereços públicos em espanhol e inglês, com as palavras que as pessoas pesquisam em cada idioma.
 * As pastas de src/app/[locale] seguem em português: o proxy troca um pelo outro (src/proxy.ts) e o endereço
 * em português de uma página /es, /es-ar ou /en redireciona para o traduzido com 301.
 *
 * Página nova sem linha aqui fica com o nome em português em todos os idiomas. Depois que um endereço
 * for publicado, trocar a tradução muda o link que o Google já conhece: nesse caso, crie o 301 do antigo.
 */
const SECOES: Record<string, Traducao> = {
  passeios: { en: 'tours', es: 'paseos' },
  transfer: { en: 'transfer', es: 'traslado' },
  contato: { en: 'contact', es: 'contacto' },
  'casas-de-temporada': { en: 'holiday-homes', es: 'casas-de-temporada' },
  'politica-de-cancelamento': { en: 'cancellation-policy', es: 'politica-de-cancelacion' },
  'politica-de-privacidade': { en: 'privacy-policy', es: 'politica-de-privacidad' },
  'termos-de-uso': { en: 'terms-of-use', es: 'terminos-de-uso' },
  // as páginas da Etapa 6, fora do Google: o link do pedido por e-mail e a saída da lista dos lembretes
  'consultar-pedido': { en: 'find-my-order', es: 'consultar-pedido' },
  'sair-da-lista': { en: 'unsubscribe', es: 'darse-de-baja' },
};

/** O endereço de cada passeio, pelo slug de src/data/passeios.ts. Só entra aqui o que muda de um idioma para outro. */
const PASSEIOS: Record<string, Partial<Traducao>> = {
  'escuna-buzios': { en: 'schooner-buzios', es: 'goleta-buzios' },
  'catamara-buzios': { en: 'catamaran-buzios', es: 'catamaran-buzios' },
  'quadriciclo-buzios': { en: 'quad-bike-buzios', es: 'cuatriciclo-buzios' },
  'lancha-buzios': { en: 'private-speedboat-buzios', es: 'lancha-privada-buzios' },
  'jet-ski-buzios': { es: 'moto-de-agua-buzios' },
  'helicoptero-buzios': { en: 'helicopter-buzios' },
  'barco-arraial-do-cabo': { en: 'boat-tour-arraial-do-cabo' },
  'mergulho-arraial-do-cabo': { en: 'scuba-diving-arraial-do-cabo', es: 'buceo-arraial-do-cabo' },
  'quadriciclo-arraial-do-cabo': { en: 'quad-bike-arraial-do-cabo', es: 'cuatriciclo-arraial-do-cabo' },
  'lancha-privativa-arraial-do-cabo': { en: 'private-speedboat-arraial-do-cabo', es: 'lancha-privada-arraial-do-cabo' },
  'mergulho-credenciado-arraial-do-cabo': { en: 'certified-divers-arraial-do-cabo', es: 'buceo-certificados-arraial-do-cabo' },
  'catamara-cabo-frio': { en: 'catamaran-cabo-frio', es: 'catamaran-cabo-frio' },
  'quadriciclo-cabo-frio': { en: 'quad-bike-cabo-frio', es: 'cuatriciclo-cabo-frio' },
  'escuna-cabo-frio': { en: 'schooner-cabo-frio', es: 'goleta-cabo-frio' },
  'lancha-privativa-cabo-frio': { en: 'private-speedboat-cabo-frio', es: 'lancha-privada-cabo-frio' },
};

/** O caminho inverso, do endereço público para o nome da pasta. */
function inverter(tabela: Record<string, Partial<Traducao>>, idioma: keyof Traducao): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tabela).flatMap(([interno, t]) => {
      const publico = t[idioma];
      return publico ? [[publico, interno]] : [];
    }),
  );
}

const SECOES_INTERNAS = { en: inverter(SECOES, 'en'), es: inverter(SECOES, 'es') };
const PASSEIOS_INTERNOS = { en: inverter(PASSEIOS, 'en'), es: inverter(PASSEIOS, 'es') };

/** `/passeios/escuna-buzios` → `/paseos/goleta-buzios`. O caminho vem sem o idioma ('es-ar' sai igual ao 'es'). */
export function caminhoPublico(idioma: Exclude<Idioma, 'pt'>, caminho: string): string {
  const col = coluna(idioma);
  const [, secao = '', slug, ...resto] = caminho.split('/');
  const novoSlug = secao === 'passeios' && slug ? (PASSEIOS[slug]?.[col] ?? slug) : slug;
  return ['', SECOES[secao]?.[col] ?? secao, ...(novoSlug === undefined ? [] : [novoSlug]), ...resto].join('/') || '/';
}

/** `/paseos/goleta-buzios` → `/passeios/escuna-buzios`. Quem já vem com o nome da pasta passa direto. */
export function caminhoInterno(idioma: Exclude<Idioma, 'pt'>, caminho: string): string {
  const col = coluna(idioma);
  const [, secaoPublica = '', slug, ...resto] = caminho.split('/');
  const secao = SECOES_INTERNAS[col][secaoPublica] ?? secaoPublica;
  const novoSlug = secao === 'passeios' && slug ? (PASSEIOS_INTERNOS[col][slug] ?? slug) : slug;
  return ['', secao, ...(novoSlug === undefined ? [] : [novoSlug]), ...resto].join('/') || '/';
}

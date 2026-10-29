import { CATEGORIAS, CIDADES, type Passeio } from '@/data/passeios';
import { fmt, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';

/** "por pessoa", "por veículo (até 2 pessoas)"… */
export function rotuloUnidade(p: Passeio, d: Dicionario): string {
  if (p.unidade === 'pessoa') return d.comum.porPessoa;
  const n = p.capacidadePorUnidade ?? 1;
  return fmt(p.unidade === 'veiculo' ? d.comum.porVeiculo : d.comum.porEmbarcacao, { n });
}

export const nomeCidade = (p: Passeio, idioma: Idioma) => CIDADES[p.cidade].nome[idioma];
export const nomeCategoria = (p: Passeio, idioma: Idioma) => CATEGORIAS[p.categoria].nome[idioma];

/** Cor do canhoto do bilhete por cidade. */
export const COR_CIDADE: Record<Passeio['cidade'], string> = {
  buzios: 'bg-coral',
  'arraial-do-cabo': 'bg-turquesa',
  'cabo-frio': 'bg-sol',
  'rio-de-janeiro': 'bg-areia',
};

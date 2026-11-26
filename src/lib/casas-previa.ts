import 'server-only';
import { CASAS_PARA_CADASTRAR, linhaDaCasa } from '../../scripts/dados/casas.ts';
import type { Bloqueio, CasaDoSite } from './casa';
import { detalhesDeLinha } from './casa-detalhes';
import { deLinhas, type LinhaBloqueio, type LinhaCasa } from './casas-banco';

/**
 * A PRÉVIA LOCAL DAS CASAS (Fase 4, Etapa 7): para enxergar a página das casas no computador antes de elas estarem no
 * banco. Só com CASAS_PREVIA=1 no ambiente e NUNCA na Vercel (lá a variável VERCEL sempre existe): a lista e a página
 * das casas leem as duas casas prontas de scripts/dados/casas.ts como se viessem do banco, pela mesma linha que o
 * cadastro grava (linhaDaCasa) e pela mesma leitura do site (deLinhas e detalhesDeLinha). Elas continuam desligadas
 * (ativo = false): não entram no menu, no mapa do site nem no Google, e o ponto no mapa fica vazio, como no banco.
 *
 * Sem a variável, nada muda. Depois de usar a prévia, rode o build de novo sem ela: a página de cada casa fica guardada
 * um dia no cache do servidor.
 */
export const previaDasCasas = (): boolean => process.env.CASAS_PREVIA === '1' && !process.env.VERCEL;

export interface CasaDaPrevia {
  casa: CasaDoSite;
  /** Os bloqueios iniciais (como o cadastro grava), para o calendário. */
  bloqueios: Pick<Bloqueio, 'inicio' | 'fim'>[];
}

/** As colunas que o banco preenche sozinho (o cadastro não manda). */
const DO_BANCO = {
  ativo: false,
  atualizado_em: '2026-11-13T00:00:00Z',
  criado_em: '2026-11-13T00:00:00Z',
  ical_erro: null,
  ical_sincronizado_em: null,
  ical_token: '00000000-0000-4000-8000-000000000000',
  centro_lat: null,
  centro_lng: null,
} as const;

let guardadas: CasaDaPrevia[] | null = null;

/** As casas da prévia (vazio sem CASAS_PREVIA=1 ou na Vercel). */
export function casasDaPrevia(): CasaDaPrevia[] {
  if (!previaDasCasas()) return [];
  guardadas ??= CASAS_PARA_CADASTRAR.map((c, i) => {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    const linha = { ...DO_BANCO, ...linhaDaCasa(c), id, ativo: false } as LinhaCasa;
    const bloqueios: LinhaBloqueio[] = c.bloqueios.map((b, n) => ({
      id: `${id.slice(0, -2)}${String(n + 1).padStart(2, '0')}`,
      casa_id: id,
      inicio: b.inicio,
      fim: b.fim,
      origem: 'manual',
      referencia: b.referencia,
      item_pedido_id: null,
      criado_em: DO_BANCO.criado_em,
    }));
    const {
      ativo: _ativo,
      icalUrl: _icalUrl,
      icalToken: _icalToken,
      icalSincronizadoEm: _em,
      icalErro: _erro,
      tarifas: _tarifas,
      bloqueios: doPainel,
      ...casa
    } = deLinhas(linha, [], bloqueios);
    return { casa: { ...casa, detalhes: detalhesDeLinha(linha), pacotes: c.pacotes, centro: null }, bloqueios: doPainel };
  });
  return guardadas;
}

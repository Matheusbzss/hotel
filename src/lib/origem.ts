/**
 * De onde o cliente veio: o que está no link do anúncio (utm_source = meta ou google, utm_medium = pago,
 * utm_campaign = o nome da campanha). Serve no navegador e no servidor, sem tocar em nada: assim dá para
 * testar (tests/origem.test.ts).
 */

export interface Origem {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** O código do clique no Google: só com o aceite dos cookies. */
  gclid?: string;
  /** Os cookies da Meta: só com o aceite dos cookies. */
  fbp?: string;
  fbc?: string;
  /** O navegador do cliente, que a Meta pede nas compras do site. */
  navegador?: string;
  /** O cliente aceitou os cookies de medição: sem isso, a compra não é avisada à Meta nem ao Google. */
  medicao?: true;
}

/** A campanha do último anúncio, por 30 dias. */
export const COOKIE_ORIGEM = 'on_origem';
export const IDADE_COOKIE_ORIGEM = 60 * 60 * 24 * 30;
/** Avisa o servidor de que o cliente aceitou os cookies de medição (a escolha fica no navegador). */
export const COOKIE_MEDICAO = 'on_medicao';

const CAMPOS_CAMPANHA = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

/** Tira o que não pode ir para o banco: quebras de linha e texto longo demais. */
const limpo = (valor: string | null | undefined) => valor?.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) || undefined;
const cliqueValido = (valor: string | null | undefined) => (valor && /^[\w-]{10,200}$/.test(valor) ? valor : undefined);

function semVazios(o: Origem): Origem {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/** Os parâmetros do anúncio no endereço aberto. Sem nenhum, null: a visita não veio de anúncio. */
export function origemDoLink(busca: string): Origem | null {
  const p = new URLSearchParams(busca);
  const o = semVazios({
    ...Object.fromEntries(CAMPOS_CAMPANHA.map((c) => [c, limpo(p.get(c))])),
    gclid: cliqueValido(p.get('gclid')),
  });
  return Object.keys(o).length ? o : null;
}

export const escreverOrigem = (o: Origem) => encodeURIComponent(JSON.stringify(o));

/** Lê o cookie, que qualquer um pode mexer: só passa o que tem o formato certo. */
export function lerOrigem(valor: string | undefined): Origem {
  if (!valor) return {};
  try {
    const o = JSON.parse(decodeURIComponent(valor)) as Record<string, unknown>;
    const texto = (v: unknown) => (typeof v === 'string' ? v : undefined);
    return semVazios({
      ...Object.fromEntries(CAMPOS_CAMPANHA.map((c) => [c, limpo(texto(o[c]))])),
      gclid: cliqueValido(texto(o.gclid)),
    });
  } catch {
    return {};
  }
}

/** Só a campanha, sem nada que identifique o clique: o que vai para os carrinhos e as cotações. */
export const soCampanha = ({ utm_source, utm_medium, utm_campaign }: Origem): Origem =>
  semVazios({ utm_source, utm_medium, utm_campaign });

/** Para o painel: "meta · verao-buzios". */
export const textoDaOrigem = (o: Origem | undefined) => [o?.utm_source, o?.utm_campaign].filter(Boolean).join(' · ');

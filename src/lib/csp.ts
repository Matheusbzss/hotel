/**
 * Leitura dos avisos da política de segurança do navegador (CSP em modo de aviso), para a rota /api/csp.
 * Sem import do Next nem do alias @/: os testes rodam com node direto.
 *
 * Tudo o que chega aqui vem de fora: qualquer um pode mandar um aviso, e outro site pode fazer o navegador dos visitantes
 * dele mandar avisos para cá. Por isso cada pedaço que vai para o registro passa por um filtro que só deixa o que um
 * aviso de verdade traz, com tamanho máximo, sem quebra de linha nem caractere de controle (uma quebra de linha
 * escreveria linhas falsas, iguais às do site, no registro) e sem dado de cliente (um e-mail no lugar do endereço).
 */

export type AvisoCsp = { regra: string; bloqueado: string; pagina: string };

/** Até quanto o corpo de um aviso pode ter, em bytes: um aviso de verdade tem poucos kB. */
export const TAMANHO_MAXIMO_AVISO = 20_000;

/** O tamanho máximo de cada pedaço da linha do registro. */
const MAXIMO = { regra: 40, origem: 100, esquema: 40, caminho: 120 } as const;

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Os dois formatos que o navegador manda: o antigo do report-uri ({ "csp-report": { ... } }, com hífens) e o novo da
 * Reporting API ([{ type: "csp-violation", body: { ... } }], em camelCase). Corpo que não é JSON vira lista vazia.
 */
export function lerAvisosCsp(corpo: string): AvisoCsp[] {
  let dados: unknown;
  try {
    dados = JSON.parse(corpo);
  } catch {
    return [];
  }
  const lista = Array.isArray(dados) ? dados : [dados];
  const avisos: AvisoCsp[] = [];
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const antigo = r['csp-report'];
    if (antigo && typeof antigo === 'object') {
      const a = antigo as Record<string, unknown>;
      avisos.push({
        regra: texto(a['effective-directive']) || texto(a['violated-directive']).split(' ')[0] || '?',
        bloqueado: texto(a['blocked-uri']),
        pagina: texto(a['document-uri']),
      });
      continue;
    }
    const corpoNovo = r.body;
    if (r.type === 'csp-violation' && corpoNovo && typeof corpoNovo === 'object') {
      const b = corpoNovo as Record<string, unknown>;
      avisos.push({ regra: texto(b.effectiveDirective) || '?', bloqueado: texto(b.blockedURL), pagina: texto(b.documentURL) });
    }
  }
  return avisos;
}

/** O nome da regra: só letras minúsculas e hífen, como as da CSP (script-src-elem, frame-ancestors…); o resto vira "?". */
export function regraDoAviso(valor: string): string {
  return /^[a-z][a-z-]*$/.test(valor) && valor.length <= MAXIMO.regra ? valor : '?';
}

/** O que o navegador escreve no lugar do endereço quando o bloqueado não é um arquivo de fora. */
const PALAVRAS_DO_NAVEGADOR = new Set([
  'inline',
  'eval',
  'wasm-eval',
  'trusted-types-policy',
  'trusted-types-sink',
  'self',
  'data',
  'blob',
]);

/**
 * Só a origem do que seria bloqueado ("https://exemplo.com"), o esquema de um endereço que não é da web ("data", "blob",
 * "chrome-extension") ou a palavra do navegador ("inline", "eval"). Qualquer outra coisa vira "outro": o campo vem de fora
 * e pode trazer um e-mail ou um texto inventado.
 */
export function origemDoBloqueio(valor: string): string {
  if (!valor) return '?';
  if (PALAVRAS_DO_NAVEGADOR.has(valor)) return valor;
  let u: URL;
  try {
    u = new URL(valor);
  } catch {
    return 'outro';
  }
  // a origem e o esquema saem do leitor de endereços: só letras, números e sinais, sem espaço nem quebra de linha
  if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ws:' || u.protocol === 'wss:') {
    return u.origin.slice(0, MAXIMO.origem);
  }
  return u.protocol.slice(0, -1).slice(0, MAXIMO.esquema);
}

/** Um endereço da web (http ou https) inteiro, ou null. */
function enderecoDaWeb(valor: string): URL | null {
  try {
    const u = new URL(valor);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * O caminho da página, sem parâmetros e com o código do pedido ou do voucher trocado por um marcador. Só de um endereço
 * da web inteiro, que é o que o navegador manda; qualquer outra coisa vira "?".
 */
export function caminhoDoAviso(valor: string): string {
  const u = valor ? enderecoDaWeb(valor) : null;
  if (!u) return '?';
  // o leitor de endereços já devolve o caminho codificado (%20, %0A): nada de espaço nem quebra de linha crus
  return u.pathname.replace(/\/(pedido|reserva|voucher|conferir)\/[^/]+/g, '/$1/:codigo').slice(0, MAXIMO.caminho);
}

/**
 * A linha que vai para o registro, ou null quando o aviso não é de uma página deste site: o navegador manda o aviso para o
 * mesmo endereço da página (report-uri /api/csp), então o de verdade sempre traz uma página com o host por onde a
 * requisição chegou (`hosts`). O que vem de outro site, que apontou os avisos dele para cá, fica de fora e não gasta o
 * teto do registro.
 */
export function linhaDoAviso(aviso: AvisoCsp, hosts: readonly string[]): string | null {
  const pagina = enderecoDaWeb(aviso.pagina);
  if (!pagina || !hosts.includes(pagina.host)) return null;
  const linha = `[csp] ${regraDoAviso(aviso.regra)} bloquearia ${origemDoBloqueio(aviso.bloqueado)} em ${caminhoDoAviso(aviso.pagina)}`;
  // a última garantia: só os caracteres visíveis do ASCII (nenhuma quebra de linha nem caractere de controle)
  return linha.replace(/[^\x20-\x7e]/g, '?');
}

/**
 * Os endereços deste site, como a requisição chegou (o host da URL e o do cabeçalho Host), para conferir de onde é a
 * página de cada aviso.
 */
export function hostsDaRequisicao(req: Request): string[] {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(req.url).host);
  } catch {}
  const cabecalho = req.headers.get('host')?.trim().toLowerCase();
  if (cabecalho) hosts.add(cabecalho);
  return [...hosts].filter(Boolean);
}

/**
 * O corpo da requisição como texto, lido só até `limite` bytes. Maior que isso, null: pelo Content-Length, sem ler nada,
 * ou contando o que chega (quando o tamanho não vem dito), parando de ler assim que passa.
 */
export async function lerCorpoAte(req: Request, limite: number = TAMANHO_MAXIMO_AVISO): Promise<string | null> {
  const declarado = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declarado) && declarado > limite) return null;
  if (!req.body) return '';
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) {
        await leitor.cancel().catch(() => undefined);
        return null;
      }
      partes.push(value);
    }
  } catch {
    return null;
  }
  const junto = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    junto.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return new TextDecoder().decode(junto);
}

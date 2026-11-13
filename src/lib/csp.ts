/**
 * Leitura dos avisos da política de segurança do navegador (CSP em modo de aviso), para a rota /api/csp.
 * Sem import do Next nem do alias @/: os testes rodam com node direto.
 */

export type AvisoCsp = { regra: string; bloqueado: string; pagina: string };

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

/** Só a origem do que seria bloqueado ("https://exemplo.com"), ou a palavra do navegador ("inline", "eval", "data"). */
export function origemDoBloqueio(valor: string): string {
  if (!valor) return '?';
  try {
    const u = new URL(valor);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'wss:' ? u.origin : u.protocol.replace(':', '');
  } catch {
    return valor.slice(0, 40);
  }
}

/** O caminho da página, sem parâmetros e com o código do pedido ou do voucher trocado por um marcador. */
export function caminhoDoAviso(valor: string): string {
  if (!valor) return '?';
  let caminho: string;
  try {
    caminho = new URL(valor).pathname;
  } catch {
    caminho = valor.split(/[?#]/)[0];
  }
  return caminho.replace(/\/(pedido|reserva|voucher|conferir)\/[^/]+/g, '/$1/:codigo').slice(0, 120);
}

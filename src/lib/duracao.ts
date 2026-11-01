/**
 * Duração aproximada de um passeio, lida do texto em português do cadastro ("2h30", "Cerca de 7 horas",
 * "30 minutos ou 1 hora", "Dia inteiro (cerca de 9 horas)"), e a faixa de cor do boletim que ela ocupa
 * (design-dna.json > color.data_scale). Sem dependências: roda no navegador e nos testes.
 */
export type FaixaDuracao = 'd1' | 'd2' | 'd3' | 'd4' | 'd5';

/** Horas do primeiro tempo citado no texto (a opção mais curta vem primeiro). */
export function horasDoTexto(texto: string): number | null {
  const s = texto.toLowerCase();
  // "2 ou 4 horas": o primeiro número herda a unidade do segundo
  const ou = s.match(/(\d+)\s*(?:ou|o|or)\s*\d+\s*(min|h)/);
  if (ou) return ou[2] === 'min' ? Number(ou[1]) / 60 : Number(ou[1]);
  const m = s.match(/(\d+)\s*(min|h)(?:[a-z]*)?\s*(\d{2})?/);
  if (m) {
    const n = Number(m[1]);
    if (m[2] === 'min') return n / 60;
    return n + (m[3] ? Number(m[3]) / 60 : 0);
  }
  if (/dia inteiro|día completo|full day/.test(s)) return 9;
  return null;
}

export function faixaDuracao(horas: number | null, diaInteiro = false): FaixaDuracao {
  if (diaInteiro || (horas !== null && horas > 8)) return 'd5';
  if (horas === null) return 'd3';
  if (horas <= 1.5) return 'd1';
  if (horas <= 3.5) return 'd2';
  if (horas <= 5) return 'd3';
  return 'd4';
}

/** "30 min", "2h30", "3 h"; o dia inteiro usa a palavra do idioma. */
export function horasCurtas(horas: number | null, palavraDia: string, diaInteiro = false): string {
  if (diaInteiro || horas === null) return palavraDia;
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  const h = Math.floor(horas);
  const min = Math.round((horas - h) * 60);
  return min ? `${h}h${String(min).padStart(2, '0')}` : `${h} h`;
}

export const ehDiaInteiro = (textoPt: string) => /dia inteiro/i.test(textoPt);

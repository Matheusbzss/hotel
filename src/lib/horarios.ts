import type { Idioma } from '@/i18n/config';

/**
 * Para reservar no mesmo dia: o horário precisa começar pelo menos este tanto depois de agora
 * (120 = 2 horas). Se mudar, ajuste também os textos que falam das 2 horas nos três idiomas:
 * checkout.horarioHoje e a resposta da pergunta sobre o horário de saída (faq).
 */
export const ANTECEDENCIA_MINIMA_MINUTOS = 120;

/** "14:30" → 870 (minutos desde a meia-noite). */
export function paraMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** A data (AAAA-MM-DD) e os minutos desde a meia-noite, agora, no fuso de Búzios. */
export function agoraEmBuzios(agora: Date = new Date()): { data: string; minutos: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(agora)
      .map((parte) => [parte.type, parte.value]),
  );
  return { data: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * As horas que ainda dá para reservar na data. Sem data escolhida, todas; no dia de hoje, só as que
 * começam pelo menos ANTECEDENCIA_MINIMA_MINUTOS depois de agora; em data que já passou, nenhuma.
 */
export function horasDisponiveis(horas: string[], dataIso: string, agora: Date = new Date()): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return horas;
  const { data: hoje, minutos } = agoraEmBuzios(agora);
  if (dataIso > hoje) return horas;
  if (dataIso < hoje) return [];
  return horas.filter((h) => paraMinutos(h) >= minutos + ANTECEDENCIA_MINIMA_MINUTOS);
}

/** O primeiro dia que ainda tem horário: hoje, ou amanhã quando os horários de hoje já passaram. */
export function primeiroDiaComHorario(horas: string[], agora: Date = new Date()): string {
  const hoje = agoraEmBuzios(agora).data;
  if (horasDisponiveis(horas, hoje, agora).length > 0) return hoje;
  const amanha = new Date(`${hoje}T12:00:00Z`);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  return amanha.toISOString().slice(0, 10);
}

/** A hora como se escreve em cada idioma: 9h (pt), 9 h (es e es-ar), 9am (en). */
export function formatarHora(hora: string, idioma: Idioma): string {
  const [h, m] = hora.split(':').map(Number);
  const mm = String(m).padStart(2, '0');
  if (idioma === 'en') return `${h % 12 || 12}${m ? `:${mm}` : ''}${h < 12 ? 'am' : 'pm'}`;
  // espaço que não quebra: o "h" nunca fica sozinho na linha de baixo
  if (idioma === 'es' || idioma === 'es-ar') return `${h}${m ? `:${mm}` : ''} h`;
  return `${h}h${m ? mm : ''}`;
}

/**
 * As horas de um passeio numa frase: "9h, 11h ou 14h", ou, quando vão de hora em hora,
 * o modelo `deHoraEmHora` ("De hora em hora, das {inicio} às {fim}").
 */
export function textoHorarios(horas: string[], idioma: Idioma, locale: string, deHoraEmHora: string): string {
  const seguidas = horas.length > 3 && horas.every((h, i) => i === 0 || paraMinutos(h) - paraMinutos(horas[i - 1]) === 60);
  if (seguidas) {
    return deHoraEmHora.replace('{inicio}', formatarHora(horas[0], idioma)).replace('{fim}', formatarHora(horas[horas.length - 1], idioma));
  }
  return new Intl.ListFormat(locale, { type: 'disjunction' }).format(horas.map((h) => formatarHora(h, idioma)));
}

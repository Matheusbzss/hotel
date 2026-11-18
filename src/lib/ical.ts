/**
 * O calendário no formato iCal (.ics), nos dois sentidos com o Airbnb: ler o que ele exporta e gerar o
 * link com as nossas datas. Aqui só se traduz texto, sem tocar na rede: assim dá para testar
 * (tests/ical.test.ts).
 */

/** Um período ocupado: a data de entrada e a de saída (AAAA-MM-DD). A noite da saída fica livre. */
export interface EventoIcal {
  inicio: string;
  fim: string;
  uid?: string;
}

/** Uma linha longa continua na seguinte, que começa com um espaço. */
const linhasDo = (texto: string) => texto.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');

/** "DTSTART;VALUE=DATE:20261210" ou "DTSTART:20261210T150000Z" viram "2026-12-10". */
function dataDaLinha(linha: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(linha.slice(linha.indexOf(':') + 1).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function diaSeguinte(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Lê os períodos ocupados. Dá erro se o texto não for um calendário, para não apagar os bloqueios por engano. */
export function lerIcal(texto: string): EventoIcal[] {
  const linhas = linhasDo(texto);
  if (!linhas.some((l) => l.trim() === 'BEGIN:VCALENDAR')) throw new Error('O link não devolveu um calendário');
  const eventos: EventoIcal[] = [];
  let atual: Partial<EventoIcal> & { cancelado?: boolean } = {};
  for (const linha of linhas) {
    const campo = linha.split(/[;:]/, 1)[0].trim().toUpperCase();
    if (linha.trim() === 'BEGIN:VEVENT') atual = {};
    else if (campo === 'DTSTART') atual.inicio = dataDaLinha(linha) ?? undefined;
    else if (campo === 'DTEND') atual.fim = dataDaLinha(linha) ?? undefined;
    else if (campo === 'UID') atual.uid = linha.slice(linha.indexOf(':') + 1).trim();
    else if (campo === 'STATUS') atual.cancelado = linha.toUpperCase().includes('CANCELLED');
    else if (linha.trim() === 'END:VEVENT' && atual.inicio && !atual.cancelado) {
      // sem a data de saída, ou com a saída no mesmo dia, ocupa uma noite
      const fim = atual.fim && atual.fim > atual.inicio ? atual.fim : diaSeguinte(atual.inicio);
      eventos.push({ inicio: atual.inicio, fim, ...(atual.uid ? { uid: atual.uid } : {}) });
    }
  }
  return eventos;
}

/** O link que vai para o Airbnb: só as datas, sem nenhum dado de cliente. */
export function gerarIcal(periodos: { id: string; inicio: string; fim: string }[], agora: Date): string {
  const data = (d: string) => d.replaceAll('-', '');
  const carimbo = agora.toISOString().replace(/[-:]|\.\d{3}/g, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Orla Nativa//Casas//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...periodos.flatMap((p) => [
      'BEGIN:VEVENT',
      `UID:${p.id}@orlanativa`,
      `DTSTAMP:${carimbo}`,
      `DTSTART;VALUE=DATE:${data(p.inicio)}`,
      `DTEND;VALUE=DATE:${data(p.fim)}`,
      'SUMMARY:Reservado',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

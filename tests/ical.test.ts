import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarIcal, lerIcal } from '../src/lib/ical.ts';

// um calendário no formato que o Airbnb exporta (com datas fictícias)
const AIRBNB = [
  'BEGIN:VCALENDAR',
  'PRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 1.0//EN',
  'CALSCALE:GREGORIAN',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261205',
  'DTSTART;VALUE=DATE:20261201',
  'UID:1418fb94e984-abc@airbnb.com',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/de',
  ' tails/ABCDEF\\nPhone Number (Last 4 Digits): 1234',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTAMP:20261106T120000Z',
  'DTSTART;VALUE=DATE:20261220',
  'DTEND;VALUE=DATE:20261222',
  'UID:outro@airbnb.com',
  'SUMMARY:Airbnb (Not available)',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

test('lê as datas ocupadas do calendário do Airbnb', () => {
  assert.deepEqual(lerIcal(AIRBNB), [
    { inicio: '2026-12-01', fim: '2026-12-05', uid: '1418fb94e984-abc@airbnb.com' },
    { inicio: '2026-12-20', fim: '2026-12-22', uid: 'outro@airbnb.com' },
  ]);
});

test('lê outros jeitos de escrever o evento', () => {
  const ical = (...linhas: string[]) => ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', ...linhas, 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  // data com hora
  assert.deepEqual(lerIcal(ical('DTSTART:20261201T150000Z', 'DTEND:20261203T110000Z')), [{ inicio: '2026-12-01', fim: '2026-12-03' }]);
  // sem saída, ocupa uma noite
  assert.deepEqual(lerIcal(ical('DTSTART;VALUE=DATE:20261231')), [{ inicio: '2026-12-31', fim: '2027-01-01' }]);
  // evento cancelado não ocupa nada
  assert.deepEqual(lerIcal(ical('DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261203', 'STATUS:CANCELLED')), []);
  // calendário vazio é válido: a casa não tem nenhuma reserva lá
  assert.deepEqual(lerIcal('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'), []);
});

test('uma resposta que não é calendário dá erro, para não apagar os bloqueios', () => {
  assert.throws(() => lerIcal('<html>Página de login</html>'));
  assert.throws(() => lerIcal(''));
});

test('gera o link com as datas, sem dado de cliente, e ele volta igual na leitura', () => {
  const texto = gerarIcal(
    [
      { id: 'abc', inicio: '2026-12-01', fim: '2026-12-05' },
      { id: 'def', inicio: '2027-01-02', fim: '2027-01-03' },
    ],
    new Date('2026-11-06T12:30:00.000Z'),
  );
  assert.ok(texto.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(texto.endsWith('END:VCALENDAR\r\n'));
  assert.ok(texto.includes('DTSTAMP:20261106T123000Z'));
  assert.ok(texto.includes('DTSTART;VALUE=DATE:20261201'));
  assert.deepEqual(lerIcal(texto), [
    { inicio: '2026-12-01', fim: '2026-12-05', uid: 'abc@orlanativa' },
    { inicio: '2027-01-02', fim: '2027-01-03', uid: 'def@orlanativa' },
  ]);
  // um calendário sem datas continua válido
  assert.deepEqual(lerIcal(gerarIcal([], new Date())), []);
});

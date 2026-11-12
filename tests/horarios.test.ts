import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarHora, horasDisponiveis, primeiroDiaComHorario, textoHorarios } from '../src/lib/horarios.ts';
import { HORARIOS_POR_CATEGORIA, PASSEIOS, horariosDoPasseio } from '../src/data/passeios.ts';

// Búzios fica 3 horas atrás de UTC: 17h20 UTC = 14h20 em Búzios, no dia 2 de novembro de 2026
const AGORA = new Date('2026-11-02T17:20:00Z');
const BARCO = HORARIOS_POR_CATEGORIA.barco.horas;
const LIVRE = HORARIOS_POR_CATEGORIA.lancha.horas;
const passeio = (slug: string) => PASSEIOS.find((p) => p.slug === slug)!;

test('horários de cada tipo de passeio (tabela da Etapa 5)', () => {
  assert.deepEqual(BARCO, ['09:00', '11:00', '14:00']);
  assert.deepEqual(HORARIOS_POR_CATEGORIA['city-tour'], { horas: ['07:00'], busca: true });
  assert.deepEqual(HORARIOS_POR_CATEGORIA.mergulho.horas, ['07:00', '10:00']);
  assert.equal(LIVRE.length, 11);
  assert.equal(LIVRE[0], '07:00');
  assert.equal(LIVRE[10], '17:00');
  assert.deepEqual(HORARIOS_POR_CATEGORIA.aventura.horas, LIVRE);
  assert.deepEqual(HORARIOS_POR_CATEGORIA['buggy-quadriciclo'].horas, LIVRE);
});

test('passeios com horário próprio', () => {
  assert.deepEqual(horariosDoPasseio(passeio('trolley-buzios')), { horas: ['08:00', '11:00', '14:00'], busca: true });
  assert.deepEqual(horariosDoPasseio(passeio('escuna-cabo-frio')), { horas: ['09:00', '11:00', '14:00'], busca: true });
  assert.deepEqual(horariosDoPasseio(passeio('lancha-privativa-arraial-do-cabo')), { horas: ['10:00'], busca: false });
  assert.deepEqual(horariosDoPasseio(passeio('lancha-privativa-cabo-frio')), { horas: ['10:00'], busca: false });
  assert.deepEqual(horariosDoPasseio(passeio('city-tour-rio-de-janeiro')), { horas: ['07:00'], busca: true });
});

test('todo passeio tem horários válidos, em ordem', () => {
  for (const p of PASSEIOS) {
    const { horas } = horariosDoPasseio(p);
    assert.ok(horas.length > 0, p.slug);
    for (const h of horas) assert.match(h, /^([01]\d|2[0-3]):[0-5]\d$/, p.slug);
    assert.deepEqual([...horas].sort(), horas, p.slug);
  }
});

test('a hora em cada idioma', () => {
  assert.equal(formatarHora('09:00', 'pt'), '9h');
  assert.equal(formatarHora('09:30', 'pt'), '9h30');
  assert.equal(formatarHora('14:00', 'es'), '14 h');
  // o espanhol da Argentina escreve a hora igual ao espanhol
  assert.equal(formatarHora('14:00', 'es-ar'), formatarHora('14:00', 'es'));
  assert.equal(formatarHora('09:30', 'es-ar'), formatarHora('09:30', 'es'));
  assert.equal(formatarHora('07:00', 'en'), '7am');
  assert.equal(formatarHora('12:00', 'en'), '12pm');
  assert.equal(formatarHora('14:00', 'en'), '2pm');
});

test('as horas numa frase', () => {
  const modelo = 'De hora em hora, das {inicio} às {fim}';
  assert.equal(textoHorarios(BARCO, 'pt', 'pt-BR', modelo), '9h, 11h ou 14h');
  assert.equal(textoHorarios(['07:00'], 'pt', 'pt-BR', modelo), '7h');
  assert.equal(textoHorarios(LIVRE, 'pt', 'pt-BR', modelo), 'De hora em hora, das 7h às 17h');
});

test('outro dia: todos os horários; dia que já passou: nenhum; sem data: todos', () => {
  assert.deepEqual(horasDisponiveis(BARCO, '2026-11-03', AGORA), BARCO);
  assert.deepEqual(horasDisponiveis(BARCO, '2026-11-01', AGORA), []);
  assert.deepEqual(horasDisponiveis(BARCO, '', AGORA), BARCO);
});

test('hoje: só o que começa daqui a pelo menos 2 horas', () => {
  // 14h20: os barcos já saíram; no horário livre, sobra só o das 17h
  assert.deepEqual(horasDisponiveis(BARCO, '2026-11-02', AGORA), []);
  assert.deepEqual(horasDisponiveis(LIVRE, '2026-11-02', AGORA), ['17:00']);
  // às 7h em ponto, o barco das 9h ainda dá; às 7h01, já não
  assert.deepEqual(horasDisponiveis(BARCO, '2026-11-02', new Date('2026-11-02T10:00:00Z')), BARCO);
  assert.deepEqual(horasDisponiveis(BARCO, '2026-11-02', new Date('2026-11-02T10:01:00Z')), ['11:00', '14:00']);
  // 23h30 em Búzios ainda é o dia 2, mesmo que em UTC já seja dia 3
  assert.deepEqual(horasDisponiveis(BARCO, '2026-11-03', new Date('2026-11-03T02:30:00Z')), BARCO);
});

test('primeiro dia com horário', () => {
  assert.equal(primeiroDiaComHorario(BARCO, AGORA), '2026-11-03');
  assert.equal(primeiroDiaComHorario(LIVRE, AGORA), '2026-11-02');
  // virada do mês
  assert.equal(primeiroDiaComHorario(BARCO, new Date('2026-11-30T20:00:00Z')), '2026-12-01');
});

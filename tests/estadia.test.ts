import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOITES_LIVRES_DO_FIM_DE_SEMANA,
  contaEstadia,
  dataValida,
  diaDaSemana,
  gruposDePacotes,
  menorDiariaCentavos,
  noiteDeFimDeSemana,
  noitesDoFimDeSemana,
  pacotesComValores,
  pacotesSobrepostos,
  partesDaEstadia,
  type Pacote,
  type TabelaEstadia,
} from '../src/lib/estadia.ts';
import { precoPixCentavos } from '../src/lib/orcamento.ts';

// As tabelas das duas casas com os preços do dono (FASE-4, Etapa 7, e os DADOS.md de 06 e 07/11). Os pacotes são os da
// conta de exemplo: Natal, Réveillon (4 ou 5 diárias, o cliente escolhe) e Carnaval 2027.
const nome = (pt: string) => ({ pt, es: pt, en: pt });
const pacotes = (feriado: number, reveillon: number): Pacote[] => [
  { nome: nome('Pacote Natal'), entrada: '2026-12-24', saida: '2026-12-28', diariaCentavos: feriado },
  { nome: nome('Pacote Réveillon'), entrada: '2026-12-29', saida: '2027-01-02', diariaCentavos: reveillon, grupo: 'reveillon-2026' },
  { nome: nome('Pacote Réveillon'), entrada: '2026-12-28', saida: '2027-01-02', diariaCentavos: reveillon, grupo: 'reveillon-2026' },
  { nome: nome('Pacote Carnaval'), entrada: '2027-02-05', saida: '2027-02-10', diariaCentavos: feriado },
];
const FERRADURA: TabelaEstadia = {
  diariaCentavos: 100000,
  diariaFimDeSemanaCentavos: 130000,
  minimoNoites: 2,
  fimDeSemanaJunto: true,
  periodos: [],
  pacotes: pacotes(150000, 200000),
};
const GERIBA: TabelaEstadia = { ...FERRADURA, diariaCentavos: 150000, diariaFimDeSemanaCentavos: 180000, pacotes: pacotes(220000, 220000) };

/** Os seis valores de uma conta, para comparar de uma vez. */
const valores = (c: ReturnType<typeof contaEstadia>) => [
  c.totalCentavos,
  c.totalPixCentavos,
  c.sinalCentavos,
  c.sinalPixCentavos,
  c.chegadaCentavos,
  c.chegadaPixCentavos,
];

test('os dias da semana e as noites do fim de semana', () => {
  assert.equal(diaDaSemana('2026-11-13'), 5); // sexta
  assert.equal(diaDaSemana('2026-12-24'), 4); // quinta: o Natal entra na quinta
  assert.equal(diaDaSemana('2027-02-05'), 5); // sexta: o Carnaval entra na sexta
  assert.equal(noiteDeFimDeSemana('2026-12-12'), true); // sábado
  assert.equal(noiteDeFimDeSemana('2026-12-13'), true); // domingo
  assert.equal(noiteDeFimDeSemana('2026-12-11'), false); // a sexta é diária de semana
  const fds = ['2026-12-11', '2026-12-12', '2026-12-13'];
  for (const n of fds) assert.deepEqual(noitesDoFimDeSemana(n), fds);
  assert.deepEqual(noitesDoFimDeSemana('2026-12-14'), []); // segunda
  assert.deepEqual(noitesDoFimDeSemana('2026-12-10'), []); // quinta
  assert.equal(dataValida('2027-02-29'), false);
  assert.equal(dataValida('2028-02-29'), true);
  assert.equal(dataValida('2026-1-05'), false);
});

test('fim de semana de sexta a segunda: R$ 3.600,00 na Ferradura e R$ 5.100,00 na Geribá (Pix sobre o total, sinal de 50%)', () => {
  const f = contaEstadia(FERRADURA, '2026-12-11', '2026-12-14');
  assert.equal(f.ok, true);
  assert.deepEqual(
    f.noites.map((n) => [n.data, n.diariaCentavos, n.tipo]),
    [
      ['2026-12-11', 100000, 'semana'],
      ['2026-12-12', 130000, 'fim-de-semana'],
      ['2026-12-13', 130000, 'fim-de-semana'],
    ],
  );
  // total, Pix, sinal no cartão, sinal no Pix, chegada no cartão, chegada no Pix (DADOS.md da Ferradura)
  assert.deepEqual(valores(f), [360000, 324000, 180000, 162000, 180000, 162000]);
  const g = contaEstadia(GERIBA, '2026-12-11', '2026-12-14');
  assert.equal(g.ok, true);
  assert.deepEqual(valores(g), [510000, 459000, 255000, 229500, 255000, 229500]);
});

test('Carnaval 2027, sexta 05 a quarta 10/02: 5 diárias de feriado, R$ 7.500,00 e R$ 11.000,00', () => {
  const f = contaEstadia(FERRADURA, '2027-02-05', '2027-02-10');
  assert.equal(f.ok, true);
  assert.equal(f.noites.length, 5);
  assert.ok(f.noites.every((n) => n.tipo === 'pacote' && n.diariaCentavos === 150000));
  assert.deepEqual(valores(f), [750000, 675000, 375000, 337500, 375000, 337500]);
  assert.deepEqual(
    f.pacotes.map((p) => p.nome.pt),
    ['Pacote Carnaval'],
  );
  const g = contaEstadia(GERIBA, '2027-02-05', '2027-02-10');
  assert.deepEqual(valores(g), [1100000, 990000, 550000, 495000, 550000, 495000]);
});

test('Réveillon: 4 diárias (29/12 a 02/01) ou 5 diárias (28/12 a 02/01), o cliente escolhe uma', () => {
  const f4 = contaEstadia(FERRADURA, '2026-12-29', '2027-01-02');
  const f5 = contaEstadia(FERRADURA, '2026-12-28', '2027-01-02');
  assert.equal(f4.ok && f5.ok, true);
  assert.deepEqual(valores(f4), [800000, 720000, 400000, 360000, 400000, 360000]);
  assert.deepEqual(valores(f5), [1000000, 900000, 500000, 450000, 500000, 450000]);
  assert.equal(f4.pacotes[0].entrada, '2026-12-29');
  assert.equal(f5.pacotes[0].entrada, '2026-12-28');
  const g4 = contaEstadia(GERIBA, '2026-12-29', '2027-01-02');
  const g5 = contaEstadia(GERIBA, '2026-12-28', '2027-01-02');
  assert.deepEqual(valores(g4), [880000, 792000, 440000, 396000, 440000, 396000]);
  assert.deepEqual(valores(g5), [1100000, 990000, 550000, 495000, 550000, 495000]);
});

test('pacote pela metade não passa: a estadia leva uma das opções inteira', () => {
  for (const [entrada, saida] of [
    ['2026-12-30', '2027-01-02'], // só o fim do Réveillon
    ['2026-12-28', '2027-01-01'], // 4 noites, mas não as de nenhuma opção
    ['2027-01-01', '2027-01-04'], // pega a noite de 01/01
    ['2027-02-06', '2027-02-08'], // o meio do Carnaval
    ['2026-12-27', '2026-12-30'], // o fim do Natal e o começo do Réveillon
  ]) {
    const c = contaEstadia(FERRADURA, entrada, saida);
    assert.equal(c.ok, false, `${entrada} a ${saida}`);
    assert.equal(c.motivo, 'pacote', `${entrada} a ${saida}`);
  }
  const r = contaEstadia(FERRADURA, '2026-12-30', '2027-01-02');
  assert.deepEqual(
    r.pacoteIncompleto?.map((p) => p.entrada),
    ['2026-12-28', '2026-12-29'],
  );
});

test('o pacote substitui o fim de semana; as noites que sobram do fim de semana andam juntas', () => {
  // depois do Réveillon (a sexta 01/01 está no pacote): sábado e domingo juntos, no preço de fim de semana
  const depois = contaEstadia(FERRADURA, '2027-01-02', '2027-01-04');
  assert.equal(depois.ok, true);
  assert.equal(depois.totalCentavos, 260000);
  assert.equal(contaEstadia(GERIBA, '2027-01-02', '2027-01-04').totalCentavos, 360000);
  const soSabado = contaEstadia(FERRADURA, '2027-01-02', '2027-01-03');
  assert.equal(soSabado.motivo, 'fim-de-semana');
  assert.deepEqual(soSabado.faltam, ['2027-01-03']);
  // o Réveillon de 4 diárias e o fim de semana seguinte, numa estadia só
  const junto = contaEstadia(FERRADURA, '2026-12-29', '2027-01-04');
  assert.equal(junto.ok, true);
  assert.equal(junto.totalCentavos, 800000 + 260000);
  // Natal e Réveillon de 5 diárias, emendados
  const festas = contaEstadia(FERRADURA, '2026-12-24', '2027-01-02');
  assert.equal(festas.ok, true);
  assert.equal(festas.totalCentavos, 4 * 150000 + 5 * 200000);
  assert.deepEqual(
    festas.pacotes.map((p) => p.nome.pt),
    ['Pacote Natal', 'Pacote Réveillon'],
  );
});

test('fim de semana junto: quarta a domingo e domingo a terça não passam; quarta a segunda passa', () => {
  const quartaADomingo = contaEstadia(FERRADURA, '2026-12-09', '2026-12-13');
  assert.equal(quartaADomingo.motivo, 'fim-de-semana');
  assert.deepEqual(quartaADomingo.faltam, ['2026-12-13']);
  const domingoATerca = contaEstadia(FERRADURA, '2026-12-13', '2026-12-15');
  assert.equal(domingoATerca.motivo, 'fim-de-semana');
  assert.deepEqual(domingoATerca.faltam, ['2026-12-11', '2026-12-12']);
  const quartaASegunda = contaEstadia(FERRADURA, '2026-12-09', '2026-12-14');
  assert.equal(quartaASegunda.ok, true);
  assert.equal(quartaASegunda.totalCentavos, 3 * 100000 + 2 * 130000);
  // sexta a domingo (sem a noite de domingo) também não
  assert.equal(contaEstadia(FERRADURA, '2026-12-11', '2026-12-13').motivo, 'fim-de-semana');
});

test(`com ${NOITES_LIVRES_DO_FIM_DE_SEMANA} noites ou mais, a estadia fica livre da regra do fim de semana`, () => {
  const sabadoASabado = contaEstadia(FERRADURA, '2026-12-12', '2026-12-19');
  assert.equal(sabadoASabado.noites.length, 7);
  assert.equal(sabadoASabado.ok, true);
  assert.equal(sabadoASabado.totalCentavos, 2 * 130000 + 5 * 100000);
  // 6 noites, de domingo a sábado: ainda pega a regra
  assert.equal(contaEstadia(FERRADURA, '2026-12-13', '2026-12-19').motivo, 'fim-de-semana');
  // a regra desligada na casa: sábado a segunda passa
  assert.equal(contaEstadia({ ...FERRADURA, fimDeSemanaJunto: false }, '2026-12-12', '2026-12-14').ok, true);
});

test('mínimo de 2 diárias durante a semana', () => {
  const uma = contaEstadia(FERRADURA, '2026-12-14', '2026-12-15');
  assert.equal(uma.ok, false);
  assert.equal(uma.motivo, 'minimo');
  assert.equal(uma.minimoNoites, 2);
  // a conta sai mesmo assim, para a página mostrar o valor e o aviso
  assert.equal(uma.totalCentavos, 100000);
  const duas = contaEstadia(FERRADURA, '2026-12-14', '2026-12-16');
  assert.equal(duas.ok, true);
  assert.deepEqual(valores(duas), [200000, 180000, 100000, 90000, 100000, 90000]);
});

test('noite ocupada, entrada no passado e datas inválidas', () => {
  const ocupada = contaEstadia(FERRADURA, '2026-12-14', '2026-12-17', { ocupadas: ['2026-12-15'] });
  assert.equal(ocupada.motivo, 'ocupada');
  assert.deepEqual(ocupada.ocupadas, ['2026-12-15']);
  // a noite da saída pode estar ocupada: ela não é da estadia
  assert.equal(contaEstadia(FERRADURA, '2026-12-14', '2026-12-16', { ocupadas: ['2026-12-16'] }).ok, true);
  // a sexta já vendida (ou bloqueada): sábado e domingo andam juntos
  assert.equal(contaEstadia(FERRADURA, '2026-12-12', '2026-12-14', { ocupadas: ['2026-12-11'] }).ok, true);
  // no sábado, a sexta já passou: sábado a segunda passa
  assert.equal(contaEstadia(FERRADURA, '2026-12-12', '2026-12-14', { hoje: '2026-12-12' }).ok, true);
  assert.equal(contaEstadia(FERRADURA, '2026-12-12', '2026-12-14', { hoje: '2026-12-11' }).motivo, 'fim-de-semana');
  for (const [entrada, saida, hoje] of [
    ['2026-12-14', '2026-12-14', undefined],
    ['2026-12-16', '2026-12-14', undefined],
    ['2026-02-30', '2026-03-02', undefined],
    ['2026-12-14', '2026-12-16', '2026-12-15'],
    ['2026-12-14', '2028-12-14', undefined],
  ] as const) {
    const c = contaEstadia(FERRADURA, entrada, saida, hoje ? { hoje } : {});
    assert.equal(c.motivo, 'datas', `${entrada} a ${saida}`);
    assert.deepEqual(valores(c), [0, 0, 0, 0, 0, 0]);
    assert.deepEqual(c.noites, []);
  }
});

test('o Pix é 10% sobre o total (não diária por diária), e o sinal é metade de cada total', () => {
  // com centavos na diária, as duas contas dão valores diferentes: vale a do total
  const t: TabelaEstadia = { ...FERRADURA, diariaCentavos: 100005, diariaFimDeSemanaCentavos: null, pacotes: [] };
  const c = contaEstadia(t, '2026-12-14', '2026-12-17');
  assert.equal(c.totalCentavos, 300015);
  assert.equal(c.totalPixCentavos, precoPixCentavos(300015));
  assert.notEqual(c.totalPixCentavos, 3 * precoPixCentavos(100005));
  assert.equal(c.sinalCentavos + c.chegadaCentavos, c.totalCentavos);
  assert.equal(c.sinalPixCentavos + c.chegadaPixCentavos, c.totalPixCentavos);
  assert.deepEqual(partesDaEstadia(100001), {
    totalCentavos: 100001,
    totalPixCentavos: 90001,
    sinalCentavos: 50001,
    sinalPixCentavos: 45001,
    chegadaCentavos: 50000,
    chegadaPixCentavos: 45000,
  });
});

test('sem diária de fim de semana, o sábado e o domingo saem pela de semana; a temporada vale em todas as noites', () => {
  const semFds = contaEstadia({ ...FERRADURA, diariaFimDeSemanaCentavos: null }, '2026-12-11', '2026-12-14');
  assert.equal(semFds.totalCentavos, 300000);
  assert.ok(semFds.noites.every((n) => n.tipo === 'semana'));
  const comTemporada: TabelaEstadia = {
    ...FERRADURA,
    periodos: [{ tipo: 'temporada', nome: nome('Alta'), de: '2026-12-07', ate: '2026-12-20', diariaCentavos: 120000, minimoNoites: 3 }],
  };
  const fds = contaEstadia(comTemporada, '2026-12-11', '2026-12-14');
  assert.equal(fds.totalCentavos, 360000);
  assert.ok(fds.noites.every((n) => n.tipo === 'temporada'));
  const curta = contaEstadia(comTemporada, '2026-12-14', '2026-12-16');
  assert.equal(curta.motivo, 'minimo');
  assert.equal(curta.minimoNoites, 3);
  // o pacote vale por cima da temporada e do mínimo dela
  const natal = contaEstadia(
    { ...comTemporada, periodos: [{ ...comTemporada.periodos[0], ate: '2027-01-31' }] },
    '2026-12-24',
    '2026-12-28',
  );
  assert.equal(natal.ok, true);
  assert.equal(natal.totalCentavos, 600000);
});

test('os pacotes em grupos, a sobreposição proibida, os valores de cada opção e a menor diária', () => {
  const grupos = gruposDePacotes(FERRADURA.pacotes);
  assert.deepEqual(
    grupos.map((g) => g.map((p) => p.entrada)),
    [['2026-12-24'], ['2026-12-28', '2026-12-29'], ['2027-02-05']],
  );
  // as duas opções do Réveillon dividem noites, mas são do mesmo grupo
  assert.deepEqual(pacotesSobrepostos(FERRADURA.pacotes), []);
  const errado: Pacote = { nome: nome('Pacote Ano Novo'), entrada: '2026-12-31', saida: '2027-01-03', diariaCentavos: 1 };
  assert.equal(pacotesSobrepostos([...FERRADURA.pacotes, errado]).length, 2);
  const lista = pacotesComValores(FERRADURA, '2026-12-25');
  assert.deepEqual(
    lista.map((g) => g.map((o) => [o.pacote.nome.pt, o.noites, o.totalCentavos, o.sinalPixCentavos])),
    [
      [
        ['Pacote Réveillon', 5, 1000000, 450000],
        ['Pacote Réveillon', 4, 800000, 360000],
      ],
      [['Pacote Carnaval', 5, 750000, 337500]],
    ],
  );
  assert.equal(menorDiariaCentavos(FERRADURA), 100000);
  assert.equal(menorDiariaCentavos({ ...GERIBA, pacotes: [] }), 150000);
});

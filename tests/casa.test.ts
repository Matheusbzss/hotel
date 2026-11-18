import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EsquemaBloqueio,
  EsquemaTarifa,
  faltaParaPublicar,
  lerFormularioCasa,
  mesmosPeriodos,
  noitesOcupadas,
  slugDe,
  type CasaPainel,
} from '../src/lib/casa.ts';
import { deLinhas, linhaDeTarifa, paraLinha, tarifaDeLinha, type LinhaBloqueio, type LinhaCasa, type LinhaTarifa } from '../src/lib/casas-banco.ts';

// cadastro fictício, só para conferir as regras (o site não tem casas inventadas)
const FORMULARIO: Record<string, string> = {
  'nome.pt': 'Casa de Teste',
  'nome.es': 'Casa de Prueba',
  'nome.en': 'Test House',
  cidade: 'buzios',
  quartos: '5',
  suites: '3',
  banheiros: '4',
  capacidade: '12',
  'local.pt': 'Praia de Teste',
  'local.es': 'Playa de Prueba',
  'local.en': 'Test Beach',
  endereco: 'Rua de Teste, 1',
  lat: '-22.75',
  lng: '-41.88',
  'resumo.pt': 'Resumo',
  'resumo.es': 'Resumen',
  'resumo.en': 'Summary',
  'descricao.pt': 'Primeiro parágrafo.\r\n\r\nSegundo parágrafo.',
  'descricao.es': 'Texto',
  'descricao.en': 'Text',
  'camas.pt': '3 camas de casal\r\n\r\n  4 de solteiro  ',
  'camas.es': '3 camas',
  'camas.en': '3 beds',
  'comodidades.pt': 'Piscina',
  'comodidades.es': 'Piscina',
  'comodidades.en': 'Pool',
  'regras.pt': 'Sem festas',
  'regras.es': 'Sin fiestas',
  'regras.en': 'No parties',
  'cancelamento.pt': 'Regra',
  'cancelamento.es': 'Regla',
  'cancelamento.en': 'Rule',
  checkIn: '15h',
  checkOut: '11h',
  diaria: '1500.50',
  minimoNoites: '2',
  taxaLimpeza: '400',
  caucao: '',
  fotos: '/fotos/casas/casa-de-teste/01.jpg\r\n/fotos/casas/casa-de-teste/02.jpg',
  icalUrl: 'https://www.airbnb.com/calendar/ical/123.ics?s=abc',
};

const lido = () => {
  const r = lerFormularioCasa(FORMULARIO);
  assert.ok(r.ok);
  return r.dados;
};

const painel = (mudanca: Partial<CasaPainel> = {}): CasaPainel => ({
  ...lido(),
  id: 'id',
  ativo: false,
  icalToken: 'token',
  temporadas: [],
  feriados: [],
  tarifas: [],
  bloqueios: [],
  ...mudanca,
});

test('o formulário vira os dados da casa', () => {
  const d = lido();
  assert.equal(d.slug, 'casa-de-teste');
  assert.equal(d.quartos, 5);
  assert.equal(d.diaria, 1500.5);
  assert.equal(d.caucao, 0);
  assert.deepEqual(d.pontoAproximado, { lat: -22.75, lng: -41.88 });
  // os parágrafos ficam separados por uma linha em branco, como a página espera
  assert.deepEqual(d.descricao.pt.split('\n\n'), ['Primeiro parágrafo.', 'Segundo parágrafo.']);
  // as listas: uma linha por item, sem linha vazia
  assert.deepEqual(d.camas.pt, ['3 camas de casal', '4 de solteiro']);
  assert.equal(d.fotos.length, 2);
});

test('dá para salvar pela metade, com o nome, a cidade, os quartos e a capacidade', () => {
  const r = lerFormularioCasa({ 'nome.pt': 'Casa Nova', cidade: 'cabo-frio', quartos: '6', capacidade: '14', minimoNoites: '1' });
  assert.ok(r.ok);
  assert.equal(r.dados.slug, 'casa-nova');
  assert.equal(r.dados.fotos.length, 0);
  assert.equal(r.dados.icalUrl, '');
});

test('o formulário avisa o que está errado', () => {
  const erro = (mudanca: Record<string, string>) => {
    const r = lerFormularioCasa({ ...FORMULARIO, ...mudanca });
    return r.ok ? '' : r.erro;
  };
  assert.match(erro({ 'nome.pt': '' }), /endereço da página|nome/);
  assert.match(erro({ cidade: 'rio-de-janeiro' }), /cidade/);
  assert.match(erro({ capacidade: '0' }), /capacidade/);
  assert.match(erro({ fotos: 'https://outro-site.com/foto.jpg' }), /fotos/);
  assert.match(erro({ icalUrl: 'http://www.airbnb.com/calendar.ics' }), /calendário do Airbnb/);
  assert.match(erro({ slug: 'Com Espaço' }), /endereço da página/);
});

test('o endereço da página sai do nome', () => {
  assert.equal(slugDe('Casa da Praia de Geribá'), 'casa-da-praia-de-geriba');
  assert.equal(slugDe('  Mansão   Azul & Sol! '), 'mansao-azul-sol');
});

test('a casa só vai ao ar com a página completa', () => {
  assert.deepEqual(faltaParaPublicar(painel()), []);
  const falta = faltaParaPublicar(painel({ fotos: [], diaria: 0, pontoAproximado: { lat: 0, lng: 0 }, endereco: '' }));
  assert.deepEqual(falta, ['endereço', 'ponto no mapa', 'diária', 'fotos']);
  const semEspanhol = painel({ resumo: { pt: 'Resumo', es: '', en: 'Summary' } });
  assert.deepEqual(faltaParaPublicar(semEspanhol), ['resumo nos três idiomas']);
});

test('o banco guarda centavos, e a casa volta igual', () => {
  const d = lido();
  const linha = paraLinha(d);
  assert.equal(linha.diaria_base_centavos, 150050);
  assert.equal(linha.taxa_limpeza_centavos, 40000);
  assert.equal(linha.ical_url, d.icalUrl);
  const volta = deLinhas(
    {
      ...linha,
      id: 'id',
      ativo: true,
      ical_token: 'token',
      ical_sincronizado_em: '2026-11-06 12:00:00+00',
      ical_erro: null,
      criado_em: '',
      atualizado_em: '',
    } as LinhaCasa,
    [],
    [],
  );
  assert.equal(volta.diaria, 1500.5);
  assert.deepEqual(volta.nome, d.nome);
  assert.deepEqual(volta.local, d.local);
  assert.deepEqual(volta.camas, d.camas);
  assert.deepEqual(volta.fotos, d.fotos);
  assert.equal(volta.icalSincronizadoEm, '2026-11-06T12:00:00.000Z');
  assert.equal('icalErro' in volta, false);
});

test('a casa recém-criada, sem os textos, não quebra a leitura', () => {
  const r = deLinhas(
    {
      id: 'id',
      ativo: false,
      slug: 'casa',
      cidade: 'buzios',
      nome: { pt: 'Casa' },
      bairro: null,
      resumo: null,
      descricao: null,
      camas: [],
      comodidades: [],
      regras: {},
      cancelamento: {},
      fotos: [],
      quartos: 5,
      capacidade: 10,
      minimo_noites: 1,
      ical_token: 'token',
    } as unknown as LinhaCasa,
    [],
    [],
  );
  assert.deepEqual(r.nome, { pt: 'Casa', es: '', en: '' });
  assert.deepEqual(r.local, { pt: '', es: '', en: '' });
  assert.deepEqual(r.camas, { pt: [], es: [], en: [] });
  assert.equal(r.diaria, 0);
  assert.deepEqual(r.pontoAproximado, { lat: 0, lng: 0 });
});

test('a tarifa: a última noite no site, o dia seguinte no banco', () => {
  const tarifa = {
    tipo: 'feriado' as const,
    nome: { pt: 'Réveillon', es: 'Año Nuevo', en: 'New Year' },
    de: '2026-12-31',
    ate: '2026-12-31',
    diaria: 3000,
  };
  const linha = linhaDeTarifa('casa', tarifa);
  // uma noite só cabe na regra do banco (fim depois do início)
  assert.equal(linha.fim, '2027-01-01');
  assert.equal(linha.diaria_centavos, 300000);
  const volta = tarifaDeLinha({ ...linha, id: 'id' } as LinhaTarifa);
  assert.equal(volta.ate, '2026-12-31');
  assert.equal(volta.diaria, 3000);
  assert.equal('minimoNoites' in volta, false);
});

test('as tarifas viram temporadas e feriados, na ordem das datas', () => {
  const tarifa = (tipo: string, inicio: string, fim: string) =>
    ({ id: inicio, tipo, nome: { pt: 'x', es: 'x', en: 'x' }, inicio, fim, diaria_centavos: 100000, minimo_noites: 3 }) as LinhaTarifa;
  const c = deLinhas(
    { nome: {}, camas: [], comodidades: [], regras: {}, cancelamento: {}, fotos: [] } as unknown as LinhaCasa,
    [tarifa('feriado', '2026-12-29', '2027-01-02'), tarifa('temporada', '2026-12-15', '2027-03-01'), tarifa('temporada', '2026-07-01', '2026-08-01')],
    [
      { id: 'b', inicio: '2026-12-20', fim: '2026-12-22', origem: 'airbnb', referencia: null },
      { id: 'a', inicio: '2026-12-01', fim: '2026-12-05', origem: 'manual', referencia: 'Dono' },
    ] as LinhaBloqueio[],
  );
  assert.deepEqual(
    c.temporadas.map((t) => t.de),
    ['2026-07-01', '2026-12-15'],
  );
  assert.equal(c.temporadas[1].ate, '2027-02-28');
  assert.equal(c.feriados.length, 1);
  assert.deepEqual(
    c.bloqueios.map((b) => [b.origem, b.referencia]),
    [
      ['manual', 'Dono'],
      ['airbnb', undefined],
    ],
  );
});

test('confere o período e o bloqueio do painel', () => {
  const nome = { pt: 'Alta', es: 'Alta', en: 'High' };
  const base = { tipo: 'temporada', nome, de: '2026-12-15', ate: '2027-02-28', diaria: '1500', minimoNoites: '' };
  assert.equal(EsquemaTarifa.parse(base).minimoNoites, undefined);
  assert.equal(EsquemaTarifa.parse({ ...base, minimoNoites: '3' }).minimoNoites, 3);
  assert.equal(EsquemaTarifa.safeParse({ ...base, ate: '2026-12-01' }).success, false);
  assert.equal(EsquemaTarifa.safeParse({ ...base, diaria: '0' }).success, false);
  assert.equal(EsquemaTarifa.safeParse({ ...base, nome: { ...nome, es: '' } }).success, false);
  assert.equal(EsquemaBloqueio.safeParse({ inicio: '2026-12-01', fim: '2026-12-02', referencia: '' }).success, true);
  // a saída no mesmo dia não bloqueia noite nenhuma
  assert.equal(EsquemaBloqueio.safeParse({ inicio: '2026-12-01', fim: '2026-12-01', referencia: '' }).success, false);
});

test('as noites ocupadas: de hoje em diante, sem a noite da saída e sem repetir', () => {
  const periodos = [
    { inicio: '2026-11-04', fim: '2026-11-08' },
    { inicio: '2026-11-07', fim: '2026-11-09' },
  ];
  assert.deepEqual(noitesOcupadas(periodos, '2026-11-06'), ['2026-11-06', '2026-11-07', '2026-11-08']);
  assert.deepEqual(noitesOcupadas([], '2026-11-06'), []);
});

test('confere se os períodos do Airbnb mudaram', () => {
  const a = { inicio: '2026-12-01', fim: '2026-12-05' };
  const b = { inicio: '2026-12-20', fim: '2026-12-22' };
  assert.equal(mesmosPeriodos([a, b], [b, a]), true);
  assert.equal(mesmosPeriodos([a], [a, b]), false);
  assert.equal(mesmosPeriodos([a], [{ ...a, fim: '2026-12-06' }]), false);
  assert.equal(mesmosPeriodos([], []), true);
});

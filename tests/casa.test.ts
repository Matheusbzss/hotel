import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EsquemaBloqueio,
  EsquemaTarifa,
  FALTA_CAMERAS,
  FALTA_MAPA,
  REGIAO_DOS_LAGOS,
  faltaNoCadastro,
  faltaParaPublicar,
  lerCoordenadas,
  lerFormularioCasa,
  mesmosPeriodos,
  noitesOcupadas,
  slugDe,
  type CasaPainel,
} from '../src/lib/casa.ts';
import { REGRAS_PROPRIAS_VAZIAS, detalhesDeLinha } from '../src/lib/casa-detalhes.ts';
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

/** Uma casa completa: o cadastro, as câmeras respondidas e marcada no mapa (o centro é fictício, não é de nenhuma casa). */
const painel = (mudanca: Partial<CasaPainel> = {}): CasaPainel => ({
  ...lido(),
  id: 'id',
  ativo: false,
  icalToken: 'token',
  temporadas: [],
  feriados: [],
  tarifas: [],
  bloqueios: [],
  detalhes: { ...detalhesDeLinha({}), regrasProprias: { ...REGRAS_PROPRIAS_VAZIAS, cameras: { tem: false } } },
  centro: { lat: -22.75, lng: -41.88 },
  ...mudanca,
});

test('o formulário vira os dados da casa', () => {
  const d = lido();
  assert.equal(d.slug, 'casa-de-teste');
  assert.equal(d.quartos, 5);
  assert.equal(d.diaria, 1500.5);
  assert.equal(d.caucao, 0);
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

test('a casa só vai ao ar com a página completa, marcada no mapa e com as câmeras respondidas, sem endereço', () => {
  assert.deepEqual(faltaParaPublicar(painel()), []);
  const falta = faltaParaPublicar(painel({ fotos: [], diaria: 0 }));
  assert.deepEqual(falta, ['diária', 'fotos']);
  const semEspanhol = painel({ resumo: { pt: 'Resumo', es: '', en: 'Summary' } });
  assert.deepEqual(faltaParaPublicar(semEspanhol), ['resumo nos três idiomas']);
  // Pacote 32: sem o centro público do círculo (a casa não foi marcada), não publica
  assert.deepEqual(faltaParaPublicar(painel({ centro: null })), [FALTA_MAPA]);
  assert.equal(FALTA_MAPA, 'casa marcada no mapa');
  // sem a resposta das câmeras (null: o dono ainda não disse), não publica; "não tem" e "tem" valem
  const camerasSemResposta = painel({ detalhes: detalhesDeLinha({}) });
  assert.deepEqual(faltaParaPublicar(camerasSemResposta), [FALTA_CAMERAS]);
  assert.equal(FALTA_CAMERAS, 'câmeras respondidas');
  const comCameras = painel({
    detalhes: { ...detalhesDeLinha({}), regrasProprias: { ...REGRAS_PROPRIAS_VAZIAS, cameras: { tem: true, dentro: false } } },
  });
  assert.deepEqual(faltaParaPublicar(comCameras), []);
  // os dois novos vêm depois do cadastro; o cadastro sozinho (que abre o formulário) não os conta
  const tudo = faltaParaPublicar(painel({ fotos: [], centro: null, detalhes: detalhesDeLinha({}) }));
  assert.deepEqual(tudo, ['fotos', FALTA_MAPA, FALTA_CAMERAS]);
  assert.deepEqual(faltaNoCadastro(painel({ fotos: [], centro: null, detalhes: detalhesDeLinha({}) })), ['fotos']);
  // nenhum item fala em endereço nem no ponto antigo
  assert.ok(!tudo.some((f) => /endere[çc]o|ponto no mapa/.test(f)));
});

test('o "Publicar" do painel diz ao dono o que fazer com os dois itens que não estão no formulário do cadastro', () => {
  // a casa cadastrada pelo painel nasce sem a resposta das câmeras, e o painel ainda não tem onde responder: o item
  // explica a quem avisar, em vez de deixar o dono parado na lista; a casa no mapa leva à parte do mapa, logo abaixo
  const pagina = readFileSync('src/app/admin/casas/[id]/page.tsx', 'utf8');
  assert.match(pagina, /<li key=\{f\}>\s+<ItemQueFalta item=\{f\} \/>\s+<\/li>/);
  assert.match(pagina, /if \(item === FALTA_MAPA\) \{\s+return \(\s+<a href="#no-mapa" /);
  // o JSX junta as linhas do texto com um espaço, como aqui
  const cameras = /if \(item === FALTA_CAMERAS\) \{([\s\S]*?)\n {2}\}/.exec(pagina)?.[1].replace(/\s+/g, ' ') ?? '';
  assert.match(
    cameras,
    /\{item\}: o painel ainda não tem onde responder isso\. Avise quem cuida do site se a casa tem câmeras de segurança e onde ficam \(ou se não tem nenhuma\), para a resposta entrar no cadastro\./,
  );
});

test('o formulário antigo com endereço, latitude e longitude: os campos são ignorados e não vão para o banco', () => {
  const r = lerFormularioCasa({ ...FORMULARIO, endereco: 'Rua de Teste, 1', lat: '-22.75', lng: '-41.88' });
  assert.ok(r.ok);
  assert.equal('endereco' in r.dados, false);
  assert.equal('pontoAproximado' in r.dados, false);
  // salvar o cadastro não mexe nas colunas antigas: o que estiver gravado nelas fica como está
  const linha = paraLinha(r.dados);
  for (const coluna of ['endereco', 'lat_aprox', 'lng_aprox', 'centro_lat', 'centro_lng']) assert.equal(coluna in linha, false, coluna);
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
  // sem a marcação no mapa nem as colunas da Etapa 7: sem centro e com os detalhes vazios (as câmeras sem resposta)
  assert.equal(r.centro, null);
  assert.equal(r.detalhes.regrasProprias.cameras, null);
  assert.deepEqual(faltaParaPublicar(r).slice(-2), [FALTA_MAPA, FALTA_CAMERAS]);
});

test('o painel lê da casa o centro público do círculo e os detalhes, e nunca o ponto antigo nem o endereço', () => {
  const linha = {
    nome: { pt: 'Casa' },
    camas: [],
    comodidades: [],
    regras: {},
    cancelamento: {},
    fotos: [],
    // o que estiver gravado nas colunas antigas fica no banco, mas não entra na casa do painel nem do site
    endereco: 'Rua de Teste, 1',
    lat_aprox: -22.7,
    lng_aprox: -41.9,
    centro_lat: -22.75,
    centro_lng: -41.88,
    regras_proprias: { evento: null, fumar: null, escadas: null, cameras: { tem: false } },
  } as unknown as LinhaCasa;
  const c = deLinhas(linha, [], []);
  assert.deepEqual(c.centro, { lat: -22.75, lng: -41.88 });
  assert.deepEqual(c.detalhes.regrasProprias.cameras, { tem: false });
  assert.equal('endereco' in c, false);
  assert.equal('pontoAproximado' in c, false);
  assert.ok(!JSON.stringify(c).includes('-22.7,') && !JSON.stringify(c).includes('-41.9'));
  // sem o centro, a casa não está marcada, mesmo com o ponto antigo digitado à mão
  assert.equal(deLinhas({ ...linha, centro_lat: null, centro_lng: null }, [], []).centro, null);
});

test('as coordenadas coladas do Google Maps: com ou sem espaços, vírgula entre os dois, ponto decimal', () => {
  const ponto = { lat: -22.75012, lng: -41.88034 };
  for (const colado of [
    '-22.75012, -41.88034',
    '-22.75012,-41.88034',
    '  -22.75012 ,  -41.88034  ',
    '-22.75012,\t-41.88034',
    // o espaço que não quebra e as marcas invisíveis que às vezes vêm junto ao copiar
    `-22.75012,${String.fromCharCode(0xa0)}-41.88034`,
    `${String.fromCharCode(0x200e)}-22.75012, -41.88034${String.fromCharCode(0x200f)}`,
    // o sinal de menos tipográfico
    `${String.fromCharCode(0x2212)}22.75012, ${String.fromCharCode(0x2212)}41.88034`,
  ]) {
    assert.deepEqual(lerCoordenadas(colado), { ok: true, ponto }, JSON.stringify(colado));
  }
  // as casas que o Google Maps mostra (6 ou 7 depois do ponto) passam como estão
  assert.deepEqual(lerCoordenadas('-22.7501234, -41.8803456'), { ok: true, ponto: { lat: -22.7501234, lng: -41.8803456 } });
});

test('as coordenadas: o que não é o par do Google Maps é recusado, sem gravar nada', () => {
  for (const lixo of [
    '',
    '   ',
    'casa da praia',
    '-22.75012',
    '-22.75012 -41.88034',
    '-22,75012, -41,88034',
    '-22.75012; -41.88034',
    '-22.75012, -41.88034, 3',
    '(-22.75012, -41.88034)',
    '-23, -42',
    '-22.75, -41.88',
    `22°45'00.4"S 41°52'49.2"W`,
    'https://maps.google.com/?q=-22.75012,-41.88034',
    '-22.75012, -41.88034abc',
    '--22.75012, -41.88034',
    '-22.75012e1, -41.88034',
    'NaN, NaN',
  ]) {
    assert.deepEqual(lerCoordenadas(lixo), { ok: false, erro: 'formato' }, JSON.stringify(lixo));
  }
});

test('as coordenadas: só um ponto da Região dos Lagos do RJ, com as bordas valendo', () => {
  const R = REGIAO_DOS_LAGOS;
  assert.deepEqual(R, { latMin: -23.2, latMax: -22.3, lngMin: -42.6, lngMax: -41.6 });
  // Búzios, Cabo Frio e Arraial do Cabo (pontos quaisquer das cidades, não de casas)
  for (const colado of ['-22.7500, -41.8800', '-22.8800, -42.0200', '-22.9700, -42.0300']) assert.ok(lerCoordenadas(colado).ok, colado);
  assert.ok(lerCoordenadas('-23.2000, -42.6000').ok);
  assert.ok(lerCoordenadas('-22.3000, -41.6000').ok);
  for (const fora of [
    // o sinal de menos esquecido, a latitude e a longitude trocadas, o Rio de Janeiro, o norte de Macaé, o oeste de
    // Saquarema, o mar ao sul de Arraial, o mar a leste de Búzios e o polo sul
    '22.75012, 41.88034',
    '-41.88034, -22.75012',
    '-22.9068, -43.1729',
    '-22.2000, -41.8000',
    '-22.9000, -42.6001',
    '-23.2001, -42.0000',
    '-22.7500, -41.5999',
    '-90.0000, 180.0000',
  ]) {
    assert.deepEqual(lerCoordenadas(fora), { ok: false, erro: 'fora' }, fora);
  }
  // longe demais para ser coordenada: é formato, não "fora"
  assert.deepEqual(lerCoordenadas('-95.0000, -41.8800'), { ok: false, erro: 'formato' });
  assert.deepEqual(lerCoordenadas('-22.7500, -181.0000'), { ok: false, erro: 'formato' });
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

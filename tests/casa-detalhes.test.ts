import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMODIDADES,
  CAMAS,
  GRUPOS_COMODIDADE,
  ICONES_CASA,
  IDS_COMODIDADE,
  NOMES_GRUPO_COMODIDADE,
  TIPOS_CAMA,
} from '../src/data/comodidades.ts';
import {
  EsquemaComodidades,
  EsquemaPacote,
  EsquemaPacotes,
  EsquemaQuartos,
  EsquemaRegrasProprias,
  REGRAS_PROPRIAS_VAZIAS,
  banheirosNaFicha,
  colunasDosDetalhes,
  contarCamas,
  detalhesDeLinha,
  linhaDePacote,
  lugaresNasCamas,
  pacoteDeLinha,
  periodoDeLinha,
  tabelaDaCasa,
  type Quarto,
} from '../src/lib/casa-detalhes.ts';
import { argsDePrenderDatas } from '../src/lib/casas-banco.ts';
import { contaEstadia } from '../src/lib/estadia.ts';
import type { Tables } from '../src/lib/banco-tipos.ts';

// dados fictícios, só para conferir as formas e as contas (o site não tem casas inventadas)
const nome = (pt: string) => ({ pt, es: pt, en: pt });

test('a lista fixa: cada comodidade tem grupo, ícone e nome nos três idiomas', () => {
  assert.ok(IDS_COMODIDADE.length >= 30);
  for (const id of IDS_COMODIDADE) {
    const c = COMODIDADES[id];
    assert.ok((GRUPOS_COMODIDADE as readonly string[]).includes(c.grupo), id);
    assert.ok((ICONES_CASA as readonly string[]).includes(c.icone), id);
    for (const idioma of ['pt', 'es', 'en'] as const) assert.ok(c.nome[idioma].trim().length >= 2, `${id} ${idioma}`);
  }
  for (const g of GRUPOS_COMODIDADE) assert.ok(NOMES_GRUPO_COMODIDADE[g].es, g);
  for (const tipo of TIPOS_CAMA) assert.ok(CAMAS[tipo].lugares >= 1 && CAMAS[tipo].camas >= 1, tipo);
});

test('camas e lugares: o beliche conta duas camas; o limite de hóspedes é a soma dos lugares', () => {
  const quartos: Quarto[] = [
    { nome: nome('Quarto 1'), camas: [{ tipo: 'king', quantidade: 1 }], banheiro: null },
    {
      nome: nome('Quarto 2'),
      camas: [
        { tipo: 'queen', quantidade: 1 },
        { tipo: 'beliche', quantidade: 2 },
      ],
      banheiro: null,
    },
    {
      nome: nome('Quarto 3'),
      camas: [
        { tipo: 'casal', quantidade: 1 },
        { tipo: 'solteiro', quantidade: 1 },
      ],
      banheiro: true,
    },
  ];
  assert.equal(contarCamas(quartos), 1 + 1 + 4 + 2);
  assert.equal(lugaresNasCamas(quartos), 2 + 2 + 4 + 3);
  assert.equal(banheirosNaFicha(3, 1), 3.5);
  assert.equal(banheirosNaFicha(6, 0), 6);
  assert.equal(EsquemaQuartos.safeParse(quartos).success, true);
  // quarto sem cama, cama desconhecida, ou foto de fora de /fotos não passam
  assert.equal(EsquemaQuartos.safeParse([{ ...quartos[0], camas: [] }]).success, false);
  assert.equal(EsquemaQuartos.safeParse([{ ...quartos[0], camas: [{ tipo: 'rede', quantidade: 1 }] }]).success, false);
  assert.equal(EsquemaQuartos.safeParse([{ ...quartos[0], foto: 'https://x.com/a.jpg' }]).success, false);
});

test('comodidades da lista fixa, sem repetir; regras próprias com "não informado"', () => {
  assert.equal(EsquemaComodidades.safeParse([{ id: 'piscina', veioDaFoto: false }]).success, true);
  assert.equal(EsquemaComodidades.safeParse([{ id: 'heliponto', veioDaFoto: false }]).success, false);
  assert.equal(
    EsquemaComodidades.safeParse([
      { id: 'spa', veioDaFoto: false },
      { id: 'spa', veioDaFoto: true },
    ]).success,
    false,
  );
  assert.equal(EsquemaRegrasProprias.safeParse(REGRAS_PROPRIAS_VAZIAS).success, true);
  assert.equal(
    EsquemaRegrasProprias.safeParse({ ...REGRAS_PROPRIAS_VAZIAS, evento: 'com-autorizacao', fumar: 'area-externa' }).success,
    true,
  );
  assert.equal(EsquemaRegrasProprias.safeParse({ ...REGRAS_PROPRIAS_VAZIAS, evento: 'talvez' }).success, false);
  assert.equal(EsquemaRegrasProprias.safeParse({ ...REGRAS_PROPRIAS_VAZIAS, cameras: { tem: true } }).success, false);
});

test('o pacote: nome começando com "Pacote", saída depois da entrada e sem dividir noite com outro feriado', () => {
  const carnaval = { nome: nome('Pacote Carnaval'), entrada: '2027-02-05', saida: '2027-02-10', diariaCentavos: 150000 };
  assert.equal(EsquemaPacote.safeParse(carnaval).success, true);
  assert.equal(EsquemaPacote.safeParse({ ...carnaval, nome: nome('Promoção Carnaval') }).success, false);
  assert.equal(EsquemaPacote.safeParse({ ...carnaval, saida: '2027-02-05' }).success, false);
  assert.equal(EsquemaPacote.safeParse({ ...carnaval, grupo: 'Réveillon 2026' }).success, false);
  const sobreposto = { ...carnaval, nome: nome('Pacote Outro'), entrada: '2027-02-09', saida: '2027-02-12' };
  assert.equal(EsquemaPacotes.safeParse([carnaval, sobreposto]).success, false);
  assert.equal(EsquemaPacotes.safeParse([carnaval, { ...sobreposto, entrada: '2027-02-10' }]).success, true);
});

test('as colunas novas: antes da migração (ou fora da forma) viram vazio; a ida e a volta não perdem nada', () => {
  const antes = detalhesDeLinha({ slug: 'casa' });
  assert.deepEqual(antes, {
    lavabos: 0,
    diariaFimDeSemanaCentavos: null,
    fimDeSemanaJunto: true,
    quartosDetalhe: [],
    comodidadesMarcadas: [],
    destaques: [],
    regrasProprias: REGRAS_PROPRIAS_VAZIAS,
    textoBairro: null,
  });
  const quebrada = detalhesDeLinha({
    quartos_detalhe: [{ nome: 'x' }],
    comodidades_marcadas: 'piscina',
    regras_proprias: { evento: 'sim' },
  });
  assert.deepEqual(quebrada.quartosDetalhe, []);
  assert.deepEqual(quebrada.comodidadesMarcadas, []);
  assert.deepEqual(quebrada.regrasProprias, REGRAS_PROPRIAS_VAZIAS);
  const detalhes = {
    lavabos: 1,
    diariaFimDeSemanaCentavos: 130000,
    fimDeSemanaJunto: true,
    quartosDetalhe: [
      { nome: nome('Quarto 1'), camas: [{ tipo: 'king' as const, quantidade: 1 }], banheiro: null, foto: '/fotos/casas/x/q.jpg' },
    ],
    comodidadesMarcadas: [{ id: 'piscina' as const, veioDaFoto: false }],
    destaques: [{ icone: 'vista-mar' as const, texto: nome('Vista para o mar') }],
    regrasProprias: { ...REGRAS_PROPRIAS_VAZIAS, evento: 'com-autorizacao' as const },
    textoBairro: nome('Um bairro.'),
  };
  assert.deepEqual(detalhesDeLinha(colunasDosDetalhes(detalhes) as Partial<Tables<'casas'>>), detalhes);
});

test('pacotes e tarifas do banco viram a tabela da conta', () => {
  const linha = linhaDePacote('casa', {
    nome: nome('Pacote Réveillon'),
    entrada: '2026-12-29',
    saida: '2027-01-02',
    diariaCentavos: 200000,
    grupo: 'reveillon-2026',
  });
  assert.equal(linha.grupo, 'reveillon-2026');
  const pacote = { ...linha, id: 'p1', criado_em: '', grupo: linha.grupo ?? null } as Tables<'casas_pacotes'>;
  assert.equal(pacoteDeLinha(pacote).diariaCentavos, 200000);
  const tarifa = {
    id: 't',
    casa_id: 'casa',
    tipo: 'temporada',
    nome: { pt: 'Alta' },
    inicio: '2027-01-10',
    fim: '2027-01-20',
    diaria_centavos: 120000,
    minimo_noites: null,
  } as Tables<'casas_tarifas'>;
  assert.deepEqual(periodoDeLinha(tarifa), {
    tipo: 'temporada',
    nome: { pt: 'Alta', es: '', en: '' },
    de: '2027-01-10',
    ate: '2027-01-19',
    diariaCentavos: 120000,
  });
  const t = tabelaDaCasa(
    { diaria_base_centavos: 100000, minimo_noites: 2, diaria_fim_de_semana_centavos: 130000, fim_de_semana_junto: true },
    [tarifa],
    [pacote, { ...pacote, id: 'p2', entrada: '2026-12-28' }],
  );
  assert.equal(contaEstadia(t, '2026-12-28', '2027-01-02').totalCentavos, 1000000);
  assert.equal(contaEstadia(t, '2026-12-11', '2026-12-14').totalCentavos, 360000);
  // a casa sem diária de semana no banco (o painel deixa criar sem preço): a conta não vende, nem de graça
  const semPreco = tabelaDaCasa({ diaria_base_centavos: null, minimo_noites: 2 }, [], []);
  assert.equal(semPreco.diariaCentavos, 0);
  const conta = contaEstadia(semPreco, '2026-12-14', '2026-12-16');
  assert.equal(conta.motivo, 'preco');
  assert.equal(conta.totalCentavos, 0);
  assert.equal(conta.ok, false);
});

test('prender as datas: as estadias do pedido viram os argumentos da função do banco', () => {
  assert.deepEqual(argsDePrenderDatas([{ casaId: 'c1', inicio: '2027-02-05', fim: '2027-02-10', itemPedidoId: 'i1' }], 'cs_test_1'), {
    p_estadias: [{ casa_id: 'c1', inicio: '2027-02-05', fim: '2027-02-10', item_pedido_id: 'i1' }],
    p_referencia: 'cs_test_1',
  });
});

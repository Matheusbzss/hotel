import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CASAS_PARA_CADASTRAR, linhaDaCasa, type CasaParaCadastrar } from '../scripts/dados/casas.ts';
import { COMODIDADES, GRUPOS_COMODIDADE } from '../src/data/comodidades.ts';
import { CANCELAMENTO_DAS_CASAS, REGRAS_DAS_CASAS, regraDeCameras } from '../src/data/regras-casas.ts';
import { dicionario } from '../src/i18n/index.ts';
import { detalhesDeLinha, type DetalhesCasa } from '../src/lib/casa-detalhes.ts';
import {
  PRINCIPAIS_COMODIDADES,
  camasDoQuarto,
  centroDeLinha,
  comodidadesDaPagina,
  comodidadesPorGrupo,
  linhaDaFicha,
  regrasDaPagina,
  tabelaDaPagina,
} from '../src/lib/casa-pagina.ts';
import {
  datasComOFimDeSemana,
  datasComOPacote,
  linhasDaConta,
  opcoesDoPacote,
  pacotePorNoite,
  pacotesDaNoite,
  primeiraNoiteLivre,
} from '../src/lib/conta-casa.ts';
import { contaEstadia, noitesDoPacote, type TabelaEstadia } from '../src/lib/estadia.ts';
import { noitesEntre } from '../src/lib/diarias.ts';

// A página da casa (Fase 4, Etapa 7, partes D, E e F): o que ela mostra a partir das duas casas prontas, lidas como a
// prévia local lê (a mesma linha que o cadastro grava, src/lib/casas-previa.ts), sem banco e sem navegador.

const FERRADURA = CASAS_PARA_CADASTRAR.find((c) => c.slug === 'mansao-ferradura-vista-mar') as CasaParaCadastrar;
const GERIBA = CASAS_PARA_CADASTRAR.find((c) => c.slug === 'mansao-geriba-vista-mar') as CasaParaCadastrar;

/** A casa como o site a lê do banco: a linha do cadastro → os detalhes da Etapa 7 e a tabela da conta. */
function comoNoSite(c: CasaParaCadastrar): { detalhes: DetalhesCasa; tabela: TabelaEstadia } {
  const detalhes = detalhesDeLinha(linhaDaCasa(c));
  const tabela = tabelaDaPagina({
    diaria: c.diariaCentavos / 100,
    minimoNoites: c.minimoNoites,
    temporadas: [],
    feriados: [],
    detalhes,
    pacotes: c.pacotes,
  });
  return { detalhes, tabela };
}

test('a prévia lê das duas casas o que o cadastro grava: os detalhes voltam iguais', () => {
  for (const c of [FERRADURA, GERIBA]) {
    const { detalhes } = comoNoSite(c);
    assert.equal(detalhes.lavabos, c.lavabos, c.slug);
    assert.equal(detalhes.diariaFimDeSemanaCentavos, c.diariaFimDeSemanaCentavos, c.slug);
    assert.equal(detalhes.fimDeSemanaJunto, true, c.slug);
    assert.deepEqual(detalhes.quartosDetalhe, c.quartosDetalhe, c.slug);
    assert.deepEqual(detalhes.comodidadesMarcadas, c.comodidadesMarcadas, c.slug);
    assert.deepEqual(detalhes.destaques, c.destaques, c.slug);
    assert.deepEqual(detalhes.regrasProprias, c.regrasProprias, c.slug);
    assert.deepEqual(detalhes.textoBairro, c.textoBairro, c.slug);
  }
});

test('a prévia só liga com CASAS_PREVIA=1 e nunca na Vercel; as casas dela ficam desligadas e sem ponto no mapa', () => {
  const fonte = readFileSync(path.join('src', 'lib', 'casas-previa.ts'), 'utf8');
  assert.match(fonte, /process\.env\.CASAS_PREVIA === '1' && !process\.env\.VERCEL/);
  assert.match(fonte, /ativo: false/);
  assert.match(fonte, /centro_lat: null/);
  assert.match(fonte, /centro: null/);
  // o menu, o mapa do site e o Google continuam lendo só as casas no ar
  const casas = readFileSync(path.join('src', 'lib', 'casas.ts'), 'utf8');
  assert.match(casas, /export const casasAtivas = \(\): Promise<CasaDoSite\[\]> => casasDoSite\(\);/);
  assert.match(casas, /export const casasNoAr = async \(\) => \(await casasDoSite\(\)\)\.length > 0;/);
});

test('a linha da ficha: hóspedes, quartos, camas e banheiros, com o lavabo à parte', () => {
  const pt = dicionario('pt').casas.linha;
  const es = dicionario('es').casas.linha;
  const en = dicionario('en').casas.linha;
  const ferradura = {
    capacidade: FERRADURA.capacidade,
    quartos: FERRADURA.quartos,
    banheiros: FERRADURA.banheiros,
    detalhes: comoNoSite(FERRADURA).detalhes,
  };
  const geriba = {
    capacidade: GERIBA.capacidade,
    quartos: GERIBA.quartos,
    banheiros: GERIBA.banheiros,
    detalhes: comoNoSite(GERIBA).detalhes,
  };
  assert.deepEqual(linhaDaFicha(geriba, pt), ['14 hóspedes', '5 quartos', '9 camas', '6 banheiros']);
  // a Ferradura tem 3,5 banheiros: 3 banheiros e 1 lavabo, nunca "3,5"
  assert.deepEqual(linhaDaFicha(ferradura, pt), ['12 hóspedes', '4 quartos', '8 camas', '3 banheiros e 1 lavabo']);
  assert.deepEqual(linhaDaFicha(ferradura, es), ['12 huéspedes', '4 habitaciones', '8 camas', '3 baños y 1 baño de visitas']);
  assert.deepEqual(linhaDaFicha(ferradura, en), ['12 guests', '4 bedrooms', '8 beds', '3 bathrooms and 1 powder room']);
  // o singular, e o que falta no cadastro sai da linha
  assert.deepEqual(linhaDaFicha({ capacidade: 1, quartos: 1, banheiros: 1, detalhes: { lavabos: 0, quartosDetalhe: [] } }, pt), [
    '1 hóspede',
    '1 quarto',
    '1 banheiro',
  ]);
  assert.deepEqual(linhaDaFicha({ capacidade: 2, quartos: 1, banheiros: 0, detalhes: { lavabos: 1, quartosDetalhe: [] } }, pt), [
    '2 hóspedes',
    '1 quarto',
    '1 lavabo',
  ]);
});

test('as camas de cada quarto numa frase, no idioma', () => {
  const quarto4 = FERRADURA.quartosDetalhe[3];
  assert.equal(camasDoQuarto(quarto4, 'pt', 'pt-BR'), '1 cama queen e 2 beliches');
  assert.equal(camasDoQuarto(quarto4, 'es', 'es-AR'), '1 cama queen y 2 literas');
  assert.equal(camasDoQuarto(quarto4, 'en', 'en-US'), '1 queen bed and 2 bunk beds');
  assert.equal(camasDoQuarto(GERIBA.quartosDetalhe[3], 'pt', 'pt-BR'), '3 camas de solteiro');
  assert.equal(camasDoQuarto(GERIBA.quartosDetalhe[2], 'es-ar', 'es-AR'), '1 cama doble y 1 cama individual');
});

test('o que a casa tem: as 10 principais na ordem da casa e a lista inteira em grupos, sem perder nenhuma', () => {
  for (const c of [FERRADURA, GERIBA]) {
    const lista = comodidadesDaPagina(c.comodidadesMarcadas);
    assert.equal(PRINCIPAIS_COMODIDADES, 10);
    assert.deepEqual(
      lista.slice(0, 10).map((x) => x.id),
      c.comodidadesMarcadas.slice(0, 10).map((m) => m.id),
    );
    const grupos = comodidadesPorGrupo(lista);
    assert.equal(
      grupos.reduce((s, g) => s + g.itens.length, 0),
      lista.length,
      c.slug,
    );
    // na ordem fixa dos grupos, sem grupo vazio
    const ordem = grupos.map((g) => GRUPOS_COMODIDADE.indexOf(g.grupo));
    assert.deepEqual(
      ordem,
      [...ordem].sort((a, b) => a - b),
    );
    assert.ok(grupos.every((g) => g.itens.length > 0));
    for (const x of lista) assert.equal(x.icone, COMODIDADES[x.id].icone);
  }
  // o detalhe da casa vem junto ("4 vagas na garagem do condomínio")
  const vagas = comodidadesDaPagina(GERIBA.comodidadesMarcadas).find((x) => x.id === 'estacionamento');
  assert.equal(vagas?.detalhe?.pt, '4 vagas na garagem do condomínio');
  // a marca "veio da foto" é só do painel: não vai para a página
  assert.ok(comodidadesDaPagina(FERRADURA.comodidadesMarcadas).every((x) => !('veioDaFoto' in x)));
});

test('regras, chegada e segurança, cancelamento: só o que o dono disse vira frase', () => {
  const ferradura = regrasDaPagina({ capacidade: 12, detalhes: comoNoSite(FERRADURA).detalhes });
  const geriba = regrasDaPagina({ capacidade: 14, detalhes: comoNoSite(GERIBA).detalhes });
  for (const r of [ferradura, geriba]) {
    assert.deepEqual(
      r.casa.slice(0, 4).map((t) => t.pt),
      [
        REGRAS_DAS_CASAS.entradaSaida.pt,
        r === ferradura ? 'Até 12 hóspedes' : 'Até 14 hóspedes',
        REGRAS_DAS_CASAS.pet.pt,
        REGRAS_DAS_CASAS.silencio.pt,
      ],
    );
    assert.ok(r.chegada.some((t) => t.pt === REGRAS_DAS_CASAS.recepcao.pt));
    assert.ok(r.chegada.some((t) => t.pt === REGRAS_DAS_CASAS.cadastro.pt));
    assert.deepEqual(r.cancelamento, CANCELAMENTO_DAS_CASAS);
    // sem resposta sobre câmeras, nada se escreve sobre elas
    assert.ok(![...r.casa, ...r.chegada].some((t) => /c[âá]mera|camera/i.test(`${t.pt} ${t.es} ${t.en}`)));
  }
  // Ferradura: evento só em feriados; fumar ainda não informado (nenhuma regra); a escada que veio da foto
  assert.ok(ferradura.casa.some((t) => t.pt.startsWith('Eventos e festas só em feriados')));
  assert.ok(!ferradura.casa.some((t) => /fumar/i.test(t.pt)));
  assert.ok(ferradura.chegada.some((t) => t.pt === 'Casa com escada'));
  // Geribá: evento com autorização, fumar só fora e os 3 andares
  assert.ok(geriba.casa.some((t) => t.pt === 'Eventos de qualquer tipo só com autorização prévia'));
  assert.ok(geriba.casa.some((t) => t.pt === 'Fumar só na área externa'));
  assert.ok(geriba.chegada.some((t) => t.pt === 'Casa em 3 andares (triplex), com escadas externas'));
  // quando o dono responder: sem câmeras, ou onde ficam
  assert.equal(regraDeCameras(null), null);
  assert.equal(regraDeCameras({ tem: false })?.pt, 'Sem câmeras do lado de fora');
  const onde = { pt: 'na entrada', es: 'en la entrada', en: 'at the entrance' };
  assert.equal(regraDeCameras({ tem: true, onde })?.es, 'Cámaras exteriores: en la entrada');
});

test('a conta da página: o fim de semana e o Réveillon das duas casas, como no plano', () => {
  const f = comoNoSite(FERRADURA).tabela;
  const g = comoNoSite(GERIBA).tabela;
  // sexta a segunda: sexta de semana + sábado e domingo de fim de semana
  const fds = contaEstadia(f, '2026-12-11', '2026-12-14');
  assert.ok(fds.ok);
  assert.equal(fds.totalCentavos, 360000);
  assert.equal(fds.totalPixCentavos, 324000);
  assert.equal(fds.sinalCentavos, 180000);
  assert.equal(fds.sinalPixCentavos, 162000);
  assert.equal(fds.chegadaPixCentavos, 162000);
  assert.deepEqual(linhasDaConta(fds.noites), [
    { tipo: 'semana', noites: 1, diariaCentavos: 100000 },
    { tipo: 'fim-de-semana', noites: 2, diariaCentavos: 130000 },
  ]);
  assert.equal(contaEstadia(g, '2026-12-11', '2026-12-14').totalCentavos, 510000);
  // o Réveillon em duas opções; a conta da opção leva uma linha só, a do pacote
  const r5 = contaEstadia(f, '2026-12-28', '2027-01-02');
  assert.ok(r5.ok);
  assert.equal(r5.totalCentavos, 1000000);
  const linhas = linhasDaConta(r5.noites);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].tipo, 'pacote');
  assert.equal(linhas[0].noites, 5);
  assert.equal(linhas[0].pacote?.nome.pt, 'Pacote Réveillon');
  assert.equal(contaEstadia(f, '2026-12-29', '2027-01-02').totalCentavos, 800000);
  assert.equal(contaEstadia(g, '2026-12-29', '2027-01-02').totalCentavos, 880000);
  // a tabela que vai para o navegador não leva o id do banco dos pacotes
  assert.ok(f.pacotes.every((p) => !('id' in p)));
  assert.deepEqual(
    f.pacotes.map((p) => p.entrada),
    [...f.pacotes.map((p) => p.entrada)].sort(),
  );
});

test('os ajustes do calendário: fechar o fim de semana, levar o pacote inteiro, o mínimo', () => {
  const f = comoNoSite(FERRADURA).tabela;
  // sexta a sábado: faltam sábado e domingo → sexta a segunda
  const curta = contaEstadia(f, '2026-12-11', '2026-12-12');
  assert.equal(curta.motivo, 'fim-de-semana');
  assert.deepEqual(datasComOFimDeSemana('2026-12-11', '2026-12-12', curta.faltam ?? []), { entrada: '2026-12-11', saida: '2026-12-14' });
  // quarta a domingo: falta o domingo → quarta a segunda, que passa
  const quartaDomingo = contaEstadia(f, '2026-12-09', '2026-12-13');
  assert.equal(quartaDomingo.motivo, 'fim-de-semana');
  const ajustada = datasComOFimDeSemana('2026-12-09', '2026-12-13', quartaDomingo.faltam ?? []);
  assert.deepEqual(ajustada, { entrada: '2026-12-09', saida: '2026-12-14' });
  assert.ok(contaEstadia(f, ajustada.entrada, ajustada.saida).ok);
  // domingo a terça: faltam sexta e sábado → a entrada recua até a sexta
  const domingo = contaEstadia(f, '2026-12-13', '2026-12-15');
  assert.deepEqual(datasComOFimDeSemana('2026-12-13', '2026-12-15', domingo.faltam ?? []), { entrada: '2026-12-11', saida: '2026-12-15' });
  // metade do Natal → o pacote inteiro
  const meioNatal = contaEstadia(f, '2026-12-21', '2026-12-26');
  assert.equal(meioNatal.motivo, 'pacote');
  const natal = meioNatal.pacoteIncompleto?.[0];
  assert.ok(natal);
  const comNatal = datasComOPacote('2026-12-21', '2026-12-26', natal);
  assert.deepEqual(comNatal, { entrada: '2026-12-21', saida: '2026-12-28' });
  assert.ok(contaEstadia(f, comNatal.entrada, comNatal.saida).ok);
  // o mínimo de 2 diárias numa terça
  assert.equal(contaEstadia(f, '2026-12-08', '2026-12-09').motivo, 'minimo');
});

test('o toque no calendário: a noite do pacote leva o pacote; no Réveillon, as duas opções', () => {
  const pacotes = FERRADURA.pacotes;
  const reveillon5 = pacotes.find((p) => p.grupo === 'reveillon-2026' && p.entrada === '2026-12-28');
  const reveillon4 = pacotes.find((p) => p.grupo === 'reveillon-2026' && p.entrada === '2026-12-29');
  assert.ok(reveillon5 && reveillon4);
  // 28/12 só existe no de 5 diárias; 30/12, nas duas opções; 15/12 fora de pacote
  assert.deepEqual(pacotesDaNoite(pacotes, '2026-12-28'), [reveillon5]);
  assert.deepEqual(new Set(pacotesDaNoite(pacotes, '2026-12-30')), new Set([reveillon5, reveillon4]));
  assert.deepEqual(pacotesDaNoite(pacotes, '2026-12-15'), []);
  assert.equal(opcoesDoPacote(pacotes, reveillon5).length, 2);
  const carnaval = pacotes.find((p) => p.nome.pt === 'Pacote Carnaval');
  assert.ok(carnaval);
  assert.deepEqual(opcoesDoPacote(pacotes, carnaval), [carnaval]);
  // o calendário marca cada noite de pacote, e só elas
  const porNoite = pacotePorNoite(pacotes);
  assert.equal(porNoite.size, new Set(pacotes.flatMap(noitesDoPacote)).size);
  assert.equal(porNoite.get('2026-12-24')?.nome.pt, 'Pacote Natal');
  assert.equal(porNoite.get('2026-12-28')?.nome.pt, 'Pacote Réveillon');
  assert.equal(porNoite.get('2026-12-27')?.nome.pt, 'Pacote Natal');
  assert.equal(porNoite.has('2027-01-02'), false);
});

test('o calendário abre no mês da primeira noite livre (as casas estão bloqueadas até 06/12)', () => {
  for (const c of [FERRADURA, GERIBA]) {
    const ocupadas = new Set(c.bloqueios.flatMap((b) => noitesEntre(b.inicio, b.fim)));
    assert.equal(primeiraNoiteLivre('2026-11-13', ocupadas), '2026-12-07', c.slug);
  }
  assert.equal(primeiraNoiteLivre('2026-12-20', new Set()), '2026-12-20');
});

test('o mapa: só o centro público, das colunas novas; antes da migração ou sem o ponto, nada de mapa', () => {
  assert.equal(centroDeLinha({}), null);
  assert.equal(centroDeLinha({ centro_lat: null, centro_lng: null }), null);
  assert.equal(centroDeLinha({ centro_lat: -22.77, centro_lng: null }), null);
  assert.equal(centroDeLinha({ centro_lat: 200, centro_lng: -41.9 }), null);
  assert.deepEqual(centroDeLinha({ centro_lat: -22.77, centro_lng: -41.9 }), { lat: -22.77, lng: -41.9 });
  // o ponto antigo, digitado à mão, nunca vira o centro do círculo
  assert.equal(centroDeLinha({ lat_aprox: -22.77, lng_aprox: -41.9 } as never), null);
  // a página passa ao mapa só "tem mapa ou não": nenhuma coordenada chega ao HTML
  const pagina = readFileSync(path.join('src', 'app', '[locale]', 'casas-de-temporada', '[slug]', 'page.tsx'), 'utf8');
  assert.match(pagina, /comMapa=\{comMapa\}/);
  assert.doesNotMatch(pagina, /\.lat\b|\.lng\b|centro=\{/);
});

test('os textos novos da página da casa existem nos quatro idiomas, com os marcadores, sem "promoção" nem preço à mão', () => {
  const chaves = Object.keys(dicionario('pt').casas) as (keyof ReturnType<typeof dicionario>['casas'])[];
  for (const idioma of ['pt', 'es', 'es-ar', 'en'] as const) {
    const t = dicionario(idioma).casas;
    assert.deepEqual(Object.keys(t), chaves, idioma);
    for (const [chave, valor] of Object.entries(t)) {
      for (const texto of typeof valor === 'string' ? [valor] : Object.values(valor)) {
        assert.ok(texto.trim(), `${idioma} casas.${chave}`);
        assert.doesNotMatch(texto, /promo/i, `${idioma} casas.${chave}`);
        assert.doesNotMatch(texto, /(R\$|US\$)\s*\d/, `${idioma} casas.${chave}`);
      }
    }
    for (const chave of ['linhaSemana', 'linhaFimDeSemana', 'linhaFeriado', 'linhaTemporada'] as const) {
      assert.match(t[chave], /\{n\}.*\{valor\}/, `${idioma} ${chave}`);
    }
    assert.match(t.linhaPacote, /\{pacote\}.*\{n\}.*\{valor\}/);
    assert.match(t.sinalHoje, /\{p\}%/);
    assert.match(t.pixNoTotal, /\{p\}%/);
    assert.match(t.diariasDaCasa, /\{semana\}.*\{fimDeSemana\}/);
    assert.match(t.mapaCirculo, /\{m\}/);
  }
  // o espanhol da Argentina: com vos e seña só onde muda
  assert.equal(dicionario('es-ar').casas.datasTitulo, 'Elegí las fechas');
  assert.equal(dicionario('es').casas.datasTitulo, 'Elige las fechas');
  assert.equal(dicionario('es-ar').casas.sinalHoje, 'Seña hoy ({p}%)');
  assert.equal(dicionario('es').casas.sinalHoje, 'Anticipo hoy ({p}%)');
});

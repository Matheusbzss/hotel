import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ALT_FOTOS } from '../src/data/fotos-alt.ts';
import {
  EsquemaComodidades,
  EsquemaDestaques,
  EsquemaPacotes,
  EsquemaQuartos,
  EsquemaRegrasProprias,
  EsquemaTextoBairro,
  banheirosNaFicha,
  contarCamas,
  lugaresNasCamas,
} from '../src/lib/casa-detalhes.ts';
import { contaEstadia, diaDaSemana, noitesDoPacote, type TabelaEstadia } from '../src/lib/estadia.ts';
import { noitesEntre } from '../src/lib/diarias.ts';
import { CASAS_PARA_CADASTRAR, fotosNoSite, listasDaCasa, oQueFaltaNoBanco, type CasaParaCadastrar } from '../scripts/dados/casas.ts';

// As duas casas prontas para cadastrar (scripts/dados/casas.ts): as contas do dono ao centavo, os pacotes do ano, as
// fotos sem metadados e o que não pode aparecer (o que o dono não confirmou, exagero, "promoção").

const [FERRADURA, GERIBA] = CASAS_PARA_CADASTRAR;
const tabela = (c: CasaParaCadastrar): TabelaEstadia => ({
  diariaCentavos: c.diariaCentavos,
  diariaFimDeSemanaCentavos: c.diariaFimDeSemanaCentavos,
  minimoNoites: c.minimoNoites,
  fimDeSemanaJunto: c.fimDeSemanaJunto,
  periodos: [],
  pacotes: c.pacotes,
});
const ocupadas = (c: CasaParaCadastrar) => c.bloqueios.flatMap((b) => noitesEntre(b.inicio, b.fim));
const conta = (c: CasaParaCadastrar, entrada: string, saida: string) => {
  const r = contaEstadia(tabela(c), entrada, saida, { ocupadas: ocupadas(c), hoje: '2026-11-13' });
  assert.equal(r.ok, true, `${c.slug} ${entrada} a ${saida}: ${r.motivo}`);
  return [r.totalCentavos, r.totalPixCentavos, r.sinalCentavos, r.sinalPixCentavos];
};

test('as duas casas, nesta ordem, e os dados na forma do banco', () => {
  assert.deepEqual(
    CASAS_PARA_CADASTRAR.map((c) => c.slug),
    ['mansao-ferradura-vista-mar', 'mansao-geriba-vista-mar'],
  );
  for (const c of CASAS_PARA_CADASTRAR) {
    assert.equal(EsquemaQuartos.safeParse(c.quartosDetalhe).success, true, c.slug);
    assert.equal(EsquemaComodidades.safeParse(c.comodidadesMarcadas).success, true, c.slug);
    assert.equal(EsquemaDestaques.safeParse(c.destaques).success, true, c.slug);
    assert.equal(EsquemaRegrasProprias.safeParse(c.regrasProprias).success, true, c.slug);
    assert.equal(EsquemaTextoBairro.safeParse(c.textoBairro).success, true, c.slug);
    assert.equal(EsquemaPacotes.safeParse(c.pacotes).success, true, c.slug);
    assert.ok(c.destaques.length >= 3 && c.destaques.length <= 4, c.slug);
    const listas = listasDaCasa(c);
    for (const l of Object.values(listas)) assert.ok(l.pt.length > 0 && l.pt.length === l.es.length && l.es.length === l.en.length, c.slug);
  }
});

test('a ficha do dono: hóspedes, quartos, suítes, camas e banheiros (3,5 na Ferradura)', () => {
  assert.deepEqual(
    [
      FERRADURA.capacidade,
      FERRADURA.quartos,
      FERRADURA.suites,
      contarCamas(FERRADURA.quartosDetalhe),
      banheirosNaFicha(FERRADURA.banheiros, FERRADURA.lavabos),
    ],
    [12, 4, 3, 8, 3.5],
  );
  assert.deepEqual(
    [
      GERIBA.capacidade,
      GERIBA.quartos,
      GERIBA.suites,
      contarCamas(GERIBA.quartosDetalhe),
      banheirosNaFicha(GERIBA.banheiros, GERIBA.lavabos),
    ],
    [14, 5, 5, 9, 6],
  );
  for (const c of CASAS_PARA_CADASTRAR) {
    // o limite de hóspedes é a soma dos lugares nas camas
    assert.equal(lugaresNasCamas(c.quartosDetalhe), c.capacidade, c.slug);
    assert.equal(c.quartosDetalhe.length, c.quartos, c.slug);
  }
  // Ferradura: o dono não disse quais quartos são suítes; Geribá: os 5 são
  assert.ok(FERRADURA.quartosDetalhe.every((q) => q.banheiro === null));
  assert.ok(GERIBA.quartosDetalhe.every((q) => q.banheiro === true));
  // Geribá: só o quarto 5 tem foto (os outros ficam com o ícone de cama, nunca a foto de outro quarto)
  assert.deepEqual(
    GERIBA.quartosDetalhe.map((q) => Boolean(q.foto)),
    [false, false, false, false, true],
  );
  for (const c of CASAS_PARA_CADASTRAR) {
    for (const q of c.quartosDetalhe) if (q.foto) assert.ok(fotosNoSite(c).includes(q.foto), q.foto);
  }
});

test('as contas do FASE-4 e dos DADOS.md batem ao centavo (total, Pix, sinal e sinal no Pix)', () => {
  // fim de semana de sexta a segunda (a primeira sexta depois dos bloqueios)
  assert.deepEqual(conta(FERRADURA, '2026-12-11', '2026-12-14'), [360000, 324000, 180000, 162000]);
  assert.deepEqual(conta(GERIBA, '2026-12-11', '2026-12-14'), [510000, 459000, 255000, 229500]);
  // Carnaval 2027, sexta 05 a quarta 10/02
  assert.deepEqual(conta(FERRADURA, '2027-02-05', '2027-02-10'), [750000, 675000, 375000, 337500]);
  assert.deepEqual(conta(GERIBA, '2027-02-05', '2027-02-10'), [1100000, 990000, 550000, 495000]);
  // Réveillon de 4 diárias (29/12 a 02/01) e de 5 (28/12 a 02/01)
  assert.deepEqual(conta(FERRADURA, '2026-12-29', '2027-01-02'), [800000, 720000, 400000, 360000]);
  assert.deepEqual(conta(FERRADURA, '2026-12-28', '2027-01-02'), [1000000, 900000, 500000, 450000]);
  assert.deepEqual(conta(GERIBA, '2026-12-29', '2027-01-02'), [880000, 792000, 440000, 396000]);
  assert.deepEqual(conta(GERIBA, '2026-12-28', '2027-01-02'), [1100000, 990000, 550000, 495000]);
  // sábado 02 e domingo 03/01, depois do Réveillon, no preço de fim de semana
  assert.deepEqual(conta(FERRADURA, '2027-01-02', '2027-01-04').slice(0, 1), [260000]);
  assert.deepEqual(conta(GERIBA, '2027-01-02', '2027-01-04').slice(0, 1), [360000]);
});

test('os bloqueios iniciais: Ferradura até a noite de 06/12 e Geribá de 07/11 a 06/12 (30 noites)', () => {
  assert.deepEqual(
    FERRADURA.bloqueios.map((b) => [b.inicio, b.fim]),
    [['2026-11-06', '2026-12-07']],
  );
  assert.deepEqual(
    GERIBA.bloqueios.map((b) => [b.inicio, b.fim]),
    [['2026-11-07', '2026-12-07']],
  );
  assert.equal(ocupadas(GERIBA).length, 30);
  for (const c of CASAS_PARA_CADASTRAR) {
    const r = contaEstadia(tabela(c), '2026-12-04', '2026-12-07', { ocupadas: ocupadas(c) });
    assert.equal(r.motivo, 'ocupada', c.slug);
    // a entrada fica liberada a partir de 07/12
    assert.equal(contaEstadia(tabela(c), '2026-12-07', '2026-12-09', { ocupadas: ocupadas(c) }).ok, true, c.slug);
  }
});

test('os pacotes dos próximos 12 meses: da véspera ao primeiro dia útil, fora dos bloqueios, com o preço certo', () => {
  // [nome, entrada, saída, dia da semana da entrada e da saída (0 = domingo)]
  const ESPERADOS: [string, string, string, number, number][] = [
    ['Pacote Natal', '2026-12-24', '2026-12-28', 4, 1],
    ['Pacote Réveillon', '2026-12-28', '2027-01-02', 1, 6],
    ['Pacote Réveillon', '2026-12-29', '2027-01-02', 2, 6],
    ['Pacote Carnaval', '2027-02-05', '2027-02-10', 5, 3],
    ['Pacote Semana Santa', '2027-03-25', '2027-03-29', 4, 1],
    ['Pacote Tiradentes', '2027-04-20', '2027-04-22', 2, 4],
    ['Pacote Independência', '2027-09-03', '2027-09-08', 5, 3],
    ['Pacote Aparecida', '2027-10-08', '2027-10-13', 5, 3],
    ['Pacote Finados', '2027-10-29', '2027-11-03', 5, 3],
    ['Pacote Proclamação da República', '2027-11-12', '2027-11-16', 5, 2],
  ];
  for (const c of CASAS_PARA_CADASTRAR) {
    assert.deepEqual(
      c.pacotes.map((p) => [p.nome.pt, p.entrada, p.saida, diaDaSemana(p.entrada), diaDaSemana(p.saida)]),
      ESPERADOS,
      c.slug,
    );
    const bloqueadas = new Set(ocupadas(c));
    for (const p of c.pacotes) {
      assert.ok(p.entrada >= '2026-11-14' && p.entrada <= '2027-11-13', p.entrada);
      assert.ok(!noitesDoPacote(p).some((n) => bloqueadas.has(n)), `${p.nome.pt} cai num bloqueio`);
      assert.match(p.nome.es, /^Paquete /);
      assert.match(p.nome.en, / Package$/);
      const reveillon = p.grupo === 'reveillon-2026';
      assert.equal(p.diariaCentavos, reveillon ? c.diariaReveillonCentavos : c.diariaFeriadoCentavos, p.nome.pt);
    }
    assert.equal(c.pacotes.filter((p) => p.grupo === 'reveillon-2026').length, 2);
  }
});

test('nada de "promoção", exagero, câmera, frente para o mar ou o que o dono não confirmou', () => {
  for (const c of CASAS_PARA_CADASTRAR) {
    // os textos da casa (sem a lista das fotos e sem o nome do campo das câmeras, que fica vazio)
    const tudo = JSON.stringify({ ...c, fotos: [], fotosDeFora: [], regrasProprias: { ...c.regrasProprias, cameras: undefined } });
    for (const proibido of [
      /promo/i,
      /frente (para|al|a) (o |el |la |a )?(mar|praia|playa)/i,
      /beachfront|right on the beach|on the beach/i,
      /nossas casas|casas nossas|our own/i,
      /c[aâá]mara|c[aâ]mera|camera/i,
      /melhor|mejor|\bbest\b|exclusiv|luxuos|incr[ií]vel|perfeit/i,
      /no alto do morro|canto da praia|endere[cç]o/i,
      /360/,
    ]) {
      assert.doesNotMatch(tudo, proibido, `${c.slug}: ${proibido}`);
    }
  }
  // Ferradura: Wi-Fi, vagas, fumar e câmeras ainda não informados; nenhuma praia citada pelo nome a 5 minutos
  const idsFerradura = FERRADURA.comodidadesMarcadas.map((m) => m.id);
  for (const id of ['wifi', 'estacionamento'] as const) assert.ok(!idsFerradura.includes(id), id);
  assert.equal(FERRADURA.regrasProprias.fumar, null);
  for (const c of CASAS_PARA_CADASTRAR) assert.equal(c.regrasProprias.cameras, null, c.slug);
  // Geribá: sem máquina de lavar, berço ou proteção da piscina (não informados); sem TV na sala (a foto 37 mostra um
  // abajur, e o dono ainda não disse)
  assert.ok(!GERIBA.comodidadesMarcadas.some((m) => m.id === 'lavanderia'));
  assert.ok(!GERIBA.comodidadesMarcadas.some((m) => m.id === 'tv-sala'));
  const salaGeriba = ALT_FOTOS[`/fotos/casas/${GERIBA.slug}/sala-vista-pelo-vidro.jpg`];
  assert.doesNotMatch(`${salaGeriba.pt} ${salaGeriba.es} ${salaGeriba.en}`, /\bTV\b|televis/i);
});

test('o resumo, a descrição e o primeiro destaque não abrem com a mesma frase', () => {
  const primeiraFrase = (t: string) => t.split(/(?<=\.)\s/)[0].replace(/\.$/, '');
  for (const c of CASAS_PARA_CADASTRAR) {
    for (const idioma of ['pt', 'es', 'en'] as const) {
      const resumo = primeiraFrase(c.resumo[idioma]);
      const descricao = primeiraFrase(c.descricao[idioma]);
      assert.notEqual(descricao, resumo, `${c.slug} ${idioma}`);
      // a descrição não repete o começo do resumo (ela começa pelo que o resumo não diz)
      assert.ok(!c.descricao[idioma].startsWith(c.resumo[idioma].slice(0, 30)), `${c.slug} ${idioma}`);
      assert.notEqual(c.destaques[0].texto[idioma], resumo, `${c.slug} ${idioma}`);
    }
  }
  // e nenhum repete a frase do anúncio da Ferradura ("Casa nova, design moderno, vista para o mar")
  for (const t of [FERRADURA.resumo.pt, FERRADURA.descricao.pt, ...FERRADURA.destaques.map((d) => d.texto.pt)]) {
    assert.doesNotMatch(t, /^Casa nova, (de )?design moderno, (com )?vista para o mar/);
  }
});

test('as listas das colunas antigas levam a versão argentina onde a palavra muda (rede e lavanderia)', () => {
  const geriba = listasDaCasa(GERIBA).comodidades;
  assert.ok(geriba.es.includes('Hamaca en el jardín'));
  assert.ok(geriba['es-ar']?.includes('Hamaca paraguaya en el jardín'));
  assert.equal(geriba['es-ar']?.length, geriba.es.length);
  const ferradura = listasDaCasa(FERRADURA).comodidades;
  assert.ok(ferradura.es.includes('Lavandería con lavadora'));
  assert.ok(ferradura['es-ar']?.includes('Lavadero con lavarropas'));
  // onde nada muda, não há versão argentina (o /es-ar lê o es)
  for (const c of CASAS_PARA_CADASTRAR) {
    const { camas, regras, cancelamento } = listasDaCasa(c);
    for (const l of [camas, regras, cancelamento]) assert.equal(l['es-ar'], undefined, c.slug);
  }
});

test('o cadastro que caiu no meio: rodar de novo completa os pacotes e os bloqueios que faltam, sem duplicar', () => {
  const nada = oQueFaltaNoBanco(FERRADURA, { pacotes: [], bloqueios: [] });
  assert.equal(nada.pacotes.length, FERRADURA.pacotes.length);
  assert.deepEqual(nada.bloqueios, FERRADURA.bloqueios);
  assert.deepEqual(nada.conflitos, []);
  // tudo gravado: nada a fazer
  const gravado = {
    pacotes: FERRADURA.pacotes.map((p) => ({ entrada: p.entrada, saida: p.saida, grupo: p.grupo ?? null })),
    bloqueios: [
      ...FERRADURA.bloqueios.map((b) => ({ inicio: b.inicio, fim: b.fim, origem: 'manual' })),
      { inicio: '2027-03-01', fim: '2027-03-05', origem: 'site' },
    ],
  };
  assert.deepEqual(oQueFaltaNoBanco(FERRADURA, gravado), { pacotes: [], bloqueios: [], conflitos: [] });
  // os pacotes caíram (a casa e o bloqueio ficaram): só os pacotes voltam
  const semPacotes = oQueFaltaNoBanco(FERRADURA, { ...gravado, pacotes: [] });
  assert.equal(semPacotes.pacotes.length, FERRADURA.pacotes.length);
  assert.deepEqual(semPacotes.bloqueios, []);
  // os bloqueios caíram: só o bloqueio inicial volta (a reserva do site não conta como o bloqueio à mão)
  const semBloqueio = oQueFaltaNoBanco(FERRADURA, { ...gravado, bloqueios: gravado.bloqueios.filter((b) => b.origem === 'site') });
  assert.deepEqual(semBloqueio.pacotes, []);
  assert.deepEqual(semBloqueio.bloqueios, FERRADURA.bloqueios);
  // só uma das opções do Réveillon chegou: a outra volta (as opções do mesmo grupo podem dividir noites)
  const soUmReveillon = oQueFaltaNoBanco(FERRADURA, {
    ...gravado,
    pacotes: gravado.pacotes.filter((p) => !(p.grupo === 'reveillon-2026' && p.entrada === '2026-12-29')),
  });
  assert.deepEqual(
    soUmReveillon.pacotes.map((p) => [p.entrada, p.saida]),
    [['2026-12-29', '2027-01-02']],
  );
  assert.deepEqual(soUmReveillon.conflitos, []);
  // o dono mudou no painel: um Carnaval com outras datas e um bloqueio à mão mais curto não são gravados por cima
  const mudou = oQueFaltaNoBanco(FERRADURA, {
    pacotes: gravado.pacotes.map((p) => (p.entrada === '2027-02-05' ? { ...p, entrada: '2027-02-06' } : p)),
    bloqueios: [{ inicio: '2026-11-06', fim: '2026-11-20', origem: 'manual' }],
  });
  assert.deepEqual(mudou.pacotes, []);
  assert.deepEqual(mudou.bloqueios, []);
  assert.equal(mudou.conflitos.length, 2);
});

test('as fotos: na ordem de capa, sem metadados, sem esticar, com nome neutro e texto alternativo', async () => {
  assert.equal(FERRADURA.fotos[0].origem, '01-piscina-infinita-vista-mar.jpg');
  assert.deepEqual(
    FERRADURA.fotos.slice(0, 5).map((f) => f.origem.slice(0, 2)),
    ['01', '02', '03', '21', '04'],
  );
  assert.deepEqual(
    GERIBA.fotos.slice(0, 5).map((f) => f.origem.slice(0, 2)),
    ['01', '02', '03', '04', '05'],
  );
  assert.equal(FERRADURA.fotos.length, 35);
  assert.equal(GERIBA.fotos.length, 50);
  // as que mostram onde a Ferradura fica ficaram de fora; a 19 entra recortada, sem os vizinhos da 36, e a pessoa da 33
  // foi borrada (docs/CREDITOS.md)
  const usadas = FERRADURA.fotos.map((f) => f.origem);
  for (const n of ['34-', '36-']) assert.ok(!usadas.some((o) => o.startsWith(n)), n);
  const fachada = FERRADURA.fotos.find((f) => f.origem.startsWith('19-'));
  assert.ok(fachada?.recorte && fachada.motivoDaEdicao);
  // o recorte tira o alto (o sobrado vizinho chega até y≈110) e a faixa da esquerda (a casa de telhado vermelho até x≈100)
  assert.ok(fachada.recorte.y >= 112 && fachada.recorte.x >= 102);
  assert.equal(fachada.recorte.x + fachada.recorte.largura, 720);
  assert.equal(fachada.recorte.y + fachada.recorte.altura, 540);
  const corredor = FERRADURA.fotos.find((f) => f.origem.startsWith('33-'));
  assert.ok(corredor?.desfocar?.length === 1 && corredor.motivoDaEdicao);
  for (const c of CASAS_PARA_CADASTRAR) {
    assert.equal(new Set(c.fotos.map((f) => f.arquivo)).size, c.fotos.length, `${c.slug}: nome repetido`);
    for (const [i, foto] of fotosNoSite(c).entries()) {
      assert.doesNotMatch(c.fotos[i].arquivo, /portao|alto-do-morro|aerea|geriba|ferradur|terreo|^\d/, foto);
      assert.ok(ALT_FOTOS[foto], `${foto} sem texto alternativo`);
      const arquivo = path.join('public', foto);
      assert.ok(existsSync(arquivo), foto);
      const m = await sharp(arquivo).metadata();
      assert.equal(m.format, 'jpeg', foto);
      assert.ok(!m.exif && !m.xmp && !m.iptc && !m.icc, `${foto} ainda tem metadados`);
      assert.ok(Math.max(m.width ?? 0, m.height ?? 0) <= 1600, foto);
      // a Ferradura veio com 720 px: não foi esticada (a recortada fica com a largura do recorte)
      if (c === FERRADURA) assert.equal(m.width, c.fotos[i].recorte?.largura ?? 720, foto);
    }
  }
  // as vistas 46 a 50 da Geribá não dão nome de praia
  for (const f of GERIBA.fotos.filter((f) => Number(f.origem.slice(0, 2)) >= 46)) {
    const alt = ALT_FOTOS[`/fotos/casas/${GERIBA.slug}/${f.arquivo}`];
    assert.doesNotMatch(`${alt.pt} ${alt.es} ${alt.en}`, /Geribá/, f.arquivo);
  }
});

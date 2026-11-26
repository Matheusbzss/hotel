import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CIDADES, passeiosAtivos, type Cidade } from '../src/data/passeios.ts';
import { precoTrecho } from '../src/data/transfer.ts';
import { dicionario } from '../src/i18n/index.ts';
import { LOCALE_INTL } from '../src/i18n/config.ts';
import { texto } from '../src/i18n/conteudo.ts';
import { avisoDaFalta, motivoDaRecusa, textoDaRecusa } from '../src/lib/aviso-reserva.ts';
import { MAXIMO_NO_SITE, opinioesDoCartao, trechosDoCartao, type Avaliacao } from '../src/lib/avaliacao.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { textoDolar } from '../src/lib/dolar.ts';
import { DURACAO_ROLAGEM_MS, curvaDaRolagem, levarAoCampo } from '../src/lib/levar-ao-campo.ts';
import { linhaDoTrajeto } from '../src/lib/linha-do-trajeto.ts';
import { filtrarPasseios, textoDaLista } from '../src/lib/lista-passeios.ts';
import { precoPixCentavos } from '../src/lib/orcamento.ts';

// Pacote 34 (26/11, revisão de conversão, bloco "da inicial ao carrinho"): ENT-02 (o Reservar sem a data ou sem o
// horário leva a tela até o campo e repete o aviso perto do botão), ENT-10 (sem conexão, o aviso fala da internet),
// ENT-04 (o transfer com opiniões e garantias), ENT-05 (o trajeto do link e o preço embaixo do título), ENT-08 (o "Ver
// los 10" da vitrine e o texto da lista filtrada) e ENT-11 (as opiniões abrem ali mesmo, sem sair do passeio).

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const IDIOMAS = ['pt', 'es', 'es-ar', 'en'] as const;

/* ------------------------------------------------------------------------------------------------------------ */
/* ENT-10: o aviso de cada recusa                                                                                */
/* ------------------------------------------------------------------------------------------------------------ */

test('ENT-10: a falta de conexão, o erro de data ou horário e o resto são motivos diferentes', () => {
  // sem resposta: a conexão (o CarrinhoContexto devolve 'rede' quando o fetch falha ou a resposta não é JSON)
  assert.equal(motivoDaRecusa(undefined), 'conexao');
  assert.equal(motivoDaRecusa('rede'), 'conexao');
  // só os erros de data, de horário e da volta do transfer falam de data e horário, também pelo caminho do campo
  for (const erro of ['data', 'hora', 'volta', 'ida.data', 'ida.hora', 'volta.data', 'volta.hora'])
    assert.equal(motivoDaRecusa(erro), 'dataHora', erro);
  assert.equal(motivoDaRecusa('cheio'), 'cheio');
  assert.equal(motivoDaRecusa('antecedencia'), 'antecedencia');
  // o banco fora do ar, o limite por IP e o que só uma página velha mandaria não culpam a data
  for (const erro of ['banco', 'limite', 'slug', 'opcao', 'adultos', 'pessoas', 'trajeto', 'veiculo', 'cotacao', 'tipo', 'dados'])
    assert.equal(motivoDaRecusa(erro), 'outro', erro);
  // "data" no meio de outra palavra não conta
  assert.equal(motivoDaRecusa('dataset'), 'outro');
});

test('ENT-10: nos 4 idiomas, sem conexão o aviso fala da internet e não da data; só o erro de data ou horário fala dela', () => {
  const DATA = { pt: /data/i, es: /fecha/i, 'es-ar': /fecha/i, en: /date/i } as const;
  const INTERNET = { pt: /internet/i, es: /internet/i, 'es-ar': /internet/i, en: /internet/i } as const;
  for (const idioma of IDIOMAS) {
    const K = dicionario(idioma).carrinho;
    const conexao = textoDaRecusa('rede', K);
    assert.equal(conexao, K.erroConexao, idioma);
    assert.match(conexao, INTERNET[idioma], idioma);
    assert.doesNotMatch(conexao, DATA[idioma], idioma);
    // tocar de novo resolve: o aviso pede isso
    assert.match(conexao, { pt: /toque de novo/, es: /toca de nuevo/, 'es-ar': /tocá de nuevo/, en: /tap again/ }[idioma], idioma);
    assert.equal(textoDaRecusa('hora', K), K.erroAdicionar, idioma);
    assert.match(K.erroAdicionar, DATA[idioma], idioma);
    const outro = textoDaRecusa('banco', K);
    assert.equal(outro, K.erroTemporario, idioma);
    assert.doesNotMatch(outro, DATA[idioma], idioma);
    assert.equal(textoDaRecusa('cheio', K), K.cheio, idioma);
  }
  // o espanhol neutro com tú, o da Argentina com vos
  assert.equal(dicionario('es').carrinho.erroConexao, 'No pudimos conectar. Revisa tu internet y toca de nuevo.');
  assert.equal(dicionario('es-ar').carrinho.erroConexao, 'No pudimos conectar. Revisá tu internet y tocá de nuevo.');
  assert.equal(dicionario('es').carrinho.erroTemporario, 'No se pudo agregar ahora. Intenta de nuevo en unos minutos.');
  assert.equal(dicionario('es-ar').carrinho.erroTemporario, 'No se pudo agregar ahora. Intentá de nuevo en unos minutos.');
});

test('ENT-10: o cartão do passeio, o do transfer e o transfer do link antigo usam o mesmo aviso (só leitura do código)', () => {
  const contexto = ler('src/components/carrinho/CarrinhoContexto.tsx');
  // a resposta que não chega (ou não é do site) vira 'rede'
  assert.match(contexto, /return \{ ok: false, erro: j\?\.erro \?\? 'rede' \};/);
  assert.match(contexto, /catch \{\s+return \{ ok: false, erro: 'rede' \};/);
  const passeio = ler('src/components/WidgetReserva.tsx');
  assert.match(passeio, /setErroEnvio\(textoDaRecusa\(r\.erro, T\)\)/);
  const widget = ler('src/components/transfer/WidgetTransfer.tsx');
  assert.match(widget, /setErroEnvio\(r\.erro === 'antecedencia' \? erroAntecedencia : textoDaRecusa\(r\.erro, T\)\)/);
  const formulario = ler('src/components/transfer/FormularioTransfer.tsx');
  assert.match(formulario, /setErro\(r\.erro === 'antecedencia' \? erroAntecedencia : textoDaRecusa\(r\.erro, K\)\)/);
  // nenhum deles cai mais direto na frase da data e do horário
  for (const [nome, fonte] of [
    ['WidgetReserva', passeio],
    ['WidgetTransfer', widget],
    ['FormularioTransfer', formulario],
  ])
    assert.doesNotMatch(fonte, /: [TK]\.erroAdicionar\)/, nome);
  // os textos chegam aos dois cartões
  assert.match(
    ler('src/app/[locale]/passeios/[slug]/page.tsx'),
    /erroConexao: d\.carrinho\.erroConexao,\s+erroTemporario: d\.carrinho\.erroTemporario,/,
  );
  assert.match(
    ler('src/components/transfer/SecoesTransfer.tsx'),
    /erroConexao: d\.carrinho\.erroConexao,\s+erroTemporario: d\.carrinho\.erroTemporario,/,
  );
});

/* ------------------------------------------------------------------------------------------------------------ */
/* ENT-02: o Reservar sem a data ou sem o horário                                                                */
/* ------------------------------------------------------------------------------------------------------------ */

test('ENT-02: o aviso perto do botão diz o que falta, e o "sem horários hoje" pede outra data', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    const T = { ...d.carrinho, semHorarioHoje: d.checkout.erros.semHorarioHoje };
    assert.equal(avisoDaFalta({ data: true, horario: true }, T), T.faltaDataEHorario, idioma);
    assert.equal(avisoDaFalta({ data: true, horario: false }, T), T.faltaData, idioma);
    assert.equal(avisoDaFalta({ data: false, horario: true }, T), T.faltaHorario, idioma);
    assert.equal(avisoDaFalta({ data: false, horario: false }, T), '', idioma);
    // hoje sem horário: o que muda é a data, mesmo com o horário também faltando
    assert.equal(avisoDaFalta({ data: true, horario: true, semHorarioHoje: true }, T), T.semHorarioHoje, idioma);
    assert.equal(avisoDaFalta({ data: true, horario: false, semHorarioHoje: true }, T), T.semHorarioHoje, idioma);
    // as três frases dizem que o campo está mais acima, perto de onde a pessoa tocou
    for (const f of [T.faltaData, T.faltaHorario, T.faltaDataEHorario]) assert.match(f, /acima|arriba|above/, `${idioma}: ${f}`);
  }
  assert.equal(dicionario('es-ar').carrinho.faltaHorario, 'Elegí el horario, más arriba.');
  assert.equal(dicionario('es').carrinho.faltaHorario, 'Elige el horario, más arriba.');
  assert.equal(dicionario('pt').carrinho.faltaData, 'Escolha a data do passeio, mais acima.');
});

/**
 * Uma tela de mentira para levarAoCampo: a página rola (scrollY), o bloco está em `topoNaPagina` e o navegador pode
 * "compensar" o que cresceu acima da tela (o ajuste que, no Safari, cancelava a rolagem suave).
 */
function telaDeMentira({ reduzir = false, margemDoBloco = '0px' } = {}) {
  const estado = { scrollY: 0, quadros: [] as ((t: number) => void)[], rolagens: [] as number[], focos: [] as unknown[], ouvintes: 0 };
  const estilo: { scrollBehavior?: string } = { scrollBehavior: '' };
  const janela = {
    innerHeight: 800,
    get scrollY() {
      return estado.scrollY;
    },
    matchMedia: () => ({ matches: reduzir }),
    requestAnimationFrame: (f: (t: number) => void) => estado.quadros.push(f),
    getComputedStyle: () => ({ scrollMarginTop: margemDoBloco }),
    scrollTo: (_x: number, y: number) => {
      estado.scrollY = y;
      estado.rolagens.push(Math.round(y));
    },
    addEventListener: () => estado.ouvintes++,
    removeEventListener: () => estado.ouvintes--,
  };
  const bloco = {
    topoNaPagina: 2000,
    getBoundingClientRect() {
      return { top: this.topoNaPagina - estado.scrollY, height: 100 };
    },
  };
  const campo = { focus: (o: unknown) => estado.focos.push(o) };
  /** Roda o próximo quadro, no instante t (ms). */
  const quadro = (t: number) => estado.quadros.shift()?.(t);
  return { estado, estilo, janela, documento: { documentElement: { style: estilo, scrollHeight: 6000 } }, bloco, campo, quadro };
}

test('ENT-02: levarAoCampo leva o campo ao meio da tela em 360 ms, no quadro seguinte, com o foco sem rolar, mesmo com o ajuste do navegador no meio', () => {
  const global = globalThis as { window?: unknown; document?: unknown };
  const antes = { window: global.window, document: global.document };
  try {
    const t = telaDeMentira();
    global.window = t.janela;
    global.document = t.documento;
    t.estado.scrollY = 3000;
    levarAoCampo(t.bloco as unknown as HTMLElement, t.campo as unknown as HTMLElement);
    // nada no meio do toque: a rolagem e o foco começam no quadro seguinte, com os avisos já na página
    assert.deepEqual(t.estado.rolagens, []);
    assert.deepEqual(t.estado.focos, []);
    t.quadro(0);
    assert.deepEqual(t.estado.focos, [{ preventScroll: true }]);
    // cada passo direto (o scroll-behavior: smooth da página faria de cada passo outra rolagem)
    assert.equal(t.estilo.scrollBehavior, 'auto');
    // o meio da tela: 2000 - (800 - 100) / 2 = 1650
    t.quadro(90);
    // o navegador compensa 44 px de aviso que entrou acima da tela: a tela anda, o bloco anda junto na tela
    t.estado.scrollY += 44;
    t.bloco.topoNaPagina += 44;
    t.quadro(180);
    t.quadro(DURACAO_ROLAGEM_MS);
    assert.equal(t.estado.rolagens.at(-1), 1650 + 44);
    // descendo sempre na direção do campo, sem voltar
    for (let i = 1; i < t.estado.rolagens.length; i++) assert.ok(t.estado.rolagens[i] <= t.estado.rolagens[i - 1]);
    // no fim, o scroll-behavior volta e os ouvintes saem
    assert.equal(t.estilo.scrollBehavior, '');
    assert.equal(t.estado.ouvintes, 0);
    assert.equal(t.estado.quadros.length, 0);
  } finally {
    global.window = antes.window;
    global.document = antes.document;
  }
});

test('ENT-02: levarAoCampo com "reduzir movimento" vai direto; "start" respeita a folga da cápsula; sem bloco, nada', () => {
  const global = globalThis as { window?: unknown; document?: unknown };
  const antes = { window: global.window, document: global.document };
  try {
    const r = telaDeMentira({ reduzir: true });
    global.window = r.janela;
    global.document = r.documento;
    levarAoCampo(r.bloco as unknown as HTMLElement, r.campo as unknown as HTMLElement);
    r.quadro(0);
    assert.deepEqual(r.estado.rolagens, [1650]);
    assert.equal(r.estado.quadros.length, 0);
    assert.equal(r.estilo.scrollBehavior, '');
    // o título de um cartão: o começo dele 96 px abaixo do topo (scroll-mt-24), abaixo da cápsula do menu
    const s = telaDeMentira({ reduzir: true, margemDoBloco: '96px' });
    global.window = s.janela;
    global.document = s.documento;
    levarAoCampo(s.bloco as unknown as HTMLElement, null, 'start');
    s.quadro(0);
    assert.deepEqual(s.estado.rolagens, [2000 - 96]);
    // sem o pedaço, nada acontece
    const n = telaDeMentira();
    global.window = n.janela;
    global.document = n.documento;
    levarAoCampo(null, n.campo as unknown as HTMLElement);
    assert.equal(n.estado.quadros.length, 0);
    // a curva começa rápida e para devagar
    assert.equal(curvaDaRolagem(0), 0);
    assert.equal(curvaDaRolagem(1), 1);
    assert.ok(curvaDaRolagem(0.25) > 0.6);
  } finally {
    global.window = antes.window;
    global.document = antes.document;
  }
});

test('ENT-02: no cartão do passeio, os dois botões passam pela mesma conferência, que marca os campos e leva a tela até o primeiro', () => {
  const f = ler('src/components/WidgetReserva.tsx');
  // o Reservar e o Agregar chamam o mesmo colocar(), que confere a data e o horário antes de tudo
  assert.match(f, /onClick=\{\(\) => colocar\('agora'\)\}/);
  assert.match(f, /onClick=\{\(\) => colocar\('carrinho'\)\}/);
  const colocar = f.slice(f.indexOf('const colocar = async'), f.indexOf('setEnviando(destino);'));
  assert.match(colocar, /if \(faltaData \|\| faltaHora\) \{/);
  assert.match(colocar, /setErroData\(faltaData\);\s+setErroHora\(faltaHora\);/);
  assert.match(colocar, /if \(faltaData\) levarAoCampo\(blocoData\.current, dataRef\.current\);/);
  assert.match(colocar, /else levarAoCampo\(blocoHora\.current, /);
  // os dois pedaços ganham o destaque e o aviso perto dos botões repete o que falta
  assert.match(f, /<div ref=\{blocoData\} className="bloco-campo mt-5" data-falta=\{erroData \? '' : undefined\}>/);
  assert.match(f, /<div ref=\{blocoHora\} className="bloco-campo mt-5" data-falta=\{erroHora \? '' : undefined\}>/);
  assert.match(f, /const avisoPerto = avisoDaFalta\(\{ data: erroData, horario: erroHora, semHorarioHoje \}, T\);/);
  assert.match(f, /\{avisoPerto \|\| erroEnvio\}/);
  // os textos chegam da página
  assert.match(ler('src/app/[locale]/passeios/[slug]/page.tsx'), /faltaData: d\.carrinho\.faltaData,/);
});

test('ENT-02: o destaque do campo não muda nada de lugar (o fundo vem por fora da caixa) e some com "reduzir movimento"', () => {
  const css = ler('src/app/globals.css');
  const bloco = css.slice(css.indexOf('  .bloco-campo {'), css.indexOf('  .bloco-campo[data-falta]::before'));
  assert.doesNotMatch(bloco.slice(0, bloco.indexOf('::before')), /margin|padding/);
  assert.match(bloco, /\.bloco-campo::before \{[^}]*position: absolute;[^}]*inset: -0\.375rem -0\.75rem;[^}]*z-index: -1;/);
  assert.match(css, /\.bloco-campo\[data-falta\]::before \{\s+opacity: 1;\s+\}/);
});

test('ENT-02 no transfer: o cartão diz o pedaço que falta, leva a tela até ele e repete o aviso embaixo dele e perto dos botões', () => {
  const f = ler('src/components/transfer/WidgetTransfer.tsx');
  for (const campo of ['saida', 'destino', 'quando', 'volta', 'voltaSaida', 'voltaDestino'])
    assert.match(
      f,
      new RegExp(`<BlocoCampo ref=\\{bloco\\('${campo}'\\)\\} falta=\\{faltaEm\\('${campo}'\\)\\} aviso=\\{falta\\?\\.texto\\}`),
      campo,
    );
  assert.match(f, /if \(incompleta\) return \{ campo: incompleta\[0\], texto: T\.trajetoIncompleto \};/);
  assert.match(f, /levarAoCampo\(el, campos\.find\(\(c\) => !c\.value\.trim\(\)\) \?\? campos\[0\]\);/);
  // perto dos botões, o mesmo aviso (ou o da recusa)
  assert.match(f, /const erro = falta\?\.texto \|\| erroEnvio;/);
});

/* ------------------------------------------------------------------------------------------------------------ */
/* ENT-04 e ENT-11: as opiniões                                                                                  */
/* ------------------------------------------------------------------------------------------------------------ */

const av = (id: string, extra: Partial<Avaliacao> = {}): Avaliacao => ({
  id,
  nome: id,
  texto: `Texto curto de ${id}.`,
  idioma: 'es',
  origem: 'tripadvisor',
  data: '2026-10-01',
  publicada: true,
  nota: 5,
  ...extra,
});

test('ENT-04: no cartão do transfer, as avaliações marcadas com o transfer vêm primeiro', () => {
  const lista = [
    av('a', { data: '2026-10-05' }),
    av('b', { data: '2026-10-04' }),
    av('t1', { idioma: 'pt', produtoSlug: 'transfer', data: '2026-08-01' }),
    av('t2', { idioma: 'pt', produtoSlug: 'transfer', data: '2026-07-01' }),
  ];
  assert.deepEqual(
    trechosDoCartao(lista, 'transfer', 'es-ar').map((a) => a.id),
    ['t1', 't2'],
  );
  // num passeio, as do transfer não passam na frente
  assert.deepEqual(
    trechosDoCartao(lista, 'escuna-buzios', 'es-ar').map((a) => a.id),
    ['a', 'b'],
  );
});

test('ENT-11: aberto, o cartão mostra as mesmas do fechado no mesmo lugar e depois as outras da agência, no máximo 6', () => {
  const longa = `${'Muy buena experiencia con el equipo y el barco '.repeat(4)}.`;
  const lista = [
    av('cortada', { texto: longa, data: '2026-10-09' }),
    av('a', { data: '2026-10-08' }),
    av('b', { data: '2026-10-07' }),
    av('cidade', { sobre: 'destino', data: '2026-10-06' }),
    ...['c', 'd', 'e', 'f', 'g'].map((id, i) => av(id, { data: `2026-09-0${i + 1}` })),
  ];
  const { iniciais, todas } = opinioesDoCartao(lista, 'escuna-buzios', 'es');
  assert.deepEqual(
    iniciais.map((a) => a.id),
    ['a', 'b'],
  );
  // as iniciais primeiro, no mesmo lugar; a da cidade fica fora; no máximo as que a inicial mostra
  assert.deepEqual(todas.slice(0, 2), iniciais);
  assert.equal(todas.length, MAXIMO_NO_SITE);
  assert.ok(todas.some((a) => a.id === 'cortada'));
  assert.ok(!todas.some((a) => a.id === 'cidade'));
});

test('ENT-11: o "Ver todas as opiniões" abre o cartão ali mesmo, sem levar para a inicial (só leitura do código)', () => {
  const cartao = ler('src/components/passeio/OpinioesPasseio.tsx');
  assert.doesNotMatch(cartao, /#opinioes-titulo|<Link|href=/);
  assert.match(cartao, /const \{ iniciais, todas \} = opinioesDoCartao\(avaliacoes, slug, idioma\);/);
  const lista = ler('src/components/passeio/ListaOpinioes.tsx');
  assert.match(lista, /aria-expanded=\{aberto\}/);
  assert.match(lista, /\{aberto \? textos\.verMenos : textos\.verTodas\}/);
  // ao fechar, a tela volta ao título se ele subiu, pelo mesmo caminho do cartão de reserva (sem o Safari cancelar)
  assert.match(lista, /levarAoCampo\(titulo, null, 'start'\)/);
  // o "Leer más" só quando o texto foi cortado de verdade
  assert.match(lista, /setCortado\(p\.scrollHeight > p\.clientHeight \+ 1\)/);
  for (const idioma of IDIOMAS) assert.ok(dicionario(idioma).passeio.opinioesVerMenos.length > 0, idioma);
});

test('ENT-04: a página do transfer tem o cartão de opiniões depois do cartão de reserva e as garantias sem a linha do clima', () => {
  const pagina = ler('src/app/[locale]/transfer/page.tsx');
  assert.match(pagina, /garantias=\{<Confianca d=\{d\} semClima \/>\}/);
  assert.match(pagina, /<OpinioesPasseio avaliacoes=\{avaliacoes\} slug="transfer" idioma=\{locale\} d=\{d\} className="mt-5" \/>/);
  // o pagamento seguro e o voucher na hora seguem o interruptor do pagamento online, como no passeio
  assert.match(pagina, /const d = comPromessasOnline\(dicionario\(locale\)\);/);
  // no celular, as vantagens curtas que só o computador mostrava
  const celular = pagina.slice(pagina.indexOf('pb-16 md:hidden">'), pagina.indexOf('o vidro ocupa o que sobra'));
  assert.match(celular, /<h1 className="topo-passeio-titulo mt-3 text-white">/);
  // as etiquetas vêm antes do nome, como no topo dos passeios e no vidro do computador
  assert.ok(celular.indexOf('T.etiquetas.map') < celular.indexOf('<h1'));
  assert.match(celular, /T\.etiquetas\.map/);
  const confianca = ler('src/components/passeio/Confianca.tsx');
  assert.match(confianca, /\['chuva', semClima \? '' : chuva\],/);
  // as garantias embaixo dos botões do transfer
  assert.match(ler('src/components/transfer/WidgetTransfer.tsx'), /\{garantias && <div className="mt-5">\{garantias\}<\/div>\}/);
});

/* ------------------------------------------------------------------------------------------------------------ */
/* ENT-05: o trajeto do link embaixo do título                                                                   */
/* ------------------------------------------------------------------------------------------------------------ */

test('ENT-05: com o trajeto no link, a linha traz o trajeto e o preço do carro pelas contas do cartão, com o cartão grande em espanhol', () => {
  const dolar = 5.8573;
  const cartao = Math.round((precoTrecho('galeao', 'buzios', 'carro') as number) * 100);
  const pix = precoPixCentavos(cartao);
  for (const idioma of ['es', 'es-ar', 'en'] as const) {
    const d = dicionario(idioma);
    const locale = LOCALE_INTL[idioma];
    const T = { ateNPessoas: d.transfer.ateNPessoas, ...d.preco };
    const linha = linhaDoTrajeto('?saida=galeao&destino=buzios&volta=nao', idioma, locale, dolar, T);
    assert.ok(linha, idioma);
    assert.equal(linha.grande.valor, formatarCifra(cartao, locale), idioma);
    assert.equal(linha.grande.rotulo, d.preco.noCartao, idioma);
    assert.equal(linha.grande.dolar, textoDolar(cartao, dolar, d.preco.dolar, locale), idioma);
    assert.equal(linha.embaixo.valor, formatarCifra(pix, locale), idioma);
    assert.equal(linha.embaixo.rotulo, d.preco.noPixComDesconto.replace('{p}', '10'), idioma);
  }
  const es = linhaDoTrajeto('?saida=galeao&destino=buzios&volta=nao', 'es-ar', 'es-AR', dolar, {
    ateNPessoas: dicionario('es-ar').transfer.ateNPessoas,
    ...dicionario('es-ar').preco,
  });
  assert.equal(es?.trajeto, 'Aeropuerto de Galeão (GIG), Río → Búzios');
  assert.equal(es?.veiculo, 'Auto ejecutivo, hasta 4 personas');
  // o Intl separa o "R$" do número com o espaço que não quebra
  assert.equal(es?.grande.valor, 'R$\u00a0800,00');
  assert.equal(es?.embaixo.valor, 'R$\u00a0720,00');
  // em português, o Pix grande e o cartão embaixo (e sem dólar)
  const pt = linhaDoTrajeto('?origem=galeao&destino=buzios&volta=no', 'pt', 'pt-BR', null, {
    ateNPessoas: dicionario('pt').transfer.ateNPessoas,
    ...dicionario('pt').preco,
  });
  assert.equal(pt?.grande.valor, formatarCifra(pix, 'pt-BR'));
  assert.equal(pt?.grande.rotulo, 'no Pix');
  assert.equal(pt?.grande.dolar, '');
  assert.equal(pt?.embaixo.rotulo, 'no cartão');
});

test('ENT-05: sem as duas pontas no link, ou com o trajeto sob cotação, não há linha', () => {
  const T = { ateNPessoas: 'hasta {n} personas', ...dicionario('es').preco };
  assert.equal(linhaDoTrajeto('', 'es', 'es-AR', null, T), null);
  assert.equal(linhaDoTrajeto('?destino=buzios', 'es', 'es-AR', null, T), null);
  assert.equal(linhaDoTrajeto('?saida=galeao', 'es', 'es-AR', null, T), null);
  // saída num aeroporto sem ?volta=nao: o cartão abre com "Ida y vuelta" (o total é o dobro), então nada de linha com
  // o preço de um trecho; com o &volta=nao dos anúncios, a linha aparece; saindo da cidade, o cartão abre só com a ida
  assert.equal(linhaDoTrajeto('?saida=galeao&destino=buzios', 'es', 'es-AR', null, T), null);
  assert.equal(linhaDoTrajeto('?saida=aeroporto-cabo-frio&destino=buzios', 'es', 'es-AR', null, T), null);
  assert.ok(linhaDoTrajeto('?saida=galeao&destino=buzios&volta=nao', 'es', 'es-AR', null, T));
  assert.ok(linhaDoTrajeto('?saida=rio-de-janeiro&destino=buzios', 'es', 'es-AR', null, T));
  // dentro da região, sem preço fixo
  assert.equal(precoTrecho('buzios', 'cabo-frio', 'carro'), null);
  assert.equal(linhaDoTrajeto('?saida=buzios&destino=cabo-frio', 'es', 'es-AR', null, T), null);
});

test('ENT-05: a linha fica logo embaixo do título, no celular e no computador (só leitura do código)', () => {
  const pagina = ler('src/app/[locale]/transfer/page.tsx');
  assert.match(pagina, /<h1 className="topo-passeio-titulo mt-3 text-white">\{T\.titulo\}<\/h1>\s+\{\/\*[\s\S]*?\*\/\}\s+<TrajetoDoLink/);
  assert.match(pagina, /\{T\.titulo\}\s+<\/p>\s+\{\/\*[\s\S]*?\*\/\}\s+<TrajetoDoLink/);
  // nada de preço escrito à mão
  assert.doesNotMatch(pagina, /R\$ ?\d/);
});

/* ------------------------------------------------------------------------------------------------------------ */
/* ENT-08: o "Ver los 10" e o texto da lista filtrada                                                            */
/* ------------------------------------------------------------------------------------------------------------ */

test('ENT-08: o texto do topo da lista conta só os passeios mostrados e diz só as cidades deles', () => {
  const ativos = passeiosAtivos();
  const itens = ativos.map((p) => ({ cidade: p.cidade, categoria: p.categoria }));
  const cidades = (Object.keys(CIDADES) as Cidade[]).map((c) => ({ valor: c, rotulo: texto(CIDADES[c].nome, 'es') }));
  const d = dicionario('es-ar');
  const T = { geral: `${ativos.length} paseos en todo`, filtrado: d.passeios.textoFiltrado, filtradoUm: d.passeios.textoFiltradoUm };
  const deBuzios = filtrarPasseios(itens, 'buzios', '').length;
  assert.ok(deBuzios > 1);
  // sem filtro: o texto de sempre
  assert.equal(textoDaLista(itens, { cidade: '', tipo: '' }, cidades, 'es-AR', T), T.geral);
  assert.equal(
    textoDaLista(itens, { cidade: 'buzios', tipo: '' }, cidades, 'es-AR', T),
    `${deBuzios} paseos en Búzios, con reserva online y cancelación gratis hasta 24 h antes.`,
  );
  // um só: o singular
  assert.equal(filtrarPasseios(itens, 'rio-de-janeiro', '').length, 1);
  assert.equal(
    textoDaLista(itens, { cidade: 'rio-de-janeiro', tipo: '' }, cidades, 'es-AR', T),
    '1 paseo en Río de Janeiro, con reserva online y cancelación gratis hasta 24 h antes.',
  );
  // só o tipo: as cidades dos passeios mostrados, na ordem da lista
  const barcos = filtrarPasseios(itens, '', 'barco');
  const lugares = cidades.filter((c) => barcos.some((b) => b.cidade === c.valor)).map((c) => c.rotulo);
  const esperado = new Intl.ListFormat('es-AR', { type: 'conjunction' }).format(lugares);
  assert.equal(
    textoDaLista(itens, { cidade: '', tipo: 'barco' }, cidades, 'es-AR', T),
    `${barcos.length} paseos en ${esperado}, con reserva online y cancelación gratis hasta 24 h antes.`,
  );
  // nenhum: o de sempre (a lista mostra o "ningún paseo" com o botão de limpar)
  assert.equal(textoDaLista(itens, { cidade: 'rio-de-janeiro', tipo: 'lancha' }, cidades, 'es-AR', T), T.geral);
  // em inglês, sem a vírgula antes do "and", como no texto de sempre
  const en = dicionario('en').passeios;
  const tres = [{ cidade: 'buzios' }, { cidade: 'arraial-do-cabo' }, { cidade: 'cabo-frio' }].map((i) => ({ ...i, categoria: 'x' }));
  assert.equal(
    textoDaLista(tres, { cidade: '', tipo: 'x' }, cidades, 'en-US', {
      geral: '',
      filtrado: en.textoFiltrado,
      filtradoUm: en.textoFiltradoUm,
    }),
    '3 tours in Búzios, Arraial do Cabo and Cabo Frio, with online booking and free cancellation up to 24 h before.',
  );
  for (const idioma of IDIOMAS) {
    const P = dicionario(idioma).passeios;
    assert.match(P.textoFiltrado, /^\{n\} .*\{lugares\}/, idioma);
    assert.match(P.textoFiltradoUm, /^1 .*\{lugares\}/, idioma);
  }
});

test('ENT-08: na vitrine, cada cidade com mais de um passeio tem o "Ver los N →" para a lista filtrada (só leitura do código)', () => {
  const pagina = ler('src/app/[locale]/page.tsx');
  assert.match(
    pagina,
    /\.\.\.\(daCidade\(c\)\.length > 1\s+\? \{ ver: \{ href: `\$\{rota\(locale, '\/passeios'\)\}\?cidade=\$\{c\}`, texto: fmt\(H\.destinosVer, \{ n: daCidade\(c\)\.length \}\) \} \}\s+: \{\}\),/,
  );
  const vitrine = ler('src/components/home/Vitrine.tsx');
  assert.match(vitrine, /<Link\s+href=\{s\.ver\.href\}/);
  assert.match(vitrine, /aria-describedby=\{`passeios-\$\{s\.id\}-titulo`\}/);
  const esperado = { pt: 'Ver os {n}', es: 'Ver los {n}', 'es-ar': 'Ver los {n}', en: 'See all {n}' } as const;
  for (const idioma of IDIOMAS) assert.equal(dicionario(idioma).home.destinosVer, esperado[idioma], idioma);
  // a lista lê o mesmo ?cidade= (a lista e o texto do topo usam o mesmo filtro)
  const explorador = ler('src/components/ExploradorPasseios.tsx');
  assert.match(explorador, /const c = q\.get\('cidade'\) \?\? '';/);
  assert.match(ler('src/app/[locale]/passeios/page.tsx'), /<TextoDaLista/);
});

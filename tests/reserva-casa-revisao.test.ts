import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CASAS_PARA_CADASTRAR, linhaDaCasa, type CasaParaCadastrar } from '../scripts/dados/casas.ts';
import { dicionario } from '../src/i18n/index.ts';
import { IDIOMAS } from '../src/i18n/config.ts';
import { itensDaConta, totaisDoCarrinho, type ItemVisivel } from '../src/lib/carrinho.ts';
import { detalhesDeLinha } from '../src/lib/casa-detalhes.ts';
import {
  casaFechadaNoPedido,
  conferirCasa,
  conferirOPagarDeNovo,
  motivoDaCasaIndisponivel,
  noitesDaCasa,
  type BloqueioLido,
  type CasaParaConta,
  type ContextoDasCasas,
} from '../src/lib/casa-no-carrinho.ts';

// A revisão de 26/11 da reserva das casas (pacote 1, partes 1 e 2): os 10 achados do revisor, conferidos e consertados. As
// regras rodam aqui em node, sem banco e sem Next (a casa no carrinho e o "Pagar de novo", src/lib/casa-no-carrinho.ts); as
// rotas e as telas, que usam o atalho "@/", são conferidas pela leitura do código, no fim. Os pedidos são fictícios.

delete process.env.SUPABASE_URL;

const em = (dataHora: string) => new Date(`${dataHora}-03:00`);
/** Quinta, 26/11/2026, ao meio-dia em Búzios: a primeira entrada possível é sexta, 27/11. */
const AGORA = em('2026-11-26T12:00:00');

const FERRADURA_CADASTRO = CASAS_PARA_CADASTRAR.find((c) => c.slug === 'mansao-ferradura-vista-mar') as CasaParaCadastrar;

/** A casa como o site a lê (a linha do cadastro, os detalhes, os pacotes), como em tests/reserva-casa.test.ts. */
function comoNoSite(c: CasaParaCadastrar, id: string): CasaParaConta {
  return {
    id,
    slug: c.slug,
    nome: c.nome,
    cidade: c.cidade,
    capacidade: c.capacidade,
    fotos: [`/fotos/casas/${c.slug}/capa.jpg`],
    diaria: c.diariaCentavos / 100,
    minimoNoites: c.minimoNoites,
    temporadas: [],
    feriados: [],
    detalhes: detalhesDeLinha(linhaDaCasa(c)),
    pacotes: c.pacotes,
  };
}
const FERRADURA = comoNoSite(FERRADURA_CADASTRO, '00000000-0000-4000-8000-000000000001');

/** O contexto como o servidor monta (src/lib/casas-carrinho.ts): a casa, as noites ocupadas e se a reserva vale. */
function contexto(bloqueios: BloqueioLido[] = [], { aberta = true, casa = FERRADURA } = {}): ContextoDasCasas {
  return {
    lido: true,
    aberta,
    casas: new Map([[casa.slug, { casa, ...noitesDaCasa(bloqueios, new Set()) }]]),
  };
}

const escolha = (entrada: string, saida: string, hospedes = 10) => ({
  tipo: 'casa' as const,
  slug: FERRADURA.slug,
  entrada,
  saida,
  hospedes,
});

/** A sexta 11/12 presa pela trava de outro cliente (a página guardada ainda a risca). */
const SEXTA_DE_OUTRO: BloqueioLido = { casaId: FERRADURA.id, inicio: '2026-12-11', fim: '2026-12-12', itemPedidoId: 'item-de-outro' };

/* ------------------------------------------------------------------ */
/* Achado 1 (médio): a casa com a reserva das casas fechada             */

test('achado 1: a casa com a reserva fechada fica no carrinho como indisponível ("fechada"), como a da noite ocupada', () => {
  const fechada = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto([], { aberta: false }), AGORA);
  assert.equal(motivoDaCasaIndisponivel(fechada), 'fechada');
  const ocupada = conferirCasa(
    escolha('2026-12-14', '2026-12-16'),
    contexto([{ casaId: FERRADURA.id, inicio: '2026-12-15', fim: '2026-12-16', itemPedidoId: 'x' }]),
    AGORA,
  );
  assert.equal(motivoDaCasaIndisponivel(ocupada), 'ocupada');
  // as outras recusas tiram a casa da lista, como o passeio que passou da data; a casa que vale não fica indisponível
  assert.equal(motivoDaCasaIndisponivel(conferirCasa(escolha('2026-12-12', '2026-12-14'), contexto(), AGORA)), undefined);
  assert.equal(motivoDaCasaIndisponivel({ ok: false, erro: 'slug' }), undefined);
  assert.equal(motivoDaCasaIndisponivel(conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(), AGORA)), undefined);
  // fechada, ela fica fora da conta (e do pedido): o carrinho cobra só o passeio
  const passeio: ItemVisivel = {
    id: 'p1',
    tipo: 'passeio',
    titulo: 'Passeio de Escuna',
    foto: '',
    detalhes: [],
    href: '',
    totalCentavos: 15400,
    totalPixCentavos: 13860,
    escolha: { tipo: 'passeio', slug: 'escuna-buzios', data: '2026-12-15', hora: '09:00', adultos: 2, meia: 0, gratis: 0 },
  };
  const casaFechada: ItemVisivel = {
    id: 'c1',
    tipo: 'casa',
    titulo: 'Mansão Ferradura Vista Mar',
    foto: '',
    detalhes: [],
    href: '',
    totalCentavos: 0,
    totalPixCentavos: 0,
    escolha: escolha('2026-12-14', '2026-12-16'),
    indisponivel: 'fechada',
  };
  assert.deepEqual(totaisDoCarrinho([passeio, casaFechada]), { totalCentavos: 15400, totalPixCentavos: 13860 });
  assert.deepEqual(itensDaConta([passeio, casaFechada]), [passeio]);
});

test('achado 1: carrinho com casa e passeio e a reserva das casas fechada: o pedido do passeio sai; só a casa vista como reservável recusa', () => {
  const fechada = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto([], { aberta: false }), AGORA);
  const todas = [
    { id: 'c1', c: fechada },
    { id: 'p1', c: { ok: true } },
  ];
  // a tela mostra a casa fechada, fora da conta: o pedido vai só com o passeio (ids sem a casa) e não é recusado
  assert.equal(casaFechadaNoPedido(todas, ['p1']), false);
  // a tela de antes ainda mostrava a casa como reservável (a reserva fechou enquanto o cliente preenchia): 403 'casa-fechada',
  // e a tela relê o carrinho, onde a casa aparece fechada
  assert.equal(casaFechadaNoPedido(todas, ['c1', 'p1']), true);
  // a casa que vale, ou a ocupada (que tem o 409 'datas' dela), não entram nesta recusa
  assert.equal(casaFechadaNoPedido([{ id: 'c1', c: conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(), AGORA) }], ['c1']), false);
});

/* ------------------------------------------------------------------ */
/* Achado 2 (baixo): o "Pagar de novo" refaz a conta só no pedido vencido */

/** O pedido de sábado 12/12 a segunda 14/12, feito quando a sexta 11/12 era de outro cliente: a regra do fim de semana passava. */
function pedidoDoFimDeSemana() {
  const c = conferirCasa(escolha('2026-12-12', '2026-12-14'), contexto([SEXTA_DE_OUTRO]), AGORA);
  assert.ok(c.ok, 'com a sexta ocupada, sábado a segunda passa');
  return {
    casa: { slug: FERRADURA.slug },
    data: '2026-12-12',
    saida: '2026-12-14',
    hospedes: 10,
    totalCentavos: c.totalCentavos,
    totalPixCentavos: c.totalPixCentavos,
    sinalCentavos: c.sinalCentavos,
    sinalPixCentavos: c.sinalPixCentavos,
  };
}

test('achado 2: no "Pagar de novo", a sexta que ficou livre não cancela o pedido (a regra do fim de semana muda com as noites dos outros)', () => {
  const pedido = pedidoDoFimDeSemana();
  // a trava do outro cliente venceu: um pedido novo de sábado a segunda não passaria mais, mas este já existia
  assert.equal(conferirCasa(escolha('2026-12-12', '2026-12-14'), contexto(), AGORA).ok, false);
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto(), AGORA), { ok: true });
  // o mínimo de noites que subiu depois do pedido também não cancela: o pedido já o cumpria
  const minimoMaior = { ...FERRADURA, minimoNoites: 3 };
  const doisDias = { ...pedido, data: '2026-12-14', saida: '2026-12-16' };
  const c = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(), AGORA);
  assert.ok(c.ok);
  const pedidoDeSemana = { ...doisDias, totalCentavos: c.totalCentavos, totalPixCentavos: c.totalPixCentavos };
  assert.deepEqual(conferirOPagarDeNovo(pedidoDeSemana, contexto([], { casa: minimoMaior }), AGORA), { ok: true });
});

test('achado 2: no "Pagar de novo", a conta igual ou menor segue (o cliente paga o que aceitou); mais cara, ou um pacote novo, "mudou"', () => {
  const c = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(), AGORA);
  assert.ok(c.ok);
  const pedido = {
    casa: { slug: FERRADURA.slug },
    data: '2026-12-14',
    saida: '2026-12-16',
    hospedes: 10,
    totalCentavos: c.totalCentavos,
    totalPixCentavos: c.totalPixCentavos,
  };
  // a diária BAIXOU de R$ 1.000 para R$ 900 depois do pedido: antes, o pedido era cancelado no meio do pagamento
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto([], { casa: { ...FERRADURA, diaria: 900 } }), AGORA), { ok: true });
  // a diária subiu: 'mudou' (a rota cancela e manda escolher de novo na página da casa), como antes
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto([], { casa: { ...FERRADURA, diaria: 1100 } }), AGORA), {
    ok: false,
    erro: 'mudou',
  });
  // um pacote novo cadastrado em cima das noites, pela metade: 'mudou' (o pacote é vendido inteiro)
  const comPacote = {
    ...FERRADURA,
    pacotes: [
      ...FERRADURA.pacotes,
      {
        nome: { pt: 'Pacote Teste', es: 'Paquete Teste', en: 'Test Package' },
        entrada: '2026-12-15',
        saida: '2026-12-18',
        diariaCentavos: 100000,
      },
    ],
  };
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto([], { casa: comPacote }), AGORA), { ok: false, erro: 'mudou' });
  // a noite tomada por outra pessoa: 'datas'; a reserva das casas fechada: 'casa-fechada' (nada é cancelado)
  assert.deepEqual(
    conferirOPagarDeNovo(pedido, contexto([{ casaId: FERRADURA.id, inicio: '2026-12-15', fim: '2026-12-16', itemPedidoId: 'x' }]), AGORA),
    { ok: false, erro: 'datas' },
  );
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto([], { aberta: false }), AGORA), { ok: false, erro: 'casa-fechada' });
});

/* ------------------------------------------------------------------ */
/* Achado 6 (baixo): toda recusa que depende das noites leva as noites de agora */

test('achado 6: as recusas pelas noites (fim de semana, pacote, mínimo, ocupada) levam as noites ocupadas de agora', () => {
  // a página guardada ainda risca a sexta 11/12, mas a trava do outro cliente venceu: o servidor recusa sábado a segunda pelo
  // fim de semana, e as noites de agora (sem a sexta) vão junto, para o calendário da página se atualizar
  const outraNoite: BloqueioLido = { casaId: FERRADURA.id, inicio: '2026-12-20', fim: '2026-12-21', itemPedidoId: 'outro' };
  const fimDeSemana = conferirCasa(escolha('2026-12-12', '2026-12-14'), contexto([outraNoite]), AGORA);
  assert.deepEqual(fimDeSemana, { ok: false, erro: 'fim-de-semana', ocupadas: ['2026-12-20'] });
  assert.ok(!fimDeSemana.ok && !fimDeSemana.ocupadas?.includes('2026-12-11'), 'a sexta livre sai do calendário');
  for (const [de, ate, motivo] of [
    ['2026-12-24', '2026-12-26', 'pacote'],
    ['2026-12-14', '2026-12-15', 'minimo'],
  ] as const) {
    assert.deepEqual(conferirCasa(escolha(de, ate), contexto([outraNoite]), AGORA), { ok: false, erro: motivo, ocupadas: ['2026-12-20'] });
  }
  // as recusas que não dependem das noites não levam nada
  assert.deepEqual(conferirCasa(escolha('2026-12-16', '2026-12-14'), contexto([outraNoite]), AGORA), { ok: false, erro: 'datas' });
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-16', 13), contexto([outraNoite]), AGORA), { ok: false, erro: 'hospedes' });
});

/* ------------------------------------------------------------------ */
/* Os textos novos                                                     */

test('os textos novos da revisão existem nos quatro idiomas, sem marcador sobrando, com o "vos" só no es-ar', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    for (const [nome, frase] of Object.entries({
      'carrinho.casaFechada': d.carrinho.casaFechada,
      'carrinho.casaJaNoCarrinho': d.carrinho.casaJaNoCarrinho,
      'carrinho.casaLimite': d.carrinho.casaLimite,
      'checkout.casaFechadaSo': d.checkout.casaFechadaSo,
      'checkout.casaFechadaComOutros': d.checkout.casaFechadaComOutros,
    })) {
      assert.ok(frase.trim().length > 0, `${idioma} ${nome}`);
      // (o número da empresa fica de fora de toda frase nova: tests/sem-cnpj.test.ts confere o site inteiro)
      assert.doesNotMatch(frase, /\{\w+\}|\busted(es)?\b/i, `${idioma} ${nome}`);
    }
    // só o total no cartão: com o marcador do cartão e sem o do Pix
    assert.ok(d.carrinho.casaTotalDaEstadiaCartao.includes('{cartao}'), idioma);
    assert.ok(!d.carrinho.casaTotalDaEstadiaCartao.includes('{pix}'), idioma);
    // o "Mudar" da frase da casa já no carrinho é o mesmo nome do link do carrinho
    assert.ok(d.carrinho.casaJaNoCarrinho.includes(d.carrinho.mudar), idioma);
  }
  const ar = dicionario('es-ar');
  const es = dicionario('es');
  assert.match(ar.carrinho.casaJaNoCarrinho, /tocá Cambiar/);
  assert.match(es.carrinho.casaJaNoCarrinho, /toca Cambiar/);
  assert.match(ar.checkout.casaFechadaComOutros, /sacá la casa/);
  assert.match(es.checkout.casaFechadaComOutros, /saca la casa/);
  assert.match(ar.carrinho.casaLimite, /Intentá .* escribinos/);
  assert.match(es.carrinho.casaLimite, /Intenta .* escríbenos/);
  // o tempo de espera do teto por conexão está na frase
  assert.match(dicionario('pt').carrinho.casaLimite, /1 hora/);
  assert.match(dicionario('en').carrinho.casaLimite, /1 hour/);
});

/* ------------------------------------------------------------------ */
/* O que só dá para ver no código (as rotas e as telas usam o "@/")     */

/** O código de um arquivo, sem as linhas de comentário. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join(...partes), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .join('\n');

/** Sem espaços nem vírgulas finais: o mesmo trecho, quebrado ou não em várias linhas pelo formatador, compara igual. */
const semEspaco = (s: string) => s.replace(/\s+/g, '').replace(/,([)\]}])/g, '$1');
const tem = (fonte: string, trecho: string) => assert.ok(semEspaco(fonte).includes(semEspaco(trecho)), trecho);
const naoTem = (fonte: string, trecho: string) => assert.ok(!semEspaco(fonte).includes(semEspaco(trecho)), trecho);
const onde = (fonte: string, trecho: string) => semEspaco(fonte).indexOf(semEspaco(trecho));

test('achado 1, no código: a casa fechada aparece com o motivo, sem o "Mudar", e não deixa enviar até sair pelo X', () => {
  const carrinho = codigo('src', 'lib', 'carrinho-servidor.ts');
  tem(carrinho, "const casa = 'casa' in c ? c.casa : indisponivel ? contexto.casas.get(e.slug)?.casa : undefined;");
  tem(
    carrinho,
    'if (indisponivel) return { ...comum, detalhes: linhas.slice(0, 2), totalCentavos: 0, totalPixCentavos: 0, escolha: e, indisponivel };',
  );
  const lista = codigo('src', 'components', 'carrinho', 'ListaCarrinho.tsx');
  tem(lista, "{i.indisponivel === 'fechada' ? T.casaFechada : T.casaIndisponivel}");
  tem(lista, "{i.indisponivel === 'ocupada' && (");
  const formulario = codigo('src', 'components', 'carrinho', 'FormularioCarrinho.tsx');
  tem(formulario, "const casaFechada = itens.find((i) => i.indisponivel === 'fechada');");
  tem(formulario, 'const fraseDaCasaFechada = soCasa ? C.casaFechadaSo : C.casaFechadaComOutros;');
  tem(formulario, 'if (casaFechada) { setErroGeral(fraseDaCasaFechada); return; }');
  // o 403 'casa-fechada' relê o carrinho e diz como seguir (antes: "um item mudou", e o mesmo 403 a cada envio)
  const recusa = formulario.slice(formulario.indexOf("} else if (corpo.erro === 'casa-fechada') {"));
  assert.ok(onde(recusa, 'await recarregar(); setErroGeral(fraseDaCasaFechada);') > 0);
  // o pedido: só a casa que a tela via como reservável recusa
  const pedido = codigo('src', 'app', 'api', 'pedido', 'route.ts');
  tem(pedido, "if (casaFechadaNoPedido(todas, e.ids)) return erro('casa-fechada', 403);");
  naoTem(pedido, "c.erro === 'casa-fechada')) return erro('casa-fechada', 403)");
});

test('achado 2, no código: o "Pagar de novo" refaz a conta só no pedido vencido; a troca de forma só confere a reserva aberta', () => {
  const pagar = codigo('src', 'app', 'api', 'pedido', '[codigo]', 'pagar', 'route.ts');
  tem(
    pagar,
    "pedido.status === 'expirado' ? await conferirAsCasas(vouchers, admin, agora) : (await casasAbertasPara({ admin }).catch(() => false)) ? null : erro('casa-fechada', 403);",
  );
  assert.equal(pagar.match(/conferirAsCasas\(/g)?.length, 2, 'a definição e a chamada do pedido vencido');
});

test('achado 3, no código: o erro do banco solta só o que a sessão nova prendeu, e o pedido fechado no meio solta ou passa as datas', () => {
  const fonte = codigo('src', 'app', 'api', 'pedido', 'pedido-stripe.ts');
  const inicio = fonte.indexOf('export async function abrirSessaoDoPedido(');
  const corpo = fonte.slice(inicio, fonte.indexOf('\n}\n', inicio));
  // o caminho do erro do banco: pelo item só quando este toque fechou o pedido (cancelado, ou vencido com a sessão dele);
  // com outra sessão como a corrente (o outro "Pagar"), só pela referência da sessão nova, e a trava do outro fica
  const banco = corpo.slice(corpo.indexOf("if (seATravaFalhar === 'cancelar') {"), corpo.indexOf('throw new DatasNaoPresas(codigo);'));
  tem(banco, "fechouOPedido = cancelado?.status === 'cancelado';");
  tem(banco, 'fechouOPedido = await voltarAVencido(codigo, sessao.id).catch(');
  tem(banco, 'await (fechouOPedido ? liberarDatasDosVouchers(vouchers) : liberarBloqueiosDaSessao(sessao.id)).catch(');
  naoTem(banco, 'await liberarDatasDosVouchers(vouchers).catch(');
  // voltarAVencido diz se foi ela que pôs o pedido em vencido (só com a sessão nova como a corrente)
  tem(fonte, 'async function voltarAVencido(codigo: string, sessaoId: string): Promise<boolean> {');
  tem(fonte, "if (x.pagamentoExternoId !== sessaoId || x.status !== 'pendente') return null; x.status = 'expirado'; voltou = true;");
  // depois de prender: o pedido relido que não aceita mais sessão (cancelado ou pago no meio) não fica com a sessão nova
  const depois = corpo.slice(corpo.indexOf('throw new DatasNaoPresas(codigo);'));
  const posicoes = [
    onde(depois, 'const atual = await obterReservaDoPedido(codigo).catch(() => null);'),
    onde(depois, 'if (atual && !podeAbrirSessao(atual.status)) {'),
    onde(depois, "if (atual.status === 'cancelado') { await liberarBloqueiosDaSessao(sessao.id).catch("),
    onde(
      depois,
      '} else if (atual.pagamentoExternoId && atual.pagamentoExternoId !== sessao.id) { await acertarDatasParaASessao(vouchers, atual.pagamentoExternoId).catch(',
    ),
    onde(depois, 'await fecharNova(); throw new PedidoFechado(atual.status);'),
    onde(depois, 'return { codigo, sessaoId: sessao.id, clientSecret: sessao.client_secret, forma };'),
  ];
  assert.ok(
    posicoes.every((p, i) => p > 0 && (i === 0 || posicoes[i - 1] < p)),
    posicoes.join(' '),
  );
});

test('achados 5, 7 e 8, no código: a leitura do pedido anterior dentro do catch; o teto por IP só no primeiro pedido do carrinho, depois da proteção', () => {
  const pedido = codigo('src', 'app', 'api', 'pedido', 'route.ts');
  // achado 5: a leitura dos vouchers do anterior não vira erro para o cliente, e só com casa (o passeio não lê nada a mais)
  tem(pedido, "if (cancelado?.status === 'cancelado' && (temCasa || cancelado.pagamento.cobrar)) {");
  tem(pedido, 'const soltas = await vouchersDoPedido(anterior.codigo).then(liberarDatasDosVouchers).catch((err) => {');
  naoTem(pedido, 'liberarDatasDosVouchers(await vouchersDoPedido(anterior.codigo))');
  // achado 8: o pedido de casa esperando com o e-mail só é conferido depois da proteção contra robôs
  const robo = onde(pedido, "const robo = await barrarRobo('POST /api/pedido');");
  const esperando = onde(
    pedido,
    "if (await pedidoDeCasaEsperando(dados.cliente.email, carrinho.pedido?.codigo)) return erro('casa-esperando', 409);",
  );
  // achado 7: o teto conta só o primeiro pedido de cada carrinho, e responde com o erro próprio da casa
  const teto = onde(pedido, 'const primeiroDoCarrinho = !carrinho.pedido;');
  const limite = onde(
    pedido,
    "if (primeiroDoCarrinho && !(await permitir(chaveDoLimite('pedido-casa', ip), PEDIDOS_DE_CASA_POR_IP, JANELA_DA_CASA_SEGUNDOS, agora))) return erro('limite-casa', 429);",
  );
  const cria = onde(pedido, 'const pedido = await criarPedido(novas);');
  assert.ok(
    robo > 0 && robo < esperando && esperando < teto && teto < limite && limite < cria,
    `${robo} ${esperando} ${teto} ${limite} ${cria}`,
  );
  // o checkout: a frase própria do 429 da casa, com o tempo de espera
  tem(
    codigo('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'),
    "} else if (corpo.erro === 'limite-casa') { setErroGeral(K.casaLimite);",
  );
});

test('achados 9 e 10, no código: o total da estadia só no cartão sem o Pix; a mesma casa já no carrinho tem a recusa própria', () => {
  const lista = codigo('src', 'components', 'carrinho', 'ListaCarrinho.tsx');
  tem(
    lista,
    'soCartao ? fmt(T.casaTotalDaEstadiaCartao, { cartao: brl(i.totalCentavos) }) : fmt(T.casaTotalDaEstadia, { pix: brl(i.totalPixCentavos), cartao: brl(i.totalCentavos) })',
  );
  const pedido = codigo('src', 'app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  tem(
    pedido,
    '{pixNaFaixa ? fmt(d.carrinho.casaTotalDaEstadia, { pix: brl(r.casa.totalPixCentavos), cartao: brl(r.casa.totalCentavos) }) : fmt(d.carrinho.casaTotalDaEstadiaCartao, { cartao: brl(r.casa.totalCentavos) })}',
  );
  // a mesma casa com noites que se cruzam, sem o "Mudar": 'ja-no-carrinho', e não a noite ocupada que não existe
  const carrinho = codigo('src', 'app', 'api', 'carrinho', 'route.ts');
  tem(carrinho, "return falha('ja-no-carrinho', 400);");
  naoTem(carrinho, "return falha('ocupada', 400);");
  const quadro = codigo('src', 'components', 'casas', 'ReservaCasa.tsx');
  tem(quadro, "erro === 'ja-no-carrinho' ? T.jaNoCarrinho");
  tem(codigo('src', 'app', '[locale]', 'casas-de-temporada', '[slug]', 'page.tsx'), 'jaNoCarrinho: d.carrinho.casaJaNoCarrinho,');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AVISO_DESISTENCIA,
  DESISTENCIA_RESPONDIDA,
  INICIO_DESISTENCIA_RESPONDIDA,
  MOTIVO_MAXIMO,
  avisoDasDesistencias,
  dentroDoArrependimento,
  desistenciaParaResponder,
  desistenciaPedida,
  desistenciaRespondida,
  estadoDaDesistencia,
  limparMotivo,
  linhaDaDesistencia,
  linhaDaDesistenciaRespondida,
  podeDesistir,
  prazoDoArrependimento,
  rotuloDaDesistenciaRespondida,
} from '../src/lib/desistencia.ts';
import { IDIOMAS } from '../src/i18n/config.ts';
import { dicionario } from '../src/i18n/index.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { agruparPedidos, avisoAberto, ehAviso } from '../src/lib/pedidos-painel.ts';
import type { Reserva, ReservaPasseio, ReservaTransfer } from '../src/lib/reservas.ts';

// A desistência pela mesma ferramenta da compra (Decreto 7.962/2013, art. 5º, § 1º): o link "Desistir da compra" na
// página do pedido pago, o pedido de desistência como aviso no histórico e nenhum reembolso automático. Só as regras
// (sem rede nem banco) e, lendo o código da rota, as travas que não podem se perder.

// Búzios fica 3 horas atrás de UTC: 15h UTC = meio-dia em Búzios, no dia 9 de novembro de 2026
const AGORA = new Date('2026-11-09T15:00:00Z');

/** Um voucher de exemplo (nenhum é de cliente), pago pela Stripe, com o resto por cima. */
function voucher(parcial: Partial<ReservaPasseio> = {}): ReservaPasseio {
  return {
    codigo: 'ON-ABC123',
    token: 'token-de-teste',
    criadaEm: '2026-11-08T12:00:00Z',
    atualizadaEm: '2026-11-08T12:00:00Z',
    idioma: 'pt',
    status: 'pago',
    provedor: 'stripe',
    tipo: 'passeio',
    data: '2026-11-14',
    horario: { hora: '09:00', busca: false },
    totalCentavos: 15400,
    cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
    pagamento: { metodo: 'cartao' },
    historico: [{ em: '2026-11-08T12:00:00Z', evento: 'Pago (webhook)' }],
    passeio: { slug: 'escuna-buzios', nome: 'Escuna', cidade: 'Búzios', unidade: 'pessoa' },
    adultos: 2,
    criancas: 0,
    unidades: 2,
    hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
    ...parcial,
  } as ReservaPasseio;
}

const transferDe = (data: string, hora: string): ReservaTransfer =>
  ({
    ...voucher({ codigo: 'ON-DEF456' }),
    tipo: 'transfer',
    data,
    transfer: {
      veiculo: 'carro',
      ida: { saida: { lugar: 'gig' }, destino: { lugar: 'buzios' }, data, hora, precoCentavos: 80000 },
      passageiros: 2,
      malas: { grandes: 1, pequenas: 0 },
      cadeirinhas: [],
    },
  }) as unknown as ReservaTransfer;

test('o link aparece no pedido pago pela Stripe, enquanto o primeiro serviço não começou', () => {
  assert.equal(podeDesistir([voucher()], AGORA), true);
  assert.equal(estadoDaDesistencia([voucher()], AGORA), 'disponivel');
  // o passeio de hoje às 12h01 ainda não começou (meio-dia em Búzios); o das 12h, sim
  assert.equal(podeDesistir([voucher({ data: '2026-11-09', horario: { hora: '12:01', busca: false } })], AGORA), true);
  assert.equal(podeDesistir([voucher({ data: '2026-11-09', horario: { hora: '12:00', busca: false } })], AGORA), false);
  // num pedido com vários itens, vale o que começa primeiro: o transfer de hoje às 11h já saiu
  const pedido: Reserva[] = [voucher(), transferDe('2026-11-09', '11:00')];
  assert.equal(podeDesistir(pedido, AGORA), false);
  assert.equal(podeDesistir([voucher(), transferDe('2026-11-10', '11:00')], AGORA), true);
});

test('fora do pago pela Stripe, nada: pendente, reembolsado, contestado, pelo WhatsApp ou da Pagar.me', () => {
  for (const status of ['pendente', 'expirado', 'cancelado', 'reembolsado', 'contestado', 'aguardando_whatsapp', 'recusado'] as const)
    assert.equal(podeDesistir([voucher({ status })], AGORA), false, status);
  // o pedido do WhatsApp que a equipe marcou como pago nunca passou pela "ferramenta da compra" do site
  assert.equal(podeDesistir([voucher({ provedor: 'whatsapp', pagamento: { metodo: 'whatsapp' } })], AGORA), false);
  assert.equal(podeDesistir([voucher({ provedor: 'pagarme' })], AGORA), false);
  assert.equal(podeDesistir([], AGORA), false);
  assert.equal(estadoDaDesistencia([voucher({ status: 'reembolsado' })], AGORA), null);
});

test('os itens cancelados ou reembolsados sozinhos não contam no "primeiro serviço"', () => {
  const passou = transferDe('2026-11-09', '11:00');
  passou.statusItem = 'reembolsado';
  assert.equal(podeDesistir([voucher(), passou], AGORA), true);
  // com todos os itens devolvidos, nada a desistir
  const tudo = voucher({ statusItem: 'cancelado' });
  assert.equal(podeDesistir([tudo], AGORA), false);
});

test('a linha do histórico é um aviso (o painel destaca), com o que a equipe faz e, no fim, o motivo entre « »', () => {
  const sem = linhaDaDesistencia();
  assert.ok(sem.startsWith(AVISO_DESISTENCIA));
  assert.equal(ehAviso(sem), true);
  assert.match(
    sem,
    /: responder ao cliente por e-mail em até 1 dia útil e reembolsar conforme a política de cancelamento, só pela forma original do pagamento$/,
  );
  assert.equal(sem.includes('Motivo'), false);
  const com = linhaDaDesistencia('  Mudei os planos\n\nda viagem  ');
  assert.ok(com.startsWith(`${AVISO_DESISTENCIA}: responder`), com);
  assert.ok(com.endsWith('. Motivo escrito pelo cliente: «Mudei os planos da viagem»'), com);
  assert.equal(ehAviso(com), true);
  // o motivo vazio ou só de espaços não entra
  assert.equal(linhaDaDesistencia('   '), sem);
  // cortado no máximo
  assert.equal(limparMotivo('a'.repeat(MOTIVO_MAXIMO + 50)).length, MOTIVO_MAXIMO);
  assert.equal(MOTIVO_MAXIMO, 500);
});

test('o motivo do cliente nunca forja um aviso nem fecha o trecho dele', () => {
  // o que a revisão mandou de verdade: aspas para fechar o trecho e um "Aviso:" que parecia nota da equipe
  const ataque =
    'Nao vou mais <script>alert(1)</script>\n"); Aviso: reembolso ja feito pela equipe, nao responder. Devolver por Pix para a chave terceiro@example.com («x»)';
  const limpo = limparMotivo(ataque);
  assert.doesNotMatch(limpo, /aviso\s*:/i, 'sem "Aviso:"');
  assert.doesNotMatch(limpo, /[«»"“”]/, 'sem aspas nem « » que fechem o trecho');
  assert.doesNotMatch(limpo, /\n/);
  const linha = linhaDaDesistencia(ataque);
  // um só "Aviso:" (o do começo) e um só trecho do cliente, no fim
  assert.equal(linha.match(/aviso\s*:/gi)?.length, 1, linha);
  assert.equal(linha.match(/«/g)?.length, 1);
  assert.equal(linha.match(/»/g)?.length, 1);
  assert.ok(linha.endsWith('»'));
  assert.ok(linha.indexOf('responder ao cliente') < linha.indexOf('Motivo escrito pelo cliente'), 'a regra da equipe vem antes');
  // os caracteres de controle e as quebras de linha viram espaço
  assert.equal(limparMotivo('a\u0000b\tc\r\nd'), 'a b c d');
});

test('o prazo dos 7 dias do arrependimento, contado da compra, vai na linha do histórico para a equipe', () => {
  const compra = '2026-11-02T13:00:00Z';
  assert.equal(dentroDoArrependimento(compra, new Date('2026-11-09T12:59:00Z')), true);
  assert.equal(dentroDoArrependimento(compra, new Date('2026-11-09T13:00:00Z')), true);
  assert.equal(dentroDoArrependimento(compra, new Date('2026-11-09T13:01:00Z')), false);
  assert.equal(dentroDoArrependimento(undefined, AGORA), null);
  assert.equal(dentroDoArrependimento('data ruim', AGORA), null);
  assert.match(
    prazoDoArrependimento(compra, new Date('2026-11-05T12:00:00Z')),
    /^dentro dos 7 dias do arrependimento \(compra em 02\/11\/2026, 10:00\): reembolso integral$/,
  );
  assert.match(prazoDoArrependimento(compra, new Date('2026-11-20T12:00:00Z')), /^fora dos 7 dias .+ vale a política de cancelamento$/);
  assert.match(prazoDoArrependimento(undefined, AGORA), /conferir/);
  const linha = linhaDaDesistencia('motivo', { compraEm: compra, agora: new Date('2026-11-05T12:00:00Z') });
  assert.ok(
    linha.startsWith(`${AVISO_DESISTENCIA} (dentro dos 7 dias do arrependimento (compra em 02/11/2026, 10:00): reembolso integral): `),
    linha,
  );
});

test('a faixa do painel: pedido pago com o pedido de desistência, algum voucher pago e sem a marca de respondido', () => {
  const comAviso = (mudar: Partial<ReservaPasseio> = {}) =>
    voucher({ historico: [{ em: '2026-11-09T14:00:00Z', evento: linhaDaDesistencia('motivo') }], ...mudar });
  assert.equal(desistenciaParaResponder([comAviso()]), true);
  // sem o pedido de desistência, nada
  assert.equal(desistenciaParaResponder([voucher()]), false);
  // o pedido inteiro reembolsado: o status deixa de ser pago e o pedido sai da faixa sozinho
  assert.equal(desistenciaParaResponder([comAviso({ status: 'reembolsado' })]), false);
  // o reembolso de uma parte do pedido NÃO é a resposta: até 16/11 qualquer centavo devolvido tirava o pedido da faixa,
  // com o cliente ainda esperando (A6b do teste de 15/11)
  assert.equal(desistenciaParaResponder([comAviso({ reembolsoCentavos: 5000 })]), true);
  // respondido sem reembolso (a política não devolve): a marca do painel tira da faixa
  const respondido = comAviso();
  respondido.historico.push({ em: '2026-11-09T15:00:00Z', evento: DESISTENCIA_RESPONDIDA });
  assert.equal(desistenciaParaResponder([respondido]), false);
  // sem voucher nenhum, nada
  assert.equal(desistenciaParaResponder([]), false);
  // a linha de "respondido" não é um aviso (não fica destacada)
  assert.equal(ehAviso(DESISTENCIA_RESPONDIDA), false);
  assert.equal(avisoDasDesistencias(1), '1 pedido de desistência para responder');
  assert.equal(avisoDasDesistencias(3), '3 pedidos de desistência para responder');
});

test('a faixa do painel num pedido de dois itens (A6b): o voucher devolvido antes ou depois da desistência não tira da faixa', () => {
  // os valores do ON-YTMC29 do teste de 15/11 (nenhum dado de cliente): R$ 138,60 devolvidos de um voucher e R$ 217,80
  // do outro ainda pagos
  const pago = { em: '2026-11-08T12:00:00Z', evento: 'Pago (webhook da Stripe)' };
  const devolvido = { em: '2026-11-09T13:00:00Z', evento: `Item ON-AAA234 reembolsado: ${formatarCifra(13860, 'pt-BR')}` };
  const desistiu = { em: '2026-11-09T14:00:00Z', evento: linhaDaDesistencia('motivo') };
  const dois = (
    historico: Reserva['historico'],
    statusItens: [Reserva['statusItem'], Reserva['statusItem']],
    comum: Partial<ReservaPasseio> = {},
  ) => {
    const pedido = { codigo: 'ON-PED234', totalCentavos: 35640 };
    const item = (codigo: string, data: string, totalCentavos: number, statusItem: Reserva['statusItem']) =>
      voucher({
        codigo,
        data,
        totalCentavos,
        pedido,
        historico,
        reembolsoCentavos: 13860,
        ...comum,
        ...(statusItem ? { statusItem } : {}),
      });
    return [item('ON-AAA234', '2026-11-14', 13860, statusItens[0]), item('ON-BBB234', '2026-11-15', 21780, statusItens[1])];
  };
  // devolvido ANTES do pedido de desistência (o achado do teste): entra na faixa
  assert.equal(desistenciaParaResponder(dois([pago, devolvido, desistiu], ['reembolsado', undefined])), true);
  // devolvido DEPOIS: continua na faixa, porque o outro voucher ainda espera a resposta
  assert.equal(desistenciaParaResponder(dois([pago, desistiu, devolvido], ['reembolsado', undefined])), true);
  // o voucher usado continua pago: o pedido espera a resposta até alguém marcar
  assert.equal(desistenciaParaResponder(dois([pago, desistiu, devolvido], ['reembolsado', 'usado'])), true);
  // os dois devolvidos (ou um devolvido e o outro cancelado), com o pedido ainda pago: não sobra voucher pago
  assert.equal(desistenciaParaResponder(dois([pago, desistiu, devolvido], ['reembolsado', 'reembolsado'])), false);
  assert.equal(desistenciaParaResponder(dois([pago, desistiu, devolvido], ['reembolsado', 'cancelado'])), false);
  // o pedido reembolsado inteiro sai sozinho
  assert.equal(desistenciaParaResponder(dois([pago, desistiu, devolvido], [undefined, undefined], { status: 'reembolsado' })), false);
  // a marca de respondido tira da faixa: a de sempre e a nova, com o valor
  for (const resposta of [DESISTENCIA_RESPONDIDA, linhaDaDesistenciaRespondida(13860)]) {
    const marcado = dois([pago, devolvido, desistiu, { em: '2026-11-09T15:00:00Z', evento: resposta }], ['reembolsado', undefined]);
    assert.equal(desistenciaParaResponder(marcado), false, resposta);
  }
  // como o painel agrupa (os vouchers na ordem da viagem, o primeiro representa o pedido): a mesma resposta
  const [p] = agruparPedidos(dois([pago, devolvido, desistiu], ['reembolsado', undefined]));
  assert.equal(p.itens.length, 2);
  assert.equal(desistenciaParaResponder(p.itens), true);
});

test('a resposta da desistência no painel: a linha e o botão dizem quando o resto do pedido segue pago', () => {
  // sem reembolso: a linha e o botão de sempre
  assert.equal(linhaDaDesistenciaRespondida(0), DESISTENCIA_RESPONDIDA);
  assert.equal(DESISTENCIA_RESPONDIDA, 'Desistência respondida pela equipe, sem reembolso pelo site');
  assert.equal(rotuloDaDesistenciaRespondida(0), 'Desistência respondida, sem reembolso');
  // com uma parte já reembolsada: o valor, com centavos, e o resto do pedido seguindo pago
  const linha = linhaDaDesistenciaRespondida(13860);
  assert.equal(linha, `Desistência respondida pela equipe: ${formatarCifra(13860, 'pt-BR')} reembolsados, o resto do pedido segue pago`);
  assert.match(linha, /R\$\s138,60 reembolsados/);
  assert.equal(rotuloDaDesistenciaRespondida(13860), 'Desistência respondida (o resto do pedido segue pago)');
  // as duas linhas começam igual (as já gravadas continuam valendo), nenhuma é aviso, e as duas marcam a resposta
  assert.equal(INICIO_DESISTENCIA_RESPONDIDA, 'Desistência respondida pela equipe');
  for (const resposta of [DESISTENCIA_RESPONDIDA, linha]) {
    assert.ok(resposta.startsWith(INICIO_DESISTENCIA_RESPONDIDA), resposta);
    assert.equal(ehAviso(resposta), false, resposta);
    assert.equal(avisoAberto([{ evento: resposta }], 0), false, resposta);
    assert.equal(desistenciaRespondida({ historico: [{ em: '2026-11-09T15:00:00Z', evento: resposta }] }), true, resposta);
  }
  // uma linha que só cita a resposta no meio não conta
  assert.equal(desistenciaRespondida({ historico: [{ em: '', evento: `Pago. ${DESISTENCIA_RESPONDIDA}` }] }), false);
});

test('um pedido de desistência só: depois da linha, a página mostra que já chegou', () => {
  const pedido = voucher({ historico: [{ em: '2026-11-09T14:00:00Z', evento: linhaDaDesistencia('motivo') }] });
  assert.equal(desistenciaPedida(pedido), true);
  assert.equal(estadoDaDesistencia([pedido], AGORA), 'pedida');
  assert.equal(desistenciaPedida(voucher()), false);
  // uma linha que só cita a desistência no meio não conta
  assert.equal(desistenciaPedida(voucher({ historico: [{ em: '', evento: 'Pago. Aviso: pedido de desistência pelo site' }] })), false);
});

/** O código de um arquivo de src/, sem as linhas de comentário (e sem o \r dos arquivos gravados com CRLF). */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

test('o painel e a rota do painel usam a mesma regra da faixa, com os vouchers do pedido, e a linha nova com o valor', () => {
  const pagina = codigo('app', 'admin', 'page.tsx');
  // as quatro chamadas do painel (o filtro "Desistências", o botão, a frase vermelha e a faixa do topo) passam os
  // vouchers do pedido, nunca um voucher só
  assert.equal(pagina.match(/desistenciaParaResponder\(/g)?.length, 4);
  assert.equal(pagina.match(/desistenciaParaResponder\(p\.itens\)/g)?.length, 4);
  // o botão diz quando o resto do pedido segue pago
  assert.match(pagina, /acao: 'desistencia_respondida',\s*rotulo: rotuloDaDesistenciaRespondida\(p\.reembolsoCentavos\)/);
  assert.doesNotMatch(pagina, /rotulo: 'Desistência respondida, sem reembolso'/);
  // a rota: a mesma regra, com os vouchers do pedido; a linha gravada dentro da trava, com o valor relido nela, uma vez
  const rota = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  assert.match(rota, /if \(!desistenciaParaResponder\(vouchers\)\) return voltar\('acao-nao-vale'\);/);
  // desde o Pacote 33, com a trava dos 7 dias: a caixa "Estou ciente" antes da gravação e, dentro da trava (relida), a
  // linha da trava junto da linha da resposta
  assert.match(
    rota,
    /if \(travaDaDesistencia\(alvo\) && !ciente\) return voltar\('falta-ciente'\);\s+await atualizarReserva\(alvo\.codigo, \(r\) => \{\s+if \(desistenciaRespondida\(r\)\) return null;\s+registrar\(r, linhaDaDesistenciaRespondida\(r\.reembolsoCentavos \?\? 0\)\);\s+const trava = travaDaDesistencia\(r\);\s+return trava \? registrar\(r, linhaDaTravaDosSeteDias\(trava, 'desistencia'\)\) : r;\s+\}\);/,
  );
  assert.doesNotMatch(rota, /registrar\(r, DESISTENCIA_RESPONDIDA\)/);
});

test('a rota: limite por IP, token do link privado, a regra de cima, a gravação com a trava e nenhum reembolso', () => {
  const rota = codigo('app', 'api', 'pedido', '[codigo]', 'desistir', 'route.ts');
  const limite = rota.search(
    /if \(!\(await permitir\(chaveDoLimite\('desistir', ipDaRequisicao\(req\.headers\)\), LIMITE_POR_IP, JANELA_SEGUNDOS, agora\)\)\)\s+return erro\('limite', 429\);/,
  );
  const token = rota.search(/if \(!pedido \|\| !tokenConfere\(pedido, r\.data\.t\)\) return erro\('nao-encontrado', 404\);/);
  const repetido = rota.search(/if \(desistenciaPedida\(pedido\)\) return NextResponse\.json\(\{ ok: true, repetido: true \}/);
  const regra = rota.search(/if \(!podeDesistir\(vouchers, agora\)\) return erro\('status', 409\);/);
  const grava = rota.indexOf('atualizarReserva(');
  for (const [nome, onde] of Object.entries({ limite, token, repetido, regra, grava })) assert.notEqual(onde, -1, nome);
  // nessa ordem: o robô para no limite, o código sem token não aprende nada, e só então a gravação
  assert.ok(limite < token && token < repetido && repetido < regra && regra < grava);
  // a gravação confere de novo dentro da trava de versão (dois envios quase juntos gravam uma linha só)
  assert.match(rota, /atualizarReserva\(pedido\.codigo, \(atual\) => \{\s+if \(desistenciaPedida\(atual\)\) \{/);
  // nunca reembolsa nem fala com a Stripe: quem decide é a equipe
  assert.doesNotMatch(rota, /criarReembolso|refunds|stripe\(/i);
  // os dois e-mails (a confirmação ao cliente e o aviso à equipe) só na primeira vez, depois da gravação, com o motivo limpo
  assert.match(
    rota,
    /if \(!trava\.repetido\) \{[\s\S]*?agendarAvisosDaDesistencia\(codigoDoPedido, limparMotivo\(r\.data\.motivo\)\);\s+\}/,
  );
  assert.ok(rota.indexOf('agendarAvisosDaDesistencia(codigoDoPedido') > grava);
  // o prazo dos 7 dias vai na linha, contado da compra
  assert.match(rota, /linhaDaDesistencia\(r\.data\.motivo, \{ compraEm: pedido\.pagamento\.pagoEm \?\? pedido\.criadaEm, agora \}\)/);
});

test('na tela: o limite do motivo é o mesmo do servidor, e o link só existe no pedido pago, por estadoDaDesistencia', () => {
  const componente = readFileSync(path.join('src', 'components', 'pagamento', 'DesistirDaCompra.tsx'), 'utf8');
  assert.match(componente, new RegExp(`const MOTIVO_MAXIMO = ${MOTIVO_MAXIMO};`));
  // o componente do navegador não leva as regras do pagamento: só o tipo
  assert.match(componente, /import type \{ EstadoDesistencia \} from '@\/lib\/desistencia';/);
  for (const pagina of [path.join('[locale]', 'pedido', '[codigo]'), path.join('[locale]', 'reserva', '[codigo]')]) {
    assert.match(codigo('app', pagina, 'page.tsx'), /estadoDaDesistencia\(/, pagina);
  }
});

test('os textos da desistência existem nos quatro idiomas e prometem o que o servidor faz', () => {
  for (const idioma of IDIOMAS) {
    const P = dicionario(idioma).pedido;
    for (const t of [
      P.desistirLink,
      P.desistirTexto,
      P.desistirMotivo,
      P.desistirConfirmar,
      P.desistirPolitica,
      P.desistirRecebido,
      P.desistirRepetido,
    ])
      assert.ok(t.trim(), idioma);
    // a resposta em até 1 dia útil, o reembolso pela política e os 7 dias do arrependimento
    assert.match(P.desistirRecebido, /1/, idioma);
    assert.match(P.desistirTexto, /7/, idioma);
  }
  assert.equal(dicionario('pt').pedido.desistirLink, 'Desistir da compra');
});

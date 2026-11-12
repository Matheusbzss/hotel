import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// As rotas do Next e o arquivo das reservas não rodam em node puro (usam o atalho "@/" e módulos só do servidor).
// Estes testes leem o código deles e seguram quatro travas que não podem se perder numa mudança futura. O
// comportamento de ponta a ponta é conferido na simulação da Stripe, fora do npm test. Só leitura: nada é gravado.

/** O código de um arquivo de src/, sem as linhas de comentário. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

test('o PDF do voucher só sai para o voucher pago: o item cancelado ou reembolsado sozinho responde 409', () => {
  const rota = codigo('app', 'api', 'voucher', '[codigo]', 'route.ts');
  // a trava olha o status do VOUCHER (statusDoVoucher), não só o do pedido, e vem antes de gerar o PDF
  const trava = rota.search(/if \(statusDoVoucher\(reserva\) !== 'pago'\)\s+return new Response\(.+\{ status: 409 \}\);/);
  assert.notEqual(trava, -1);
  assert.ok(trava < rota.indexOf('gerarVoucherPdf(reserva'));
  assert.doesNotMatch(rota, /reserva\.status !== 'pago'/);
  // é a mesma função com que o site mostra o voucher ao cliente
  assert.match(rota, /import \{ statusDoVoucher, tokenConfere \} from '@\/lib\/reserva-publica';/);
  assert.match(codigo('lib', 'reserva-publica.ts'), /export function statusDoVoucher\(/);
});

test('no painel, a ação recusada volta para a página com o aviso (?erro=), nunca como JSON', () => {
  const rota = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  // nenhuma resposta em JSON nem código de erro: a recusa é a volta para /admin com ?erro=, que a página mostra
  assert.doesNotMatch(rota, /NextResponse\.json\(/);
  assert.doesNotMatch(rota, /status: [45]\d\d/);
  assert.match(rota, /volta\.searchParams\.set\('erro', erro\);\s+return NextResponse\.redirect\(volta, 303\);/);
  // cada recusa leva a sua frase: pedido não encontrado, sem pagamento na Stripe, status que não aceita o reembolso,
  // voucher de outro pedido, item já fechado, reembolso recusado pela Stripe, ação desconhecida, marcar pago num
  // pedido da Stripe, pedido já pago (cancelar) e status que não aceita a ação manual
  const avisos = rota.match(/return voltar\((['`]).+\1\);/g) ?? [];
  assert.ok(avisos.length >= 10, avisos.join('\n'));
  // a regra que não muda: num pedido da Stripe, marcar pago à mão é recusado antes da gravação do status
  const recusaPago = rota.search(/if \(daStripe\) \{\s+if \(manual\.status === 'pago'\)\s+return voltar\(/);
  assert.notEqual(recusaPago, -1);
  assert.ok(recusaPago < rota.lastIndexOf('atualizarReserva('));
});

test('sem o banco, toda gravação de um voucher leva o que é do pedido aos outros vouchers do pedido', () => {
  const reservas = codigo('lib', 'reservas.ts');
  // atualizarReserva: gravou, leva aos irmãos e só então devolve
  assert.match(
    reservas,
    /if \(await principal\(\)\.gravar\(nova, atual\.versao\)\) \{\s+await levarAosIrmaos\(nova\);\s+return nova;\s+\}/,
  );
  // só sem o banco (lá o pedido é uma linha só) e só em pedido com vários itens; a cópia em si é a função pura
  // copiarDoPedido, testada em tests/reservas-banco.test.ts
  assert.match(
    reservas,
    /async function levarAosIrmaos\(gravada: Reserva\): Promise<void> \{\s+if \(usarBanco\(\) \|\| !gravada\.pedido\) return;/,
  );
  assert.match(reservas, /copiarDoPedido\(atual\.reserva, gravada\)/);
});

test('o pedido de cotação tem o limite por IP antes de gravar, com a mesma resposta 429 das outras rotas', () => {
  const rota = codigo('app', 'api', 'cotacoes', 'route.ts');
  assert.match(rota, /import \{ chaveDoLimite, ipDaRequisicao, permitir \} from '@\/lib\/limite-ip';/);
  assert.match(rota, /const LIMITE_POR_IP = \d+;\s+const JANELA_SEGUNDOS = \d+;/);
  // a mesma chamada do pedido e do carrinho, com a chave da rota e o IP de quem chamou
  const trava = rota.search(
    /if \(!\(await permitir\(chaveDoLimite\('cotacao', ipDaRequisicao\(req\.headers\)\), LIMITE_POR_IP, JANELA_SEGUNDOS\)\)\)\s+return erro\('limite', 429\);/,
  );
  assert.notEqual(trava, -1);
  // vem antes de gravar: o envio barrado nunca chega ao painel
  assert.ok(trava < rota.indexOf('criarCotacao('));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';
import { fecharSessaoAnterior, type ChamadasDaStripe } from '../src/app/api/pedido/pedido-stripe.ts';
import { anteriorDepoisDeFechar, sessaoAnteriorDeVolta } from '../src/lib/pagamento-stripe.ts';
import type { Reserva, StatusReserva } from '../src/lib/reservas.ts';

// Pacote 34, bloco "do carrinho ao pagamento", P1: na tela do QR do Pix, o cliente troca para o cartão no mesmo pedido,
// pelo mesmo caminho da troca para o Pix (POST /api/pedido/[codigo]/pagar). O cuidado é com o dinheiro: a sessão do
// cartão só chega ao cliente com a certeza, pela Stripe, de que a do Pix fechou. Pago pouco antes da troca: o pedido fica
// pago e o cartão não abre. A Stripe não confirmou: o pedido volta para o Pix e o cartão não abre. Nada aqui chama a Stripe
// nem o banco: as chamadas são de mentira.
delete process.env.SUPABASE_URL;

const sessao = (campos: Partial<Stripe.Checkout.Session>) =>
  ({ id: 'cs_test_pix', object: 'checkout.session', metadata: { forma: 'pix' }, ...campos }) as Stripe.Checkout.Session;
const naoExiste = () =>
  new Stripe.errors.StripeInvalidRequestError({
    type: 'invalid_request_error',
    code: 'resource_missing',
    message: 'No such checkout.session',
  });
const foraDoAr = () => new Stripe.errors.StripeAPIError({ type: 'api_error', message: 'a Stripe não respondeu' });

/** As chamadas de mentira e o registro do que foi chamado. */
function stripeDeMentira(expirar: ChamadasDaStripe['expirar'], reler: ChamadasDaStripe['reler']) {
  const chamadas: string[] = [];
  return {
    chamadas,
    stripe: {
      expirar: (id: string) => (chamadas.push(`expirar ${id}`), expirar(id)),
      reler: (id: string) => (chamadas.push(`reler ${id}`), reler(id)),
    } satisfies ChamadasDaStripe,
  };
}

// os erros esperados de mentira escrevem no registro do servidor: aqui ficam calados
const erroDoConsole = console.error;
const calado = async <T>(f: () => Promise<T>): Promise<T> => {
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = erroDoConsole;
  }
};

test('a sessão anterior, pela Stripe relida: paga, vencida ou ainda aberta (concluída sem pagar também conta como aberta)', () => {
  assert.equal(anteriorDepoisDeFechar({ status: 'complete', payment_status: 'paid' }), 'paga');
  assert.equal(anteriorDepoisDeFechar({ status: 'expired', payment_status: 'unpaid' }), 'fechada');
  assert.equal(anteriorDepoisDeFechar({ status: 'open', payment_status: 'unpaid' }), 'aberta');
  // o Pix concluído e ainda sem o dinheiro pode cair depois: abrir o cartão agora deixaria pagar duas vezes
  assert.equal(anteriorDepoisDeFechar({ status: 'complete', payment_status: 'unpaid' }), 'aberta');
});

test('fechou na hora: a troca segue, sem reler a sessão', async () => {
  const { stripe, chamadas } = stripeDeMentira(
    async () => true,
    async () => assert.fail('não relê'),
  );
  assert.deepEqual(await fecharSessaoAnterior('cs_test_pix', 'ON-TESTE1', stripe), { estado: 'fechada' });
  assert.deepEqual(chamadas, ['expirar cs_test_pix']);
});

test('o Pix pago pouco antes da troca: a Stripe não fecha a sessão (ela não está mais aberta), e a releitura diz que ela foi paga', async () => {
  const paga = sessao({ status: 'complete', payment_status: 'paid', amount_total: 13860 });
  const { stripe, chamadas } = stripeDeMentira(
    async () => false,
    async () => paga,
  );
  const r = await fecharSessaoAnterior('cs_test_pix', 'ON-TESTE2', stripe);
  assert.equal(r.estado, 'paga');
  assert.equal(r.estado === 'paga' && r.lida, paga);
  assert.deepEqual(chamadas, ['expirar cs_test_pix', 'reler cs_test_pix']);
});

test('a sessão que já tinha vencido (o "Pagar de novo" de um pedido vencido): fechada, a troca segue', async () => {
  const { stripe } = stripeDeMentira(
    async () => false,
    async () => sessao({ status: 'expired', payment_status: 'unpaid' }),
  );
  assert.deepEqual(await fecharSessaoAnterior('cs_test_pix', 'ON-TESTE3', stripe), { estado: 'fechada' });
});

test('a Stripe não conseguiu fechar a sessão do Pix e ela continua aberta: aberta, com a forma dela', async () => {
  const { stripe } = stripeDeMentira(
    async () => {
      throw foraDoAr();
    },
    async () => sessao({ status: 'open', payment_status: 'unpaid' }),
  );
  assert.deepEqual(await calado(() => fecharSessaoAnterior('cs_test_pix', 'ON-TESTE4', stripe)), { estado: 'aberta', forma: 'pix' });
});

test('nem o fechamento nem a releitura responderam: conta como aberta (sem a certeza de que o Pix morreu, o cartão não abre)', async () => {
  const { stripe } = stripeDeMentira(
    async () => {
      throw foraDoAr();
    },
    async () => {
      throw foraDoAr();
    },
  );
  assert.deepEqual(await calado(() => fecharSessaoAnterior('cs_test_pix', 'ON-TESTE5', stripe)), { estado: 'aberta' });
});

test('a sessão que não existe nesta conta da Stripe não recebe pagamento nenhum: fechada', async () => {
  const { stripe } = stripeDeMentira(
    async () => false,
    async () => {
      throw naoExiste();
    },
  );
  assert.deepEqual(await fecharSessaoAnterior('cs_test_pix', 'ON-TESTE6', stripe), { estado: 'fechada' });
});

test('a troca desfeita: o pedido volta para a sessão anterior, com a forma dela, só se a corrente ainda for a nova', () => {
  const pedido = (status: StatusReserva, corrente: string) =>
    ({
      status,
      provedor: 'stripe',
      pagamentoExternoId: corrente,
      pagamento: { metodo: 'cartao' },
      historico: [],
    }) as unknown as Reserva;

  const p = pedido('pendente', 'cs_test_cartao');
  const linha = sessaoAnteriorDeVolta(p, 'cs_test_cartao', 'cs_test_pix', 'pix');
  assert.match(linha ?? '', /^Troca de forma desfeita: a sessão anterior \(cs_test_pix\) não pôde ser fechada na Stripe/);
  assert.equal(p.pagamentoExternoId, 'cs_test_pix');
  assert.equal(p.pagamento.metodo, 'pix');
  assert.equal(p.status, 'pendente');

  // outro toque gravou outra sessão no meio-tempo: fica como está
  const outro = pedido('pendente', 'cs_test_outra');
  assert.equal(sessaoAnteriorDeVolta(outro, 'cs_test_cartao', 'cs_test_pix', 'pix'), null);
  assert.equal(outro.pagamentoExternoId, 'cs_test_outra');
  assert.equal(outro.pagamento.metodo, 'cartao');

  // o pedido foi pago (ou cancelado) no meio-tempo: nada muda
  for (const s of ['pago', 'cancelado', 'reembolsado', 'contestado'] as StatusReserva[]) {
    const fechado = pedido(s, 'cs_test_cartao');
    const antes = structuredClone(fechado);
    assert.equal(sessaoAnteriorDeVolta(fechado, 'cs_test_cartao', 'cs_test_pix', 'pix'), null, s);
    assert.deepEqual(fechado, antes, s);
  }

  // sem saber a forma da anterior, a forma não muda
  const semForma = pedido('pendente', 'cs_test_cartao');
  assert.ok(sessaoAnteriorDeVolta(semForma, 'cs_test_cartao', 'cs_test_pix'));
  assert.equal(semForma.pagamento.metodo, 'cartao');
});

/* ------------------------------------------------------------------ */
/* A ordem dentro de abrirSessaoDoPedido (só roda no Next: o código é lido)  */

const semComentarios = (fonte: string) =>
  fonte
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('a sessão nova só volta depois de conferir cada anterior: paga, o pedido fica pago; aberta, a troca é desfeita', () => {
  const fonte = semComentarios(readFileSync(path.join('src', 'app', 'api', 'pedido', 'pedido-stripe.ts'), 'utf8'));
  const inicio = fonte.indexOf('export async function abrirSessaoDoPedido(');
  const corpo = fonte.slice(inicio, fonte.indexOf('\n}\n', inicio));
  const pos = (trecho: string) => {
    const i = corpo.indexOf(trecho);
    assert.notEqual(i, -1, trecho);
    return i;
  };
  // na ordem: gravar a nova, conferir as anteriores, decidir (paga, aberta) e só então os bloqueios e o segredo
  const ordem = [
    pos('registro = await registrarSessaoCriada(codigo, sessao, forma);'),
    pos('const anteriores = sessoesSubstituidas(r.pagamentoExternoId, registro.substituida, sessao.id);'),
    pos('depois.push({ anterior, ...(await fecharSessaoAnterior(anterior, codigo)) });'),
    pos("const paga = depois.find((d) => d.estado === 'paga');"),
    pos("const aberta = depois.findLast((d) => d.estado === 'aberta');"),
    pos('await renomearBloqueiosDaSessao(anterior, sessao.id)'),
    pos('return { codigo, sessaoId: sessao.id, clientSecret: sessao.client_secret, forma };'),
  ];
  assert.deepEqual(
    [...ordem].sort((a, b) => a - b),
    ordem,
  );
  // paga: o pagamento entra pela porta do aviso da Stripe, a nova fecha DEPOIS (mesmo se a gravação falhar) e sai
  // PedidoFechado (409 'status'). A ordem é da revisão do Pacote 34: fechando antes, o aviso de sessão vencida da nova
  // (ainda a do pedido) podia pôr o pedido em "expirado"
  assert.match(
    corpo,
    /if \(paga\?\.estado === 'paga'\) \{\s+try \{\s+const aplicada = await aplicarSessao\(codigo, paga\.lida, 'consulta'\);\s+throw new PedidoFechado\(aplicada\.reserva\?\.status \?\? 'pago'\);\s+\} finally \{\s+await fecharNova\(\);\s+\}\s+\}/,
  );
  // aberta: o pedido volta para a anterior, a nova fecha DEPOIS e sai SessaoAnteriorAberta (502 'stripe')
  assert.match(
    corpo,
    /if \(aberta\?\.estado === 'aberta'\) \{[\s\S]*?await devolverSessaoAnterior\(codigo, sessao\.id, aberta\.anterior, formaAnterior\)[\s\S]*?await fecharNova\(\);\s+throw new SessaoAnteriorAberta\(codigo, aberta\.anterior\);\s+\}/,
  );
  // o fechamento de antes, sem conferir nada, não volta
  assert.doesNotMatch(corpo, /await expirarSessao\(anterior\)/);
  assert.equal(corpo.match(/clientSecret: sessao\.client_secret/g)?.length, 1);
});

test('a tela do Pix: o botão de trocar para o cartão, o aviso do celular e o que acontece em cada resposta do servidor', () => {
  const fonte = semComentarios(readFileSync(path.join('src', 'components', 'pagamento', 'CheckoutEmbutido.tsx'), 'utf8'));
  const inicio = fonte.indexOf('export function CheckoutEmbutido(');
  const componente = fonte.slice(inicio, fonte.indexOf('export interface TextosPagarPedido'));
  // o botão: só com o QR do Pix na tela, com o cartão valendo e com o formulário carregado; vazado (o caminho principal da
  // tela continua sendo pagar o Pix), desligado durante a troca
  assert.match(
    componente,
    /\{formaAtual === 'pix' && cartaoDisponivel && !semCartao && !semFormulario && \(\s+<button\s+type="button"\s+className="botao botao-vazado w-full sm:w-auto"\s+onClick=\{pagarComCartao\}\s+disabled=\{trocando\}\s+aria-busy=\{trocando\}\s+>\s+\{trocando \? T\.processando : T\.pagarComCartao\}\s+<\/button>\s+\)\}/,
  );
  // depois da caixa do formulário (embaixo do QR), nunca antes
  assert.ok(componente.indexOf('onClick={pagarComCartao}') > componente.indexOf('</EmbeddedCheckoutProvider>'));
  // o aviso do celular vem em cima, antes do recebedor
  assert.ok(componente.indexOf('{T.pixNoCelular}') < componente.indexOf('{T.pixRecebedor}'));
  assert.ok(componente.indexOf('{T.pixNoCelular}') < componente.indexOf('<EmbeddedCheckoutProvider'));
  // a troca: o mesmo caminho do Pix (pedirNovaSessao), com a forma cartão
  const troca = componente.slice(componente.indexOf('async function pagarComCartao() {'));
  assert.match(
    troca,
    /^async function pagarComCartao\(\) \{\s+setTrocando\(true\);\s+setErro\(''\);\s+const resposta = await pedirNovaSessao\(codigoPedido, token, 'cartao'\);/,
  );
  // a sessão do cartão: o formulário troca na mesma caixa e quem mostra o total fica sabendo
  assert.match(
    troca,
    /setSegredo\(resposta\.clientSecret\);\s+setFormaAtual\('cartao'\);\s+setRecusa\(undefined\);\s+aoTrocarForma\?\.\('cartao'\);/,
  );
  // o 409 (o Pix pago no instante da troca): a página do pedido, com a página inteira carregando, que mostra o pedido pago
  assert.match(troca, /\} else if \(resposta\.erro === 'status'\) \{\s+irParaOPedido\(\);\s+return;\s+\}/);
  // o 403 'forma' (o cartão não vale mais): o botão sai e a frase do Pix já gerado entra
  assert.match(troca, /\} else if \(resposta\.erro === 'forma'\) \{\s+setSemCartao\(true\);\s+setErro\(T\.pixGerado\);/);
  // o erro (o QR continua valendo) nasce embaixo do botão, com o foco
  assert.match(componente, /\{formaAtual === 'pix' && erro && \(\s+<p ref=\{erroRef\} tabIndex=\{-1\} role="alert"/);
  // as duas telas passam se o cartão vale (o servidor decidiu as formas)
  const carrinho = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  assert.match(carrinho, /cartaoDisponivel=\{formas\.includes\('cartao'\)\}/);
  const pagarPedido = fonte.slice(fonte.indexOf('export function PagarPedido('));
  assert.match(pagarPedido, /cartaoDisponivel=\{formas\.includes\('cartao'\)\}/);
  // na página do pedido, a troca não redesenha a página: a chave da tela é o status, e o pedido vencido que voltou a
  // pendente começaria do zero em "confirmando o pagamento", sem o formulário que acabou de abrir (visto no teste)
  assert.match(pagarPedido, /aoTrocarForma=\{setForma\}/);
  const telaDoCheckout = pagarPedido.slice(
    pagarPedido.indexOf('<CheckoutEmbutido'),
    pagarPedido.indexOf('/>', pagarPedido.indexOf('<CheckoutEmbutido')),
  );
  assert.doesNotMatch(telaDoCheckout, /router\.|location\./);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSULTAS_POR_IP,
  ENVIOS_POR_PEDIDO,
  RESPOSTA_DA_CONSULTA,
  consultarPedido,
  emailConfere,
  normalizarCodigo,
  respostaDaConsulta,
  type DependenciasDaConsulta,
  type PedidoConsultado,
} from '../src/lib/consulta-pedido.ts';

// Etapa 6: "Consultar meu pedido". A tela nunca mostra o pedido e responde sempre a mesma coisa: o link só vai para o
// e-mail do próprio pedido. Aqui, a resposta (igual para pedido que existe ou não) e o trabalho de depois da resposta
// (busca, confere o e-mail e manda), com o banco e o envio de mentira.

/** O "banco": um pedido de um item e um de vários (o voucher ON-AB2CD3 é do pedido ON-7K3P9Q). */
const PEDIDOS: Record<string, PedidoConsultado> = {
  'ON-7K3P9Q': { codigo: 'ON-7K3P9Q', email: 'maria@exemplo.com' },
  'ON-AB2CD3': { codigo: 'ON-7K3P9Q', email: 'maria@exemplo.com' },
  'VH-2345AB': { codigo: 'VH-2345AB', email: 'joao@exemplo.com' },
};

function dependencias(opcoes: { cabe?: boolean } = {}) {
  const buscados: string[] = [];
  const enviados: string[] = [];
  const deps: DependenciasDaConsulta = {
    async buscar(codigo) {
      buscados.push(codigo);
      return PEDIDOS[codigo] ?? null;
    },
    async podeEnviar() {
      return opcoes.cabe ?? true;
    },
    async enviar(codigo) {
      enviados.push(codigo);
    },
  };
  return { deps, buscados, enviados };
}

test('a resposta da rota é sempre a mesma quando os dados vêm no formato certo, exista o pedido ou não', () => {
  const existe = respostaDaConsulta({ email: 'maria@exemplo.com', codigo: 'ON-7K3P9Q' });
  const emailDeOutro = respostaDaConsulta({ email: 'intruso@exemplo.com', codigo: 'ON-7K3P9Q' });
  const naoExiste = respostaDaConsulta({ email: 'maria@exemplo.com', codigo: 'ON-ZZZZZZ' });
  assert.deepEqual(existe, { status: 200, corpo: RESPOSTA_DA_CONSULTA });
  assert.deepEqual(emailDeOutro, existe);
  assert.deepEqual(naoExiste, existe);
  assert.deepEqual(RESPOSTA_DA_CONSULTA, { ok: true });
  // a resposta não leva nada do pedido
  assert.deepEqual(Object.keys(existe.corpo), ['ok']);
});

test('só o formato errado muda a resposta (e diz o campo, nunca se o pedido existe)', () => {
  assert.deepEqual(respostaDaConsulta({ email: 'nao-e-email', codigo: 'ON-7K3P9Q' }), { status: 400, corpo: { ok: false, erro: 'email' } });
  assert.deepEqual(respostaDaConsulta({ email: 'maria@exemplo.com', codigo: 'XX' }), { status: 400, corpo: { ok: false, erro: 'codigo' } });
  assert.deepEqual(respostaDaConsulta({ email: undefined, codigo: undefined }), { status: 400, corpo: { ok: false, erro: 'email' } });
  assert.deepEqual(respostaDaConsulta({ email: 'maria@exemplo.com', codigo: 42 }), { status: 400, corpo: { ok: false, erro: 'codigo' } });
});

test('o código como o cliente digita vira o do site', () => {
  for (const digitado of ['ON-7K3P9Q', 'on-7k3p9q', ' ON 7K3P9Q ', 'ON7K3P9Q', '7K3P9Q', 'on–7k3p9q']) {
    assert.equal(normalizarCodigo(digitado), 'ON-7K3P9Q', digitado);
  }
  assert.equal(normalizarCodigo('vh-2345ab'), 'VH-2345AB');
  // letras que o site nunca usa (0, O, 1, I) e tamanhos errados não valem
  for (const ruim of ['ON-7K3P9O', 'ON-7K3P91', 'ON-7K3P9', 'ON-7K3P9QQ', '', 'ON-', 'XY-7K3P9Q']) {
    assert.equal(normalizarCodigo(ruim), null, ruim);
  }
});

test('o e-mail confere sem diferença de maiúsculas e espaços; outro e-mail não', () => {
  assert.equal(emailConfere('maria@exemplo.com', '  Maria@Exemplo.COM '), true);
  assert.equal(emailConfere('maria@exemplo.com', 'maria@exemplo.co'), false);
  assert.equal(emailConfere('maria@exemplo.com', 'joao@exemplo.com'), false);
});

test('o link só vai quando o e-mail é o do pedido; pedido de outra pessoa ou que não existe não recebe nada', async () => {
  // o dono do pedido
  let d = dependencias();
  assert.equal(await consultarPedido({ email: 'MARIA@exemplo.com', codigo: 'on-7k3p9q' }, d.deps), true);
  assert.deepEqual(d.enviados, ['ON-7K3P9Q']);
  // pelo código de um voucher do pedido, o link é o do pedido inteiro
  d = dependencias();
  assert.equal(await consultarPedido({ email: 'maria@exemplo.com', codigo: 'ON-AB2CD3' }, d.deps), true);
  assert.deepEqual(d.enviados, ['ON-7K3P9Q']);
  // alguém que sabe o código, com outro e-mail: nada sai, nem para o dono
  d = dependencias();
  assert.equal(await consultarPedido({ email: 'intruso@exemplo.com', codigo: 'ON-7K3P9Q' }, d.deps), false);
  assert.deepEqual(d.enviados, []);
  // o e-mail certo de OUTRO pedido também não serve
  d = dependencias();
  assert.equal(await consultarPedido({ email: 'joao@exemplo.com', codigo: 'ON-7K3P9Q' }, d.deps), false);
  assert.deepEqual(d.enviados, []);
  // código que não existe
  d = dependencias();
  assert.equal(await consultarPedido({ email: 'maria@exemplo.com', codigo: 'ON-ZZZZZZ' }, d.deps), false);
  assert.deepEqual(d.enviados, []);
});

test('formato errado nem chega a buscar; o limite de envios por pedido segura a caixa do cliente', async () => {
  let d = dependencias();
  assert.equal(await consultarPedido({ email: 'nao-e-email', codigo: 'ON-7K3P9Q' }, d.deps), false);
  assert.equal(await consultarPedido({ email: 'maria@exemplo.com', codigo: '123' }, d.deps), false);
  assert.deepEqual(d.buscados, []);
  d = dependencias({ cabe: false });
  assert.equal(await consultarPedido({ email: 'maria@exemplo.com', codigo: 'ON-7K3P9Q' }, d.deps), false);
  assert.deepEqual(d.enviados, []);
  assert.equal(CONSULTAS_POR_IP, 5);
  assert.equal(ENVIOS_POR_PEDIDO, 3);
});

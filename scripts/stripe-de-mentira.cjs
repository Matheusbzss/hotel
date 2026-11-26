// A STRIPE DE MENTIRA da cópia particular (STRIPE_DE_MENTIRA_*), para testar no computador o pagamento, o reembolso e a sessão
// vencida sem falar com a Stripe de verdade. Carregada antes do servidor, com NODE_OPTIONS=--require=<este arquivo>: troca o
// https.request SÓ para api.stripe.com. Nenhuma chamada sai deste computador para a Stripe, e nenhuma chave de verdade é usada.
//
// Juntou as versões que moravam no scratchpad (consertos/opcoes e revisao-pagamento) e ganhou, no pacote 2 da reserva das
// casas (26/11/2026), o reembolso e a sessão vencida:
// - sessão: criar (POST /v1/checkout/sessions, com a chave de idempotência como a Stripe: a mesma chave e o mesmo corpo
//   devolvem a mesma sessão; outro corpo, o erro de idempotência), reler (GET, aberta, vencida ou paga, com o pagamento e a
//   cobrança expandidos), fechar (POST …/expire: a paga e a já fechada dão o 400 da Stripe) e procurar pelo pagamento (GET
//   /v1/checkout/sessions?payment_intent=…);
// - reembolso: criar (POST /v1/refunds, o total ou uma parte, com a referência e a chave de idempotência), listar (GET
//   /v1/refunds?payment_intent=… ou ?charge=…) e reler (GET /v1/refunds/:id); a cobrança (GET /v1/charges/:id) e o pagamento
//   (GET /v1/payment_intents/:id) somam o que foi devolvido. STRIPE_DE_MENTIRA_REEMBOLSO=pending faz o reembolso nascer
//   pendente (o "a caminho" do e-mail);
// - o saldo (GET /v1/balance, Pacote 33): STRIPE_DE_MENTIRA_SALDO_ARQUIVO (JSON { disponivel, aLiberar, demoraMs, erro }) ou
//   STRIPE_DE_MENTIRA_SALDO (só o disponível), só para a chave do saldo (STRIPE_SALDO_KEY);
// - as sessões que a Stripe "não consegue fechar" (STRIPE_DE_MENTIRA_NAO_FECHA, JSON { "cs_…": true }: o expire dá 500) e as
//   que o cliente "já pagou" por fora (STRIPE_DE_MENTIRA_PAGAS, JSON { "cs_…": { valor, forma, codigo } }), como antes.
// O estado (sessões, pagamentos e reembolsos) fica num JSON (STRIPE_DE_MENTIRA_ESTADO; padrão .data/stripe-de-mentira.json, na
// pasta de onde o servidor roda), para os avisos de linha de comando, abaixo, acharem o que o servidor criou. Cada chamada vira
// uma linha em STRIPE_DE_MENTIRA_LOG (sem chave e sem dado de cliente).
//
// Os avisos da Stripe (o webhook), assinados com o segredo inventado da cópia (STRIPE_WEBHOOK_SECRET no ambiente, ou o "whsec"
// do JSON em STRIPE_DE_MENTIRA_SEGREDOS; nunca impresso), mandados para STRIPE_DE_MENTIRA_SITE (padrão
// http://localhost:3404/api/webhooks/stripe):
//   node scripts/stripe-de-mentira.cjs pagar <cs_…> [pix|cartao]   a sessão paga e o checkout.session.completed
//   node scripts/stripe-de-mentira.cjs vencer <cs_…>               a sessão vencida e o checkout.session.expired
//   node scripts/stripe-de-mentira.cjs reembolsado <pi_…|ch_…>      o charge.refunded da cobrança (depois do "Reembolsar")
//   node scripts/stripe-de-mentira.cjs falhar <re_…>               o reembolso que falhou e o refund.failed
// Só para a bancada: nada daqui é importado pelo site.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');

const LOG = process.env.STRIPE_DE_MENTIRA_LOG;
const ARQUIVO = process.env.STRIPE_DE_MENTIRA_ESTADO || path.join(process.cwd(), '.data', 'stripe-de-mentira.json');
const agora = () => Math.floor(Date.now() / 1000);
const lerJson = (arquivo, vazio) => {
  try {
    return arquivo ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : vazio;
  } catch {
    return vazio;
  }
};

/* ------------------------------------------------------------------ */
/* O estado                                                            */

function lerEstado() {
  const e = lerJson(ARQUIVO, {});
  return { sessoes: e.sessoes || {}, reembolsos: e.reembolsos || {}, chaves: e.chaves || {}, n: e.n || 0 };
}
function gravarEstado(e) {
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(e, null, 1));
}
const pagasDeFora = () => lerJson(process.env.STRIPE_DE_MENTIRA_PAGAS, {});
const naoFecha = () => lerJson(process.env.STRIPE_DE_MENTIRA_NAO_FECHA, {});
const sufixo = (id) => id.slice(-12);
const piDa = (cs) => `pi_mentira_${sufixo(cs)}`;
const chDa = (cs) => `ch_mentira_${sufixo(cs)}`;

/** A sessão guardada (criada aqui) ou a paga por fora (STRIPE_DE_MENTIRA_PAGAS), com o estado de agora. */
function sessaoDe(e, id) {
  const deFora = pagasDeFora()[id];
  if (deFora)
    return {
      status: 'complete',
      paga: true,
      valor: deFora.valor,
      forma: deFora.forma,
      codigo: deFora.codigo || '',
      criada: agora(),
      vence: agora() + 1800,
    };
  const s = e.sessoes[id];
  if (!s) return null;
  // passou do fim sem pagar: vencida, como a Stripe
  if (!s.paga && s.status === 'open' && s.vence <= agora()) return { ...s, status: 'expired' };
  return s;
}

const devolvidoDe = (e, pi) =>
  Object.values(e.reembolsos)
    .filter((r) => r.payment_intent === pi && r.status !== 'failed' && r.status !== 'canceled')
    .reduce((soma, r) => soma + r.amount, 0);

function cobrancaDe(e, cs, s) {
  const pi = piDa(cs);
  const devolvido = devolvidoDe(e, pi);
  return {
    id: chDa(cs),
    object: 'charge',
    status: 'succeeded',
    amount: s.valor,
    amount_refunded: devolvido,
    refunded: devolvido >= s.valor,
    currency: 'brl',
    created: s.pagaEm || agora(),
    payment_intent: pi,
    metadata: s.codigo ? { codigo: s.codigo } : {},
    payment_method_details: s.forma === 'pix' ? { type: 'pix' } : { type: 'card', card: { brand: 'visa', last4: '4242', country: 'AR' } },
  };
}

function pagamentoDe(e, cs, s) {
  return {
    id: piDa(cs),
    object: 'payment_intent',
    status: 'succeeded',
    amount: s.valor,
    amount_received: s.valor,
    currency: 'brl',
    metadata: s.codigo ? { codigo: s.codigo } : {},
    latest_charge: cobrancaDe(e, cs, s),
  };
}

function sessaoNaStripe(e, id, s) {
  return {
    id,
    object: 'checkout.session',
    status: s.paga ? 'complete' : s.status,
    payment_status: s.paga ? 'paid' : 'unpaid',
    amount_total: s.valor,
    currency: 'brl',
    client_reference_id: s.codigo || null,
    metadata: { forma: s.forma, ...(s.codigo ? { codigo: s.codigo } : {}) },
    customer_details: { address: { country: 'AR' } },
    created: s.criada,
    expires_at: s.vence,
    ...(s.pixValidade ? { payment_method_options: { pix: { expires_after_seconds: s.pixValidade } } } : {}),
    payment_intent: s.paga ? pagamentoDe(e, id, s) : null,
    livemode: false,
  };
}

/** O cs_… de um pagamento (pi_…) ou de uma cobrança (ch_…) daqui. */
function sessaoDoPagamento(e, id) {
  const todas = [...Object.keys(e.sessoes), ...Object.keys(pagasDeFora())];
  return todas.find((cs) => piDa(cs) === id || chDa(cs) === id) || null;
}

/* ------------------------------------------------------------------ */
/* As respostas                                                        */

const erro = (status, message, type = 'invalid_request_error', code = 'resource_missing') => ({
  status,
  corpo: { error: { type, code, message } },
});
const ok = (corpo) => ({ status: 200, corpo });

function saldo(daChaveDoSaldo) {
  const s = lerJson(process.env.STRIPE_DE_MENTIRA_SALDO_ARQUIVO, null) || {
    disponivel: Number(process.env.STRIPE_DE_MENTIRA_SALDO || 0),
    aLiberar: 0,
  };
  const demoraMs = Number(s.demoraMs || 0);
  if (!daChaveDoSaldo)
    return {
      ...erro(401, 'The provided key does not have the required permissions for this endpoint.', 'invalid_request_error', 'permission'),
      demoraMs,
    };
  if (s.erro) return { ...erro(401, 'Invalid API Key provided: rk_test_****bancada', 'invalid_request_error', 'api_key'), demoraMs };
  const linha = (amount) => [{ amount: Number(amount || 0), currency: 'brl', source_types: { card: Number(amount || 0) } }];
  return { ...ok({ object: 'balance', available: linha(s.disponivel), pending: linha(s.aLiberar), livemode: false }), demoraMs };
}

/**
 * A resposta da Stripe de mentira para uma chamada: o método, o caminho (com a consulta), o corpo (form-urlencoded, como o SDK
 * manda), a chave de idempotência e se veio com a chave do saldo. Grava o estado quando muda. Exportada para os testes.
 */
function responder(metodo, caminho, corpo = '', chave = '', daChaveDoSaldo = false) {
  const url = new URL(caminho, 'https://api.stripe.com');
  const p = url.pathname;
  const q = new URLSearchParams(corpo);
  const e = lerEstado();
  let m;
  if (metodo === 'GET' && p === '/v1/balance') return saldo(daChaveDoSaldo);

  // a chave de idempotência: a mesma chave e o mesmo corpo devolvem a mesma resposta; outro corpo, o erro da Stripe
  if (metodo === 'POST' && chave && e.chaves[chave]) {
    const antes = e.chaves[chave];
    if (antes.corpo !== corpo) {
      return erro(
        400,
        'Keys for idempotent requests can only be used with the same parameters they were first used with.',
        'idempotency_error',
        'idempotency_key_in_use',
      );
    }
    if (antes.sessao) return ok(sessaoNaStripe(e, antes.sessao, sessaoDe(e, antes.sessao)));
    if (antes.reembolso) return ok(e.reembolsos[antes.reembolso]);
  }

  if (metodo === 'POST' && p === '/v1/checkout/sessions') {
    e.n += 1;
    const id = `cs_test_mentira${Date.now()}${e.n}`;
    let valor = 0;
    for (let i = 0; q.has(`line_items[${i}][price_data][unit_amount]`); i++) {
      valor += Number(q.get(`line_items[${i}][price_data][unit_amount]`)) * Number(q.get(`line_items[${i}][quantity]`) || 1);
    }
    const criada = agora();
    e.sessoes[id] = {
      status: 'open',
      paga: false,
      forma: q.get('metadata[forma]') || '',
      codigo: q.get('metadata[codigo]') || '',
      valor,
      criada,
      vence: Number(q.get('expires_at')) || criada + 1800,
      ...(Number(q.get('payment_method_options[pix][expires_after_seconds]'))
        ? { pixValidade: Number(q.get('payment_method_options[pix][expires_after_seconds]')) }
        : {}),
    };
    if (chave) e.chaves[chave] = { corpo, sessao: id };
    gravarEstado(e);
    // a forma no fim do segredo: só o Stripe.js de mentira dos prints lê (o site nunca abre o segredo)
    return ok({ ...sessaoNaStripe(e, id, e.sessoes[id]), client_secret: `${id}_secret_mentira_${e.sessoes[id].forma || 'x'}`, url: null });
  }
  if (metodo === 'POST' && (m = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(p))) {
    const id = m[1];
    const s = sessaoDe(e, id);
    if (naoFecha()[id]) return erro(500, 'bancada: a Stripe não conseguiu fechar a sessão agora.', 'api_error', 'erro_da_bancada');
    if (s && (s.paga || s.status !== 'open'))
      return erro(
        400,
        'Only Checkout Sessions with a status in ["open"] can be expired.',
        'invalid_request_error',
        'checkout_session_not_open',
      );
    if (!s) return erro(404, `No such checkout.session: '${id}'`);
    e.sessoes[id].status = 'expired';
    gravarEstado(e);
    return ok(sessaoNaStripe(e, id, e.sessoes[id]));
  }
  if (metodo === 'GET' && p === '/v1/checkout/sessions') {
    const cs = sessaoDoPagamento(e, url.searchParams.get('payment_intent') || '');
    return ok({ object: 'list', data: cs ? [sessaoNaStripe(e, cs, sessaoDe(e, cs))] : [], has_more: false });
  }
  if (metodo === 'GET' && (m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(p))) {
    const s = sessaoDe(e, m[1]);
    return s
      ? ok(sessaoNaStripe(e, m[1], naoFecha()[m[1]] ? { ...s, status: 'open' } : s))
      : erro(404, `No such checkout.session: '${m[1]}'`);
  }

  if (metodo === 'POST' && p === '/v1/refunds') {
    const pi = q.get('payment_intent') || '';
    const cs = sessaoDoPagamento(e, pi);
    const s = cs ? sessaoDe(e, cs) : null;
    if (!s || !s.paga) return erro(400, `No such payment_intent: '${pi}'`);
    const resta = s.valor - devolvidoDe(e, pi);
    const amount = q.has('amount') ? Number(q.get('amount')) : resta;
    if (resta <= 0) return erro(400, `Charge ${chDa(cs)} has already been refunded.`, 'invalid_request_error', 'charge_already_refunded');
    if (!(amount > 0) || amount > resta)
      return erro(
        400,
        `Refund amount (${amount}) is greater than unrefunded amount on charge (${resta})`,
        'invalid_request_error',
        'amount_too_large',
      );
    e.n += 1;
    const id = `re_mentira_${Date.now()}${e.n}`;
    e.reembolsos[id] = {
      id,
      object: 'refund',
      amount,
      currency: 'brl',
      status: process.env.STRIPE_DE_MENTIRA_REEMBOLSO === 'pending' ? 'pending' : 'succeeded',
      payment_intent: pi,
      charge: chDa(cs),
      created: agora(),
      failure_reason: null,
      metadata: { ...(q.get('metadata[referencia]') ? { referencia: q.get('metadata[referencia]') } : {}) },
    };
    if (chave) e.chaves[chave] = { corpo, reembolso: id };
    gravarEstado(e);
    return ok(e.reembolsos[id]);
  }
  if (metodo === 'GET' && p === '/v1/refunds') {
    const pi = url.searchParams.get('payment_intent');
    const ch = url.searchParams.get('charge');
    const data = Object.values(e.reembolsos)
      .filter((r) => (pi && r.payment_intent === pi) || (ch && r.charge === ch))
      .sort((a, b) => b.created - a.created);
    return ok({ object: 'list', data, has_more: false });
  }
  if (metodo === 'GET' && (m = /^\/v1\/refunds\/([^/]+)$/.exec(p))) {
    return e.reembolsos[m[1]] ? ok(e.reembolsos[m[1]]) : erro(404, `No such refund: '${m[1]}'`);
  }
  if (metodo === 'GET' && (m = /^\/v1\/(charges|payment_intents)\/([^/]+)$/.exec(p))) {
    const cs = sessaoDoPagamento(e, m[2]);
    const s = cs ? sessaoDe(e, cs) : null;
    if (!s || !s.paga) return erro(404, `No such ${m[1] === 'charges' ? 'charge' : 'payment_intent'}: '${m[2]}'`);
    return ok(m[1] === 'charges' ? cobrancaDe(e, cs, s) : pagamentoDe(e, cs, s));
  }
  return erro(404, `bancada: ${metodo} ${p}`);
}

/* ------------------------------------------------------------------ */
/* A troca do https.request (com NODE_OPTIONS=--require)               */

const cabecalho = (opcoes, nome) => {
  const h = (opcoes && opcoes.headers) || {};
  const k = Object.keys(h).find((x) => x.toLowerCase() === nome);
  return k ? String(h[k]) : '';
};

if (!globalThis.__stripeDeMentiraDoSite) {
  globalThis.__stripeDeMentiraDoSite = true;
  const original = https.request;
  https.request = function requestDaBancada(opcoes, ...resto) {
    const host = typeof opcoes === 'string' ? new URL(opcoes).host : opcoes && (opcoes.host || opcoes.hostname);
    if (!host || !/(^|\.)api\.stripe\.com$/.test(String(host).replace(/:\d+$/, ''))) return original.call(this, opcoes, ...resto);
    const metodo = (opcoes.method || 'GET').toUpperCase();
    const caminho = opcoes.path || '/';
    const req = new EventEmitter();
    let feito = false;
    let corpo = '';
    req.setTimeout = () => req;
    req.write = (pedaco) => {
      corpo += Buffer.isBuffer(pedaco) ? pedaco.toString('utf8') : String(pedaco ?? '');
      return true;
    };
    req.destroy = (err) => {
      if (err) req.emit('error', err);
    };
    req.end = (pedaco) => {
      if (feito) return;
      feito = true;
      if (pedaco) req.write(pedaco);
      // a chave que veio (só para saber se é a do saldo; nunca vai para o log)
      const chaveDoSaldo = (process.env.STRIPE_SALDO_KEY || '').trim();
      const daChaveDoSaldo = Boolean(chaveDoSaldo) && cabecalho(opcoes, 'authorization') === `Bearer ${chaveDoSaldo}`;
      const r = responder(metodo, caminho, corpo, cabecalho(opcoes, 'idempotency-key'), daChaveDoSaldo);
      const responderAgora = () => {
        try {
          if (LOG)
            fs.appendFileSync(
              LOG,
              JSON.stringify({ em: new Date().toISOString(), metodo, caminho: caminho.split('?')[0], status: r.status }) + '\n',
            );
        } catch {}
        const res = new Readable({ read() {} });
        res.statusCode = r.status;
        res.headers = { 'content-type': 'application/json', 'request-id': 'req_bancada' };
        res.push(Buffer.from(JSON.stringify(r.corpo)));
        res.push(null);
        req.emit('response', res);
      };
      if (r.demoraMs > 0) setTimeout(responderAgora, r.demoraMs);
      else setImmediate(responderAgora);
    };
    return req;
  };
}

/* ------------------------------------------------------------------ */
/* Os avisos da Stripe (o webhook), pela linha de comando              */

function segredoDoWebhook() {
  const doAmbiente = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (doAmbiente) return doAmbiente;
  const segredos = lerJson(process.env.STRIPE_DE_MENTIRA_SEGREDOS, {});
  if (segredos.whsec) return String(segredos.whsec).trim();
  throw new Error('falta o segredo do webhook da cópia (STRIPE_WEBHOOK_SECRET ou STRIPE_DE_MENTIRA_SEGREDOS)');
}

/** O evento assinado como a Stripe assina (t=…,v1=HMAC-SHA256 de "t.corpo"). Exportado para os testes. */
function eventoAssinado(tipo, objeto, segredo, quando = agora()) {
  const evento = {
    id: `evt_mentira_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    api_version: '2026-10-28.endive',
    created: quando,
    livemode: false,
    type: tipo,
    data: { object: objeto },
  };
  const corpo = JSON.stringify(evento);
  const v1 = crypto.createHmac('sha256', segredo).update(`${quando}.${corpo}`).digest('hex');
  return { corpo, assinatura: `t=${quando},v1=${v1}` };
}

async function avisar(tipo, objeto) {
  const { corpo, assinatura } = eventoAssinado(tipo, objeto, segredoDoWebhook());
  const site = process.env.STRIPE_DE_MENTIRA_SITE || 'http://localhost:3404/api/webhooks/stripe';
  const r = await fetch(site, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': assinatura },
    body: corpo,
  });
  console.log(`${tipo}: ${r.status} ${await r.text()}`);
}

async function linhaDeComando([comando, id, forma]) {
  const e = lerEstado();
  if (comando === 'pagar' || comando === 'vencer') {
    const s = e.sessoes[id];
    if (!s) throw new Error(`a sessão ${id} não foi criada por esta Stripe de mentira`);
    if (comando === 'pagar') Object.assign(s, { paga: true, status: 'complete', pagaEm: agora(), ...(forma ? { forma } : {}) });
    else s.status = 'expired';
    gravarEstado(e);
    return avisar(comando === 'pagar' ? 'checkout.session.completed' : 'checkout.session.expired', sessaoNaStripe(e, id, s));
  }
  if (comando === 'reembolsado') {
    const cs = sessaoDoPagamento(e, id);
    if (!cs) throw new Error(`o pagamento ${id} não é desta Stripe de mentira`);
    return avisar('charge.refunded', cobrancaDe(e, cs, sessaoDe(e, cs)));
  }
  if (comando === 'falhar') {
    const r = e.reembolsos[id];
    if (!r) throw new Error(`o reembolso ${id} não é desta Stripe de mentira`);
    Object.assign(r, { status: 'failed', failure_reason: 'expired_or_canceled_card' });
    gravarEstado(e);
    return avisar('refund.failed', r);
  }
  throw new Error('uso: node scripts/stripe-de-mentira.cjs pagar|vencer <cs_…> | reembolsado <pi_…|ch_…> | falhar <re_…>');
}

module.exports = { responder, eventoAssinado, lerEstado, ARQUIVO };

if (require.main === module) {
  linhaDeComando(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

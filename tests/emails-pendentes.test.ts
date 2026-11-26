import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AVISO_EMAIL_PAGO_SAINDO, MARCA_DO_EMAIL, PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO } from '../src/lib/email/marcas.ts';
import {
  ESPERA_DOS_PENDENTES_MS,
  JANELA_DOS_PENDENTES_MS,
  PENDENTES_POR_RODADA,
  faltaOEmailDoPagamento,
  pagosDasReservas,
  pedidosSemEmailDoPagamento,
  type PedidoPagoRecente,
} from '../src/lib/emails-pendentes.ts';
import type { Reserva, StatusReserva } from '../src/lib/reservas.ts';

/**
 * Pacote 25 (achado B1 da revisão de 23/11): o pedido que ficou pago no banco sem o e-mail com os vouchers (a resposta da
 * gravação não chegou em 10 s) recebe o e-mail pelo agendamento /api/email/pendentes, uma vez, pelo código de sempre.
 */

const fonte = (...partes: string[]) =>
  readFileSync(path.join(...partes), 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

const AGORA = new Date('2026-11-24T12:00:00.000Z');
const antes = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;

/** Um pedido pago há 20 minutos pela Stripe, parado desde então, sem nenhuma linha do e-mail (o caso do B1). */
const semEmail = (parcial: Partial<PedidoPagoRecente> = {}): PedidoPagoRecente => ({
  codigo: 'ON-PEN234',
  status: 'pago',
  pagoEm: antes(20 * MINUTO),
  atualizadaEm: antes(20 * MINUTO),
  eventos: ['Reserva criada', 'Sessão de pagamento criada: cartão (cs_test_1)', 'Pago (webhook da Stripe)'],
  ...parcial,
});

test('o pedido pago sem nenhum sinal do e-mail, quieto há 10 minutos, recebe o e-mail do pagamento aprovado', () => {
  assert.equal(faltaOEmailDoPagamento(semEmail(), AGORA), true);
  // o do WhatsApp marcado como pago no painel recebe o mesmo e-mail e cai na mesma falha: também
  const whatsapp = semEmail({ eventos: ['Reserva criada', 'Marcada como paga no Pix, no admin'] });
  assert.equal(faltaOEmailDoPagamento(whatsapp, AGORA), true);
  // nas bordas: 10 minutos e 48 horas exatos ainda valem
  assert.equal(
    faltaOEmailDoPagamento(semEmail({ pagoEm: antes(ESPERA_DOS_PENDENTES_MS), atualizadaEm: antes(ESPERA_DOS_PENDENTES_MS) }), AGORA),
    true,
  );
  assert.equal(faltaOEmailDoPagamento(semEmail({ pagoEm: antes(JANELA_DOS_PENDENTES_MS) }), AGORA), true);
});

test('os dois pedidos de produção não produzem nada: o pago com as duas linhas do e-mail e o reembolsado', () => {
  const pagoComEmail = semEmail({
    pagoEm: antes(2 * HORA),
    atualizadaEm: antes(2 * HORA),
    eventos: ['Reserva criada', 'Pago (webhook da Stripe)', AVISO_EMAIL_PAGO_SAINDO, MARCA_DO_EMAIL['pagamento-aprovado']],
  });
  const reembolsado = semEmail({
    codigo: 'ON-REE234',
    status: 'reembolsado',
    pagoEm: antes(3 * HORA),
    atualizadaEm: antes(2 * HORA),
    eventos: ['Reserva criada', 'Pago (webhook da Stripe)', 'Reembolso total (R$ 154,00) confirmado pela Stripe'],
  });
  assert.equal(faltaOEmailDoPagamento(pagoComEmail, AGORA), false);
  assert.equal(faltaOEmailDoPagamento(reembolsado, AGORA), false);
  assert.deepEqual(pedidosSemEmailDoPagamento([pagoComEmail, reembolsado], AGORA), { escolhidos: [], fora: 0 });
});

test('nada sai de novo: o aviso de que o e-mail estava saindo ou a linha do envio bastam', () => {
  // só o aviso (o envio falhou ou a função foi cortada): o painel já destaca, e a equipe manda o link
  assert.equal(faltaOEmailDoPagamento(semEmail({ eventos: ['Pago (webhook da Stripe)', AVISO_EMAIL_PAGO_SAINDO] }), AGORA), false);
  // só a linha do envio (a gravação do aviso falhou antes)
  const soMarca = semEmail({ eventos: ['Pago (webhook da Stripe)', MARCA_DO_EMAIL['pagamento-aprovado']] });
  assert.equal(faltaOEmailDoPagamento(soMarca, AGORA), false);
  // só o aviso de que o e-mail não saiu (a gravação do aviso de antes falhou): o painel já destaca, fica com a equipe
  const naoSaiu = 'Aviso: o e-mail do pagamento aprovado não saiu (recusado): mandar ao cliente o link do pedido';
  assert.equal(faltaOEmailDoPagamento(semEmail({ eventos: ['Pago (webhook da Stripe)', naoSaiu] }), AGORA), false);
  // os dois avisos começam pelo mesmo prefixo, e é essa frase que o envio grava quando o e-mail não sai
  assert.ok(AVISO_EMAIL_PAGO_SAINDO.startsWith(PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO));
  assert.ok(naoSaiu.startsWith(PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO));
  assert.match(fonte('src', 'lib', 'email', 'pedidos.ts'), /`Aviso: o e-mail do pagamento aprovado não saiu \(\$\{resultado\.motivo\}\)/);
  // uma linha que não é um dos avisos não tira o pedido da rodada
  assert.equal(faltaOEmailDoPagamento(semEmail({ eventos: ['Pago (webhook da Stripe)', 'Nota: cliente pediu o e-mail'] }), AGORA), true);
});

test('a reativação no painel de um pagamento parado (Pacote 22): conta a hora em que o pedido virou pago', () => {
  // a cobrança de 3 dias atrás, reativada há 20 minutos: entra (a hora do pagamento sozinha deixaria de fora)
  const reativado = semEmail({ pagoEm: antes(72 * HORA), reativadoEm: antes(20 * MINUTO), atualizadaEm: antes(20 * MINUTO) });
  assert.equal(faltaOEmailDoPagamento(reativado, AGORA), true);
  assert.equal(faltaOEmailDoPagamento({ ...reativado, reativadoEm: undefined }, AGORA), false);
  // reativada há 3 minutos: ainda espera; há mais de 48 horas: fora
  assert.equal(faltaOEmailDoPagamento({ ...reativado, reativadoEm: antes(3 * MINUTO), atualizadaEm: antes(3 * MINUTO) }, AGORA), false);
  assert.equal(faltaOEmailDoPagamento({ ...reativado, reativadoEm: antes(JANELA_DOS_PENDENTES_MS + MINUTO) }, AGORA), false);
  // nos arquivos, a hora da reativação vem da decisão gravada no pagamento parado, só quando a decisão é reativar
  const voucher = (decisao: { acao: 'devolver' | 'reativar'; em: string }) =>
    ({
      codigo: 'ON-REA234',
      status: 'pago',
      atualizadaEm: antes(20 * MINUTO),
      pagamento: {
        metodo: 'cartao',
        pagoEm: antes(72 * HORA),
        retido: { paymentIntentId: 'pi_1', sessaoId: 'cs_1', valorCentavos: 100, pagoEm: antes(72 * HORA), decisao },
      },
      historico: [{ em: antes(20 * MINUTO), evento: 'Pago (reativado no painel)' }],
    }) as Reserva;
  const desde = new Date(AGORA.getTime() - JANELA_DOS_PENDENTES_MS);
  const lidos = pagosDasReservas([voucher({ acao: 'reativar', em: antes(20 * MINUTO) })], desde);
  assert.deepEqual(
    lidos.map((p) => [p.codigo, p.reativadoEm]),
    [['ON-REA234', antes(20 * MINUTO)]],
  );
  assert.equal(faltaOEmailDoPagamento(lidos[0], AGORA), true);
  assert.deepEqual(pagosDasReservas([voucher({ acao: 'devolver', em: antes(20 * MINUTO) })], desde), []);
});

test('só o status pago: o reembolsado, o cancelado, o contestado e os outros nunca', () => {
  const status: StatusReserva[] = ['pendente', 'recusado', 'cancelado', 'expirado', 'aguardando_whatsapp', 'reembolsado', 'contestado'];
  for (const s of status) assert.equal(faltaOEmailDoPagamento(semEmail({ status: s }), AGORA), false, s);
});

test('cedo demais ou tarde demais: o caminho normal ainda pode estar mandando, ou o pedido é antigo', () => {
  // pago há 5 minutos: o webhook e a consulta mandam o e-mail em segundos
  assert.equal(faltaOEmailDoPagamento(semEmail({ pagoEm: antes(5 * MINUTO), atualizadaEm: antes(5 * MINUTO) }), AGORA), false);
  // a cobrança é antiga, mas o pedido acabou de virar pago (o aviso atrasado, a reativação no painel): espera também
  assert.equal(faltaOEmailDoPagamento(semEmail({ pagoEm: antes(3 * HORA), atualizadaEm: antes(2 * MINUTO) }), AGORA), false);
  // mais de 48 horas: fica fora
  assert.equal(faltaOEmailDoPagamento(semEmail({ pagoEm: antes(JANELA_DOS_PENDENTES_MS + MINUTO) }), AGORA), false);
  // sem a hora do pagamento, ou com uma que não se lê: nada
  assert.equal(faltaOEmailDoPagamento(semEmail({ pagoEm: undefined }), AGORA), false);
  assert.equal(faltaOEmailDoPagamento(semEmail({ pagoEm: 'ontem' }), AGORA), false);
  // a hora do pagamento no futuro (relógios diferentes) também não
  assert.equal(faltaOEmailDoPagamento(semEmail({ pagoEm: antes(-5 * MINUTO) }), AGORA), false);
});

test('a rodada: do pagamento mais antigo para o mais novo, um por pedido e no máximo o limite', () => {
  const lista = Array.from({ length: PENDENTES_POR_RODADA + 3 }, (_, n) =>
    semEmail({ codigo: `ON-P${String(n).padStart(2, '0')}234`, pagoEm: antes((20 + n) * MINUTO) }),
  );
  const { escolhidos, fora } = pedidosSemEmailDoPagamento([...lista, lista[0]], AGORA);
  assert.equal(escolhidos.length, PENDENTES_POR_RODADA);
  assert.equal(fora, 3);
  // o mais antigo (o último da lista) vai primeiro
  assert.equal(escolhidos[0].codigo, lista.at(-1)?.codigo);
  assert.equal(new Set(escolhidos.map((p) => p.codigo)).size, escolhidos.length);
  assert.deepEqual(pedidosSemEmailDoPagamento([semEmail()], AGORA, 0), { escolhidos: [], fora: 1 });
});

test('nos arquivos: um por pedido, só os pagos desde a hora pedida, com o texto do histórico', () => {
  const voucher = (parcial: Partial<Reserva>) =>
    ({
      codigo: 'ON-UMA234',
      status: 'pago',
      atualizadaEm: antes(20 * MINUTO),
      pagamento: { metodo: 'cartao', pagoEm: antes(20 * MINUTO) },
      historico: [{ em: antes(20 * MINUTO), evento: 'Pago (webhook da Stripe)' }],
      ...parcial,
    }) as Reserva;
  const pedido = { codigo: 'ON-PED234', totalCentavos: 30800 };
  const reservas = [
    voucher({ codigo: 'ON-UMA234', pedido }),
    voucher({ codigo: 'ON-DUA234', pedido }),
    voucher({ codigo: 'ON-SOZ234' }),
    voucher({ codigo: 'ON-VEL234', pagamento: { metodo: 'pix', pagoEm: antes(50 * HORA) } }),
    voucher({ codigo: 'ON-REE234', status: 'reembolsado' }),
    voucher({ codigo: 'ON-SEM234', pagamento: { metodo: 'pix' } }),
    // o terceiro voucher de ON-PED234, cancelado à parte, com uma linha da equipe: entra na união do histórico
    voucher({ codigo: 'ON-TRE234', pedido, status: 'cancelado', historico: [{ em: antes(MINUTO), evento: 'Cancelado no painel' }] }),
  ];
  const lidos = pagosDasReservas(reservas, new Date(AGORA.getTime() - JANELA_DOS_PENDENTES_MS));
  assert.deepEqual(
    lidos.map((p) => p.codigo),
    ['ON-PED234', 'ON-SOZ234'],
  );
  assert.deepEqual(lidos[0].eventos, ['Pago (webhook da Stripe)', 'Cancelado no painel']);
  assert.equal(lidos[0].atualizadaEm, antes(20 * MINUTO));
  assert.deepEqual(
    pedidosSemEmailDoPagamento(lidos, AGORA).escolhidos.map((p) => p.codigo),
    ['ON-PED234', 'ON-SOZ234'],
  );
  // a linha do envio num voucher só (a cópia para o irmão falhou): o pedido inteiro já tem o e-mail
  const comMarca = pagosDasReservas(
    [
      voucher({ codigo: 'ON-UMA234', pedido }),
      voucher({ codigo: 'ON-DUA234', pedido, historico: [{ em: antes(19 * MINUTO), evento: MARCA_DO_EMAIL['pagamento-aprovado'] }] }),
    ],
    new Date(AGORA.getTime() - JANELA_DOS_PENDENTES_MS),
  );
  assert.equal(comMarca.length, 1);
  assert.equal(faltaOEmailDoPagamento(comMarca[0], AGORA), false);
});

test('o agendamento: protegido como os outros, a cada 15 minutos, pelo código de sempre e sem o aviso à Meta', () => {
  const rota = fonte('src', 'app', 'api', 'email', 'pendentes', 'route.ts');
  assert.match(
    rota,
    /export async function GET\(req: Request\) \{\s+if \(!chamadaDoAgendamento\(req\)\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\);/,
  );
  assert.match(rota, /import \{ chamadaDoAgendamento \} from '@\/lib\/admin-auth';/);
  assert.match(rota, /export const maxDuration = 60;/);
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: { path: string; schedule: string }[] };
  assert.deepEqual(
    config.crons?.find((c) => c.path === '/api/email/pendentes'),
    { path: '/api/email/pendentes', schedule: '*/15 * * * *' },
  );

  const rodada = fonte('src', 'lib', 'email', 'pendentes.ts');
  assert.match(rodada, /^import 'server-only';/);
  // sem a chave do Resend, nada é lido
  assert.ok(rodada.indexOf('if (!emailLigado())') < rodada.indexOf('await listarPagosDesde('));
  assert.match(rodada, /pedidosSemEmailDoPagamento\(pagos, agora, PENDENTES_POR_RODADA\)/);
  // o e-mail sai pelo código de sempre, que grava o aviso antes e não manda duas vezes
  assert.match(rodada, /await enviarEmailDoPedido\('pagamento-aprovado', p\.codigo\);/);
  assert.doesNotMatch(rodada, /avisarCompra|pedidoPago|agendarEmailDoPedido/);
  // uma linha por pedido e uma por rodada, com o mesmo começo
  assert.ok((rodada.match(/console\.(log|error)\(`\[emails-pendentes\] \$\{p\.codigo\}/g) ?? []).length >= 3);
  assert.match(rodada, /console\.log\(`\[emails-pendentes\] rodada \$\{JSON\.stringify\(resumo\)\}`\);/);

  // o envio que o agendamento usa grava o aviso ANTES do e-mail e confere a linha do envio (é o que impede o segundo)
  const envio = fonte('src', 'lib', 'email', 'pedidos.ts');
  assert.match(envio, /if \(tipo !== 'link-do-pedido' && r\.historico\.some\(\(h\) => h\.evento\.startsWith\(marca\)\)\) return;/);
  assert.match(envio, /case 'pagamento-aprovado': \{\s+await anotar\(r\.codigo, AVISO_EMAIL_PAGO_SAINDO\);/);
  assert.match(envio, /chave = `pagamento-aprovado\/\$\{pedido\}`;/);
  assert.match(envio, /case 'pagamento-aprovado':\s+return r\.status === 'pago';/);

  // no banco, a consulta estreita: o status pago e a última gravação, sem migração
  const reservas = fonte('src', 'lib', 'reservas.ts');
  const lista = reservas.slice(reservas.indexOf('export async function listarPagosDesde('));
  assert.match(
    lista,
    /'codigo, status, pago_em, atualizado_em, reativacao:pagamento->retido->decisao->>acao, reativado_em:pagamento->retido->decisao->>em, pedidos_historico\(evento\)',\s+\)\s+\.eq\('status', 'pago'\)\s+\.gte\('atualizado_em', desde\.toISOString\(\)\)/,
  );
  assert.match(lista, /return pagosDasReservas\(await principal\(\)\.listar\(\), desde\);/);

  // o caminho normal do pagamento não muda: aplicarSessao não sabe do agendamento
  assert.doesNotMatch(fonte('src', 'lib', 'pagamento-stripe.ts'), /emails-pendentes|enviarEmailsPendentes/);
});

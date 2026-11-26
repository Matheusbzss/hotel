import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CASAS_PARA_CADASTRAR, linhaDaCasa, type CasaParaCadastrar } from '../scripts/dados/casas.ts';
import { itemAgendado, itemDaSessao } from '../src/app/api/pedido/pedido-stripe.ts';
import { sugestoesDoCarrinho } from '../src/data/sugestoes.ts';
import { dicionario } from '../src/i18n/index.ts';
import { cobradoHoje, itensDaConta, temCasa, totaisDoCarrinho, type ItemVisivel } from '../src/lib/carrinho.ts';
import { detalhesDeLinha } from '../src/lib/casa-detalhes.ts';
import {
  SEM_CASAS,
  conferirCasa,
  conferirOPagarDeNovo,
  cruzaComAMesmaCasa,
  dataComDiaDaSemana,
  ehEscolhaCasa,
  limiteDaSaida,
  linhasDoItemDaCasa,
  noitesDaCasa,
  slugsDasCasas,
  type BloqueioLido,
  type CasaParaConta,
  type ContextoDasCasas,
} from '../src/lib/casa-no-carrinho.ts';
import { tabelaDaPagina } from '../src/lib/casa-pagina.ts';
import { contaEstadia, primeiraEntradaPossivel } from '../src/lib/estadia.ts';
import {
  cartaoDisponivel,
  limiteParaPagar,
  pixCabeNoLimite,
  pixDisponivel,
  valorACobrar,
  valorDoItem,
  type ItemCobravel,
} from '../src/lib/formas-pagamento.ts';
import { garantiasDoCheckout } from '../src/lib/garantias-checkout.ts';
import { agendaDoItem, decidirLembrete } from '../src/lib/lembretes.ts';
import { anotarValorRecebido } from '../src/lib/pagamento-stripe.ts';
import { quandoAcontece, recebidoDoPedido, valorEsperadoDoPedido, valorRecebido } from '../src/lib/pedidos-painel.ts';
import { modoReservaCasas, reservaCasasVale } from '../src/lib/reserva-casas.ts';
import { deLinhas, paraLinhas, type LinhasReserva } from '../src/lib/reservas-banco.ts';
import type { ReservaCasa, ReservaPasseio } from '../src/lib/reservas.ts';
import { parametrosDaSessao } from '../src/lib/stripe.ts';
import {
  avisoDasDatasNaoPresas,
  depoisDoNaoDeu,
  itensAPrender,
  prenderNoArquivo,
  type BloqueioNoArquivo,
} from '../src/lib/trava-das-casas.ts';

// A reserva completa das casas (Etapa 7, pacote 1, parte 1: o caminho do pedido de casa, do botão até o pagamento
// confirmado), nas regras que rodam sem banco e sem Next: a conferência da escolha com a mesma conta da página, o contexto,
// as decisões do dono de 26/11/2026, o carrinho e o checkout com o sinal, a ida e volta do banco, a sessão da Stripe com o
// sinal, o valor esperado do pagamento e a trava das datas. As travas que só dá para ver no código vêm no fim.

delete process.env.SUPABASE_URL;

const em = (dataHora: string) => new Date(`${dataHora}-03:00`);
/** Quinta, 26/11/2026, ao meio-dia em Búzios: a primeira entrada possível é sexta, 27/11. */
const AGORA = em('2026-11-26T12:00:00');

const FERRADURA_CADASTRO = CASAS_PARA_CADASTRAR.find((c) => c.slug === 'mansao-ferradura-vista-mar') as CasaParaCadastrar;
const GERIBA_CADASTRO = CASAS_PARA_CADASTRAR.find((c) => c.slug === 'mansao-geriba-vista-mar') as CasaParaCadastrar;

/** A casa como o site a lê (a linha do cadastro, os detalhes, os pacotes): é o que o contexto das casas leva. */
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
const GERIBA = comoNoSite(GERIBA_CADASTRO, '00000000-0000-4000-8000-000000000002');

/** O contexto como o servidor monta (src/lib/casas-carrinho.ts): as casas, as noites ocupadas e os itens do próprio pedido. */
function contexto(
  bloqueios: BloqueioLido[] = [],
  { aberta = true, proprios = [] as string[], casas = [FERRADURA, GERIBA] } = {},
): ContextoDasCasas {
  const meus = new Set(proprios);
  return {
    lido: true,
    aberta,
    casas: new Map(
      casas.map((casa) => [
        casa.slug,
        {
          casa,
          ...noitesDaCasa(
            bloqueios.filter((b) => b.casaId === casa.id),
            meus,
          ),
        },
      ]),
    ),
  };
}

const escolha = (entrada: string, saida: string, hospedes = 10, slug = FERRADURA.slug) => ({
  tipo: 'casa' as const,
  slug,
  entrada,
  saida,
  hospedes,
});

/* ------------------------------------------------------------------ */
/* A conferência da escolha: a mesma conta da página                   */

test('a casa no carrinho: a mesma conta da página (o total, o total no Pix e os dois sinais), sem a conta antiga', () => {
  // segunda 14/12 a quarta 16/12: 2 diárias de semana na Ferradura, o teste de R$ 900,00 no Pix (R$ 1.000,00 no cartão)
  const c = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(), AGORA);
  assert.ok(c.ok);
  const pagina = contaEstadia(tabelaDaPagina(FERRADURA), '2026-12-14', '2026-12-16', { hoje: primeiraEntradaPossivel(AGORA) });
  assert.deepEqual(
    [c.totalCentavos, c.totalPixCentavos, c.sinalCentavos, c.sinalPixCentavos, c.chegadaCentavos, c.chegadaPixCentavos],
    [
      pagina.totalCentavos,
      pagina.totalPixCentavos,
      pagina.sinalCentavos,
      pagina.sinalPixCentavos,
      pagina.chegadaCentavos,
      pagina.chegadaPixCentavos,
    ],
  );
  assert.deepEqual([c.totalCentavos, c.totalPixCentavos, c.sinalCentavos, c.sinalPixCentavos], [200000, 180000, 100000, 90000]);
  assert.equal(c.noites, 2);
  assert.deepEqual(c.linhas, [{ tipo: 'semana', noites: 2, diariaCentavos: 100000 }]);
  assert.deepEqual(c.escolha, escolha('2026-12-14', '2026-12-16'));
  // com o fim de semana inteiro (quinta a segunda), a Geribá: 2 de semana e 2 de sábado e domingo
  const g = conferirCasa(escolha('2026-12-10', '2026-12-14', 14, GERIBA.slug), contexto(), AGORA);
  assert.ok(g.ok);
  assert.equal(g.totalCentavos, 2 * 150000 + 2 * 180000);
  // o pacote inteiro do Natal (24 a 28/12): 4 diárias no preço do pacote
  const natal = conferirCasa(escolha('2026-12-24', '2026-12-28'), contexto(), AGORA);
  assert.ok(natal.ok);
  assert.equal(natal.totalCentavos, 4 * 150000);
  assert.equal(natal.linhas[0].tipo, 'pacote');
});

test('as recusas da casa: o motivo da conta, os hóspedes, a casa fora do ar, a reserva fechada e o contexto que não foi lido', () => {
  const ctx = contexto();
  // sábado a segunda, sem a sexta: o fim de semana anda junto (as recusas pelas noites levam as noites de agora: nenhuma)
  assert.deepEqual(conferirCasa(escolha('2026-12-12', '2026-12-14'), ctx, AGORA), { ok: false, erro: 'fim-de-semana', ocupadas: [] });
  // uma diária de semana: o mínimo é 2
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-15'), ctx, AGORA), { ok: false, erro: 'minimo', ocupadas: [] });
  // metade do Natal: o pacote vai inteiro
  assert.deepEqual(conferirCasa(escolha('2026-12-24', '2026-12-26'), ctx, AGORA), { ok: false, erro: 'pacote', ocupadas: [] });
  // a saída antes da entrada
  assert.deepEqual(conferirCasa(escolha('2026-12-16', '2026-12-14'), ctx, AGORA), { ok: false, erro: 'datas' });
  // os hóspedes: de 1 até a capacidade (12 na Ferradura, 14 na Geribá)
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-16', 13), ctx, AGORA), { ok: false, erro: 'hospedes' });
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-16', 0), ctx, AGORA), { ok: false, erro: 'hospedes' });
  assert.ok(conferirCasa(escolha('2026-12-14', '2026-12-16', 14, GERIBA.slug), ctx, AGORA).ok);
  // a casa que não está no contexto (não existe ou saiu do ar)
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-16', 2, 'casa-que-nao-existe'), ctx, AGORA), { ok: false, erro: 'slug' });
  // a reserva das casas fechada para este visitante (o interruptor ou o pagamento online)
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto([], { aberta: false }), AGORA), {
    ok: false,
    erro: 'casa-fechada',
  });
  // sem o contexto (quem esquecesse de ler): a casa é recusada, e nunca cobra errado
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-16'), SEM_CASAS, AGORA), { ok: false, erro: 'casa' });
});

test('decisão 1 do dono: a casa só se reserva para entrar a partir de amanhã, nunca no mesmo dia', () => {
  const ctx = contexto();
  // segunda 14/12 às 8h: a entrada de hoje não vende; a de amanhã (terça a quinta), sim
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-16'), ctx, em('2026-12-14T08:00:00')), { ok: false, erro: 'datas' });
  assert.ok(conferirCasa(escolha('2026-12-15', '2026-12-17'), ctx, em('2026-12-14T08:00:00')).ok);
  // domingo 13/12 até as 22h ainda vende a segunda; às 22h01, já não (o pedido novo pede 2 horas até a meia-noite)
  assert.ok(conferirCasa(escolha('2026-12-14', '2026-12-16'), ctx, em('2026-12-13T22:00:00')).ok);
  assert.deepEqual(conferirCasa(escolha('2026-12-14', '2026-12-16'), ctx, em('2026-12-13T22:01:00')), { ok: false, erro: 'datas' });
});

test('decisão 2 do dono: a saída vai até a do último pacote cadastrado; sem pacote, 12 meses à frente', () => {
  // os pacotes das duas casas acabam no da Proclamação da República, que sai em 16/11/2027
  assert.equal(limiteDaSaida(FERRADURA.pacotes, '2026-11-26'), '2027-11-16');
  assert.equal(limiteDaSaida(GERIBA.pacotes, '2026-11-26'), '2027-11-16');
  // o limite anda sozinho quando o dono cadastra um pacote novo
  const comNatal2027 = [...FERRADURA.pacotes, { ...FERRADURA.pacotes[0], entrada: '2027-12-24', saida: '2027-12-28' }];
  assert.equal(limiteDaSaida(comNatal2027, '2026-11-26'), '2027-12-28');
  // casa sem pacote: 12 meses depois de hoje (o 29 de fevereiro vira 1º de março)
  assert.equal(limiteDaSaida([], '2026-11-26'), '2027-11-26');
  assert.equal(limiteDaSaida([], '2028-02-29'), '2029-03-01');
  // a conferência: saída depois do limite não passa; até o limite, sim
  const ctx = contexto();
  assert.deepEqual(conferirCasa(escolha('2027-11-22', '2027-11-24'), ctx, AGORA), { ok: false, erro: 'fora-do-limite' });
  assert.ok(conferirCasa(escolha('2027-11-08', '2027-11-10'), ctx, AGORA).ok);
  const semPacote = { ...FERRADURA, pacotes: [] };
  const ctxSemPacote = contexto([], { casas: [semPacote] });
  assert.ok(conferirCasa(escolha('2027-11-22', '2027-11-24'), ctxSemPacote, AGORA).ok);
  assert.deepEqual(conferirCasa(escolha('2027-11-29', '2027-12-01'), ctxSemPacote, AGORA), { ok: false, erro: 'fora-do-limite' });
});

test('decisão 3 do dono: sem teto de noites (uma estadia de um mês passa)', () => {
  const c = conferirCasa(escolha('2027-01-04', '2027-02-04'), contexto(), AGORA);
  assert.ok(c.ok);
  assert.equal(c.noites, 31);
});

test('a noite ocupada: a recusa traz as noites de agora; as noites do próprio pedido são livres para o mesmo visitante', () => {
  const bloqueios: BloqueioLido[] = [
    // o bloqueio do dono (até a noite de 06/12) e a reserva do site do pedido do próprio carrinho (14 a 16/12)
    { casaId: FERRADURA.id, inicio: '2026-11-06', fim: '2026-12-07' },
    { casaId: FERRADURA.id, inicio: '2026-12-14', fim: '2026-12-16', itemPedidoId: 'item-do-carrinho' },
  ];
  // para outra pessoa, as noites do pedido estão ocupadas, e a recusa traz as noites de agora (do primeiro dia em diante)
  const outro = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(bloqueios), AGORA);
  assert.equal(outro.ok, false);
  assert.ok(!outro.ok && outro.erro === 'ocupada');
  assert.ok(!outro.ok && outro.ocupadas?.includes('2026-12-14') && outro.ocupadas.includes('2026-12-06'));
  assert.ok(!outro.ok && !outro.ocupadas?.includes('2026-11-26'), 'nada antes do primeiro dia de entrada');
  // para o dono do pedido (o item dele na lista), as mesmas noites são livres: a casa não some do carrinho dele
  const meu = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(bloqueios, { proprios: ['item-do-carrinho'] }), AGORA);
  assert.ok(meu.ok);
  // e o "Mudar" dele, de 10 para 12 hóspedes nas mesmas datas, também passa
  assert.ok(conferirCasa(escolha('2026-12-14', '2026-12-16', 12), contexto(bloqueios, { proprios: ['item-do-carrinho'] }), AGORA).ok);
  // as noites que voltam para a página da casa: as do pedido dele, sem as de outro bloqueio
  const { ocupadas, proprias } = noitesDaCasa(bloqueios, new Set(['item-do-carrinho']));
  assert.deepEqual(proprias, ['2026-12-14', '2026-12-15']);
  assert.ok(!ocupadas.has('2026-12-14'));
  assert.ok(ocupadas.has('2026-12-06') && !ocupadas.has('2026-12-07'), 'a noite da saída fica livre');
});

test('a mesma casa duas vezes com noites que se cruzam não passa; duas casas, ou a casa trocada de datas no "Mudar", sim', () => {
  const noCarrinho = [escolha('2026-12-14', '2026-12-17')];
  assert.equal(cruzaComAMesmaCasa(escolha('2026-12-16', '2026-12-18'), noCarrinho), true);
  // a saída de uma é a entrada da outra: não cruzam
  assert.equal(cruzaComAMesmaCasa(escolha('2026-12-17', '2026-12-19'), noCarrinho), false);
  // outra casa nas mesmas noites: pode
  assert.equal(cruzaComAMesmaCasa(escolha('2026-12-14', '2026-12-17', 10, GERIBA.slug), noCarrinho), false);
  // no "Mudar", a rota passa os OUTROS itens (sem o que está sendo trocado): a casa não se recusa a si mesma
  assert.equal(cruzaComAMesmaCasa(escolha('2026-12-15', '2026-12-18'), []), false);
});

test('o contexto só lê o banco com casa no carrinho: a escolha de casa pelo tipo e o slug', () => {
  assert.deepEqual(slugsDasCasas([{ tipo: 'passeio', slug: 'escuna-buzios' }, { tipo: 'transfer' }]), []);
  assert.deepEqual(
    slugsDasCasas([escolha('2026-12-14', '2026-12-16'), escolha('2026-12-20', '2026-12-22'), { tipo: 'casa', slug: GERIBA.slug }]),
    [FERRADURA.slug, GERIBA.slug],
  );
  assert.equal(ehEscolhaCasa(null), false);
  assert.equal(ehEscolhaCasa({ tipo: 'casa' }), false);
  assert.equal(SEM_CASAS.lido, false);
  assert.equal(SEM_CASAS.casas.size, 0);
});

test('o "Pagar de novo" de casa refaz a conta com a tabela de agora: igual segue; outra conta, mudou; noite tomada, datas', () => {
  const c = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(), AGORA);
  assert.ok(c.ok);
  const pedido = {
    casa: { slug: FERRADURA.slug },
    data: '2026-12-14',
    saida: '2026-12-16',
    hospedes: 10,
    totalCentavos: c.totalCentavos,
    totalPixCentavos: c.totalPixCentavos,
    sinalCentavos: c.sinalCentavos,
    sinalPixCentavos: c.sinalPixCentavos,
  };
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto(), AGORA), { ok: true });
  // a diária subiu depois do pedido
  const maisCara = { ...FERRADURA, diaria: 1200 };
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto([], { casas: [maisCara] }), AGORA), { ok: false, erro: 'mudou' });
  // a capacidade baixou
  assert.deepEqual(conferirOPagarDeNovo({ ...pedido, hospedes: 13 }, contexto(), AGORA), { ok: false, erro: 'mudou' });
  // outra pessoa pegou uma das noites
  const tomada = contexto([{ casaId: FERRADURA.id, inicio: '2026-12-15', fim: '2026-12-16', itemPedidoId: 'outro-item' }]);
  assert.deepEqual(conferirOPagarDeNovo(pedido, tomada, AGORA), { ok: false, erro: 'datas' });
  // a trava do próprio pedido (a troca de forma com o pedido pendente) não conta
  const minha = contexto([{ casaId: FERRADURA.id, inicio: '2026-12-14', fim: '2026-12-16', itemPedidoId: 'meu-item' }], {
    proprios: ['meu-item'],
  });
  assert.deepEqual(conferirOPagarDeNovo(pedido, minha, AGORA), { ok: true });
  // a reserva das casas desligada: nada é cancelado (o freio pode voltar)
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto([], { aberta: false }), AGORA), { ok: false, erro: 'casa-fechada' });
  // o pedido de entrada amanhã, pago tarde da noite: a conta passa (o prazo de pagar é das formas de pagamento)
  assert.deepEqual(conferirOPagarDeNovo(pedido, contexto(), em('2026-12-13T23:00:00')), { ok: true });
});

/* ------------------------------------------------------------------ */
/* O carrinho e o checkout                                             */

const PASSEIO_VISIVEL: ItemVisivel = {
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
const CASA_VISIVEL: ItemVisivel = {
  id: 'c1',
  tipo: 'casa',
  titulo: 'Mansão Ferradura Vista Mar',
  foto: '',
  detalhes: [],
  href: '/casas-de-temporada/mansao-ferradura-vista-mar?mudar=c1#reservar',
  totalCentavos: 200000,
  totalPixCentavos: 180000,
  escolha: escolha('2026-12-14', '2026-12-16'),
  casa: { noites: 2, hospedes: 10, sinalCentavos: 100000, sinalPixCentavos: 90000, chegadaCentavos: 100000, chegadaPixCentavos: 90000 },
};

test('o total do carrinho é o que se cobra hoje: o passeio inteiro mais o sinal da casa; só passeio, o número de antes', () => {
  assert.deepEqual(totaisDoCarrinho([PASSEIO_VISIVEL]), { totalCentavos: 15400, totalPixCentavos: 13860 });
  assert.deepEqual(totaisDoCarrinho([PASSEIO_VISIVEL, CASA_VISIVEL]), { totalCentavos: 15400 + 100000, totalPixCentavos: 13860 + 90000 });
  // a casa indisponível (alguém reservou enquanto ela estava no carrinho) fica fora da conta
  const indisponivel: ItemVisivel = { ...CASA_VISIVEL, totalCentavos: 0, totalPixCentavos: 0, casa: undefined, indisponivel: 'ocupada' };
  assert.deepEqual(totaisDoCarrinho([PASSEIO_VISIVEL, indisponivel]), { totalCentavos: 15400, totalPixCentavos: 13860 });
  assert.deepEqual(itensDaConta([PASSEIO_VISIVEL, indisponivel]), [PASSEIO_VISIVEL]);
  assert.equal(temCasa([PASSEIO_VISIVEL]), false);
  assert.equal(temCasa([PASSEIO_VISIVEL, indisponivel]), true);
});

test('o que o carrinho mostra que cobra hoje é o que a sessão da Stripe cobra (cobradoHoje e valorDoItem dão o mesmo número)', () => {
  for (const i of [PASSEIO_VISIVEL, CASA_VISIVEL]) {
    const cobravel: ItemCobravel = {
      tipo: i.tipo,
      totalCentavos: i.totalCentavos,
      totalPixCentavos: i.totalPixCentavos,
      ...(i.casa ? { sinalCentavos: i.casa.sinalCentavos, sinalPixCentavos: i.casa.sinalPixCentavos } : {}),
    };
    for (const forma of ['cartao', 'pix'] as const) assert.equal(cobradoHoje(i, forma), valorDoItem(cobravel, forma), `${i.id} ${forma}`);
  }
});

test('o sinal guardado na compra é o que se cobra; sem ele, a conta de 50% de sempre', () => {
  // o sinal guardado vale mesmo se a regra mudar um dia (a reserva antiga não muda)
  assert.equal(
    valorDoItem({ tipo: 'casa', totalCentavos: 200000, totalPixCentavos: 180000, sinalCentavos: 60000, sinalPixCentavos: 54000 }, 'cartao'),
    60000,
  );
  assert.equal(
    valorDoItem({ tipo: 'casa', totalCentavos: 200000, totalPixCentavos: 180000, sinalCentavos: 60000, sinalPixCentavos: 54000 }, 'pix'),
    54000,
  );
  assert.equal(valorDoItem({ tipo: 'casa', totalCentavos: 200000, totalPixCentavos: 180000 }, 'pix'), 90000);
  // o passeio e o transfer: o total, como sempre (o sinal nem é lido)
  assert.equal(valorDoItem({ tipo: 'passeio', totalCentavos: 15400, totalPixCentavos: 13860, sinalCentavos: 1 }, 'pix'), 13860);
  assert.equal(
    valorACobrar(
      [
        { tipo: 'passeio', totalCentavos: 15400, totalPixCentavos: 13860 },
        { tipo: 'casa', totalCentavos: 200000, totalPixCentavos: 180000, sinalCentavos: 100000, sinalPixCentavos: 90000 },
      ],
      'pix',
    ),
    13860 + 90000,
  );
  // o limite do Pix olha o sinal: a estadia de R$ 18.000 no Pix cabe, porque se paga hoje R$ 9.000
  assert.equal(
    pixCabeNoLimite([{ tipo: 'casa', totalCentavos: 2_000_000, totalPixCentavos: 1_800_000, sinalPixCentavos: 900_000 }], null),
    true,
  );
  assert.equal(pixCabeNoLimite([{ tipo: 'passeio', totalCentavos: 2_000_000, totalPixCentavos: 1_800_000 }], null), false);
});

test('a casa não se paga no dia da entrada: o prazo de pagar é a meia-noite que começa o dia da entrada', () => {
  const casa = itemAgendado(escolha('2026-12-14', '2026-12-16'));
  assert.deepEqual(casa, { tipo: 'casa', data: '2026-12-14' });
  assert.deepEqual(limiteParaPagar(casa), { data: '2026-12-14', hora: '00:00' });
  // o Pix até as 22h da véspera; o cartão até as 23h30 da véspera; no dia da entrada, nada
  assert.equal(pixDisponivel([casa], em('2026-12-13T22:00:00')), true);
  assert.equal(pixDisponivel([casa], em('2026-12-13T22:00:01')), false);
  assert.equal(cartaoDisponivel([casa], em('2026-12-13T23:30:00')), true);
  assert.equal(cartaoDisponivel([casa], em('2026-12-13T23:30:01')), false);
  assert.equal(cartaoDisponivel([casa], em('2026-12-14T09:00:00')), false);
  // num carrinho com passeio e casa, o prazo mais cedo decide (o do passeio das 9h da segunda é o mesmo de sempre)
  const passeio = itemAgendado(PASSEIO_VISIVEL.escolha);
  assert.equal(cartaoDisponivel([passeio], em('2026-12-15T08:30:00')), true);
  assert.equal(cartaoDisponivel([passeio, casa], em('2026-12-13T12:00:00')), true);
});

test('as linhas da casa no carrinho, nos quatro idiomas: as diárias com as datas, os hóspedes e o sinal de hoje', () => {
  const linhas = (idioma: 'pt' | 'es' | 'es-ar' | 'en', locale: string) => {
    const d = dicionario(idioma);
    return linhasDoItemDaCasa(
      escolha('2026-12-14', '2026-12-16', 12),
      idioma,
      locale,
      {
        ajusteResultado: d.casas.ajusteResultado,
        nDiarias: d.casas.nDiarias,
        umaDiaria: d.casas.umaDiaria,
        hospede: d.casas.linha.hospede,
        hospedes: d.casas.linha.hospedes,
        sinalHoje: d.carrinho.casaSinalHoje,
      },
      50,
    );
  };
  assert.deepEqual(linhas('pt', 'pt-BR'), [
    '2 diárias, de seg 14/12 a qua 16/12',
    '12 hóspedes',
    'Sinal de 50% hoje; o restante, na chegada',
  ]);
  assert.deepEqual(linhas('es', 'es-AR'), [
    '2 noches, del lun 14/12 al mié 16/12',
    '12 huéspedes',
    'Anticipo del 50% hoy; el resto, al llegar',
  ]);
  assert.deepEqual(linhas('es-ar', 'es-AR')[2], 'Seña del 50% hoy; el resto, al llegar');
  assert.deepEqual(linhas('en', 'en-US'), [
    '2 nights, Mon, Dec 14 to Wed, Dec 16',
    '12 guests',
    '50% deposit today; the balance on arrival',
  ]);
  assert.equal(dataComDiaDaSemana('2026-12-10', 'pt', 'pt-BR'), 'qui 10/12');
  // nenhum marcador sobrando nos textos novos, em nenhum idioma
  for (const idioma of ['pt', 'es', 'es-ar', 'en'] as const) {
    const d = dicionario(idioma);
    for (const t of [
      d.carrinho.aPagarHoje,
      d.carrinho.casaIndisponivel,
      d.carrinho.casaEsperando,
      d.checkout.casaSoNoSite,
      d.checkout.casaSoNoSiteComOutros,
    ]) {
      assert.ok(t.trim() && !/\{\w+\}/.test(t), `${idioma}: ${t}`);
    }
    assert.ok(d.checkout.umPagamentoComCasa.includes('{p}'), idioma);
    assert.ok(d.carrinho.casaTotalDaEstadia.includes('{pix}') && d.carrinho.casaTotalDaEstadia.includes('{cartao}'), idioma);
    assert.ok(d.casas.itemNaStripe.includes('{casa}') && d.casas.itemNaStripe.includes('{p}'), idioma);
  }
  // o es-ar usa a seña e o vos, sem "usted"; o es, o anticipo e o tú
  assert.equal(dicionario('es-ar').casas.itemNaStripe, '{casa}: seña del {p}%');
  assert.equal(dicionario('es').casas.itemNaStripe, '{casa}: anticipo del {p}%');
  assert.match(dicionario('es-ar').checkout.umPagamentoComCasa, /hoy pagás una seña/);
  assert.match(dicionario('es').checkout.umPagamentoComCasa, /hoy pagas un anticipo/);
});

test('as garantias com casa: as dos passeios e do transfer ficam à vista, numa parte só delas; sem casa, como sempre', () => {
  const frases = dicionario('pt').passeio.garantiasOnline;
  const pago = 'Pagamento seguro';
  const icones = (g: ReturnType<typeof garantiasDoCheckout>) => g.map(([i]) => i);
  // sem casa: o de sempre
  assert.deepEqual(icones(garantiasDoCheckout(frases, { temPasseio: true, voucherNaHora: true, pagoSeguro: pago })), [
    'cancelar',
    'chuva',
    'voucher',
    'pagamento',
  ]);
  // com casa: o cancelamento grátis em 24 h e o reembolso pela chuva não valem para a casa
  assert.deepEqual(icones(garantiasDoCheckout(frases, { temPasseio: true, voucherNaHora: true, pagoSeguro: pago, comCasa: true })), [
    'voucher',
    'pagamento',
  ]);
  // e vão para a parte dos passeios e do transfer do mesmo carrinho
  assert.deepEqual(icones(garantiasDoCheckout(frases, { temPasseio: true, voucherNaHora: false, soDosPasseios: true })), [
    'cancelar',
    'chuva',
  ]);
  assert.deepEqual(icones(garantiasDoCheckout(frases, { temPasseio: false, voucherNaHora: false, soDosPasseios: true })), ['cancelar']);
});

test('a casa não gera sugestão e não quebra as dos outros itens; os lembretes do carrinho com casa não lançam erro', () => {
  const casa = escolha('2026-12-14', '2026-12-16');
  assert.deepEqual(sugestoesDoCarrinho([casa]), []);
  assert.deepEqual(sugestoesDoCarrinho([casa, PASSEIO_VISIVEL.escolha]), sugestoesDoCarrinho([PASSEIO_VISIVEL.escolha]));
  assert.deepEqual(agendaDoItem(casa), { tipo: 'casa', data: '2026-12-14' });
  const decisao = decidirLembrete(
    {
      email: 'teste@exemplo.com',
      itens: [{ escolha: casa }, { escolha: PASSEIO_VISIVEL.escolha }],
      atualizadoEm: '2026-11-26T12:00:00.000Z',
    },
    em('2026-11-26T14:00:00'),
    { descadastrado: false },
  );
  assert.deepEqual(decisao, { lembrete: 1 });
});

test('o interruptor RESERVA_CASAS: desligado sem a variável; admin só para o admin; nunca sem o pagamento online', () => {
  assert.equal(modoReservaCasas(undefined), 'desligado');
  assert.equal(modoReservaCasas(''), 'desligado');
  assert.equal(modoReservaCasas('sim'), 'desligado');
  assert.equal(modoReservaCasas('admin'), 'admin');
  assert.equal(modoReservaCasas(' publico '), 'publico');
  assert.equal(reservaCasasVale('desligado', true, true), false);
  assert.equal(reservaCasasVale('admin', false, true), false);
  assert.equal(reservaCasasVale('admin', true, true), true);
  assert.equal(reservaCasasVale('publico', false, true), true);
  // o freio do pagamento online fecha a casa junto
  assert.equal(reservaCasasVale('publico', false, false), false);
  assert.equal(reservaCasasVale('admin', true, false), false);
});

/* ------------------------------------------------------------------ */
/* O pedido: o banco, a sessão da Stripe e o valor esperado            */

const RESERVA_CASA: ReservaCasa = {
  codigo: 'ON-CASA01',
  token: 'token-de-teste',
  criadaEm: '2026-11-26T15:00:00.000Z',
  atualizadaEm: '2026-11-26T15:05:00.000Z',
  idioma: 'es-ar',
  status: 'pendente',
  provedor: 'stripe',
  pagamentoExternoId: 'cs_test_casa',
  data: '2026-12-14',
  totalCentavos: 200000,
  totalPixCentavos: 180000,
  cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+54 911' },
  pagamento: { metodo: 'pix', cobrar: { cartao: 100000, pix: 90000 } },
  historico: [{ em: '2026-11-26T15:00:00.000Z', evento: 'Reserva criada' }],
  tipo: 'casa',
  casa: { id: FERRADURA.id, slug: FERRADURA.slug, nome: 'Mansão Ferradura Vista Mar', cidade: 'buzios' },
  saida: '2026-12-16',
  hospedes: 10,
  sinalCentavos: 100000,
  sinalPixCentavos: 90000,
  linhas: [{ tipo: 'semana', noites: 2, diariaCentavos: 100000 }],
};

/** O caminho de verdade: JSON até o banco (jsonb) e as datas como o Postgres devolve. */
function peloBanco(l: LinhasReserva): LinhasReserva {
  const volta = JSON.parse(JSON.stringify(l)) as LinhasReserva;
  const comoPostgres = (t: string) => t.replace('T', ' ').replace(/\.000Z$/, '+00');
  volta.pedido.criado_em = comoPostgres(volta.pedido.criado_em);
  volta.pedido.atualizado_em = comoPostgres(volta.pedido.atualizado_em);
  volta.historico = volta.historico.map((h) => ({ ...h, em: comoPostgres(h.em) }));
  return volta;
}

test('a casa vai ao banco e volta igual: a saída, o sinal das duas formas e as linhas da conta, em toda gravação', () => {
  const l = paraLinhas(RESERVA_CASA);
  assert.equal(l.item.tipo, 'casa');
  assert.equal(l.item.data, '2026-12-14');
  assert.equal(l.item.data_fim, '2026-12-16');
  assert.equal(l.item.sinal_centavos, 100000);
  assert.equal(l.item.horario, null);
  assert.equal(l.item.produto_slug, FERRADURA.slug);
  assert.deepEqual(l.item.pessoas, { hospedes: 10 });
  assert.deepEqual(l.item.detalhes, { casaId: FERRADURA.id, sinalPixCentavos: 90000, linhas: RESERVA_CASA.linhas });
  // as linhas vão completas: atualizar_reserva regrava data_fim, sinal_centavos e detalhes a cada gravação
  assert.equal(Object.keys(l.pedido).length, 27);
  assert.equal(Object.keys(l.item).length, 18);
  for (const [coluna, valor] of Object.entries({ ...l.pedido, ...l.item })) assert.notEqual(valor, undefined, coluna);
  assert.deepEqual(
    deLinhas(...(Object.values(peloBanco(l)) as [LinhasReserva['pedido'], LinhasReserva['item'], LinhasReserva['historico']])),
    RESERVA_CASA,
  );
  // o que o pedido cobra hoje vai junto, no JSON do pagamento
  assert.deepEqual((l.pedido.pagamento as { cobrar?: unknown }).cobrar, { cartao: 100000, pix: 90000 });
});

test('num pedido com casa e passeio, a casa volta igual, com o preço dela no Pix', () => {
  const noPedido: ReservaCasa = {
    ...RESERVA_CASA,
    codigo: 'ON-CASA02',
    pedido: { codigo: 'ON-PEDID1', totalCentavos: 215400, totalPixCentavos: 193860 },
    pagamento: { metodo: 'cartao', cobrar: { cartao: 115400, pix: 103860 } },
  };
  const l = peloBanco(paraLinhas(noPedido));
  assert.equal(l.pedido.codigo, 'ON-PEDID1');
  assert.equal((l.item.detalhes as { pixCentavos?: number }).pixCentavos, 180000);
  assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), noPedido);
});

test('o que entrou e o que o pedido esperava: na casa, o sinal; no pedido de sempre, sem `cobrar`, o mesmo de antes', () => {
  // a casa paga no Pix: entrou o sinal no Pix, e o pedido esperava o mesmo (sem o falso aviso de valor diferente)
  assert.equal(valorRecebido(RESERVA_CASA), 90000);
  assert.equal(valorEsperadoDoPedido(RESERVA_CASA), 90000);
  assert.equal(valorEsperadoDoPedido({ ...RESERVA_CASA, pagamento: { ...RESERVA_CASA.pagamento, metodo: 'cartao' } }), 100000);
  assert.equal(anotarValorRecebido(structuredClone(RESERVA_CASA), 90000), undefined);
  // um valor diferente do sinal continua avisando a equipe
  const outro = structuredClone(RESERVA_CASA);
  assert.match(anotarValorRecebido(outro, 180000) ?? '', /^Aviso: a Stripe recebeu R\$\s1\.800,00 e o pedido esperava R\$\s900,00/);
  // o pedido de passeio de antes (sem `cobrar`): o total, como sempre
  const passeio = {
    ...RESERVA_CASA,
    tipo: 'passeio',
    totalCentavos: 15400,
    totalPixCentavos: 13860,
    pagamento: { metodo: 'pix' },
  } as unknown as ReservaPasseio;
  assert.equal(valorEsperadoDoPedido(passeio), 13860);
  assert.equal(valorRecebido(passeio), 13860);
  // casa e passeio no mesmo pedido: o que entrou é o sinal mais o passeio
  const casaNoPedido: ReservaCasa = { ...RESERVA_CASA, pagamento: { metodo: 'pix', cobrar: { cartao: 115400, pix: 103860 } } };
  assert.equal(recebidoDoPedido([casaNoPedido, { ...passeio, pagamento: casaNoPedido.pagamento } as ReservaPasseio]), 90000 + 13860);
  // a casa entra na ordem da viagem pela entrada das 15h
  assert.equal(quandoAcontece(RESERVA_CASA), '2026-12-14 15:00');
});

test('a sessão da Stripe cobra só o sinal, com o nome "casa: sinal de 50%" e a linha das diárias e dos hóspedes', () => {
  const item = itemDaSessao(
    RESERVA_CASA,
    {
      passeioNome: 'Mansão Ferradura Vista Mar',
      data: '2026-12-14',
      pessoasTexto: '10 huéspedes',
      casa: {
        entrada: '2026-12-14',
        saida: '2026-12-16',
        noites: 2,
        hospedes: 10,
        periodo: '2 noches, del lun 14/12 al mié 16/12',
        nomeDoSinal: 'Mansão Ferradura Vista Mar: seña del 50%',
        totalCentavos: 200000,
        totalPixCentavos: 180000,
        sinalCentavos: 100000,
        sinalPixCentavos: 90000,
        chegadaCentavos: 100000,
        chegadaPixCentavos: 90000,
      },
    },
    'es-ar',
    '{data}, {hora}',
  );
  assert.equal(item.nome, 'Mansão Ferradura Vista Mar: seña del 50%');
  assert.equal(item.descricao, '2 noches, del lun 14/12 al mié 16/12 · 10 huéspedes');
  assert.equal(item.tipo, 'casa');
  assert.equal(item.data, '2026-12-14');
  for (const [forma, sinal] of [
    ['pix', 90000],
    ['cartao', 100000],
  ] as const) {
    const p = parametrosDaSessao({
      pedido: { codigo: 'ON-CASA01', email: 'teste@exemplo.com' },
      itens: [item],
      forma,
      idioma: 'es-ar',
      returnUrl: 'https://orlanativa.online/es-ar/reserva/ON-CASA01?t=x',
      tentativa: 1,
      agora: AGORA,
    });
    assert.equal(p.line_items?.[0]?.price_data?.unit_amount, sinal, forma);
    assert.equal(p.line_items?.[0]?.price_data?.product_data?.name, 'Mansão Ferradura Vista Mar: seña del 50%');
  }
});

/* ------------------------------------------------------------------ */
/* A trava das datas                                                   */

test('prender as datas depois de renomear pelo item: o que voltou já está preso; o resto é preso de novo', () => {
  const itens = [
    { itemPedidoId: 'a', casaId: FERRADURA.id, inicio: '2026-12-14', fim: '2026-12-16' },
    { itemPedidoId: 'b', casaId: GERIBA.id, inicio: '2026-12-14', fim: '2026-12-16' },
  ];
  // os dois bloqueios voltaram na renomeação: nada a prender
  assert.deepEqual(itensAPrender(itens, ['a', 'b']), []);
  // o aviso de sessão vencida apagou o de 'b' no meio do caminho: só ele é preso de novo (furo 1 da crítica)
  assert.deepEqual(itensAPrender(itens, ['a']), [itens[1]]);
  // o pedido vencido (as datas já tinham saído): os dois
  assert.deepEqual(itensAPrender(itens, []), itens);
  // a função do banco disse que não deu: com o bloqueio do item já gravado por outro toque do mesmo cliente, é sucesso
  // (os dois toques no "Pagar de novo" levam a mesma sessão: furo 7); faltando algum, as noites são de outra pessoa
  assert.equal(depoisDoNaoDeu(itens, ['a', 'b']), 'presas');
  assert.equal(depoisDoNaoDeu(itens, ['a']), 'ocupadas');
  assert.equal(depoisDoNaoDeu(itens, []), 'ocupadas');
});

test('a trava no arquivo do computador: confere os bloqueios da casa e os do site, e grava tudo ou nada', () => {
  let n = 0;
  const novoId = () => `id-${++n}`;
  const daCasa = (id: string) => (id === FERRADURA.id ? [{ inicio: '2026-11-06', fim: '2026-12-07' }] : []);
  const estadia = { itemPedidoId: 'ON-CASA01', casaId: FERRADURA.id, inicio: '2026-12-14', fim: '2026-12-16' };
  const presa = prenderNoArquivo([], daCasa, [estadia], 'cs_1', novoId);
  assert.deepEqual(presa, [{ ...estadia, id: 'id-1', referencia: 'cs_1' }]);
  const atuais = presa as BloqueioNoArquivo[];
  // as mesmas noites para outra pessoa: não dá, e nada muda
  assert.equal(
    prenderNoArquivo(atuais, daCasa, [{ ...estadia, itemPedidoId: 'ON-OUTRO1', inicio: '2026-12-15', fim: '2026-12-17' }], 'cs_2', novoId),
    null,
  );
  // por cima do bloqueio do dono: não dá
  assert.equal(
    prenderNoArquivo(atuais, daCasa, [{ ...estadia, itemPedidoId: 'ON-OUTRO1', inicio: '2026-12-05', fim: '2026-12-09' }], 'cs_2', novoId),
    null,
  );
  // a saída de um é a entrada do outro, e outra casa nas mesmas noites: pode
  assert.ok(
    prenderNoArquivo(atuais, daCasa, [{ ...estadia, itemPedidoId: 'ON-OUTRO1', inicio: '2026-12-16', fim: '2026-12-18' }], 'cs_2', novoId),
  );
  assert.ok(prenderNoArquivo(atuais, daCasa, [{ ...estadia, itemPedidoId: 'ON-OUTRO1', casaId: GERIBA.id }], 'cs_2', novoId));
  // tudo ou nada: duas estadias do mesmo pedido na mesma casa e nas mesmas noites, nenhuma entra
  assert.equal(prenderNoArquivo([], daCasa, [estadia, { ...estadia, itemPedidoId: 'ON-CASA02' }], 'cs_3', novoId), null);
  assert.throws(() => prenderNoArquivo([], daCasa, [estadia], ' ', novoId));
});

test('o aviso do pedido pago sem as datas presas: uma linha de "Aviso:", só para a equipe, com a casa, as datas e o voucher', () => {
  const linha = avisoDasDatasNaoPresas(RESERVA_CASA);
  assert.match(
    linha,
    /^Aviso: as datas da casa Mansão Ferradura Vista Mar \(entrada 14\/12\/2026, saída 16\/12\/2026, voucher ON-CASA01\)/,
  );
  assert.match(linha, /Conferir o calendário da casa no painel/);
});

/* ------------------------------------------------------------------ */
/* As travas que só dá para ver no código                              */

/** O código de um arquivo, sem as linhas de comentário. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join(...partes), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

/** Sem espaços nem vírgulas finais: o mesmo trecho, quebrado ou não em várias linhas pelo formatador, compara igual. */
const semEspaco = (s: string) => s.replace(/\s+/g, '').replace(/,([)\]}])/g, '$1');
/** O trecho está no código (comparado sem espaços). */
const tem = (fonte: string, trecho: string) => assert.ok(semEspaco(fonte).includes(semEspaco(trecho)), trecho);
/** Onde o trecho começa no código sem espaços (-1 se não estiver). */
const onde = (fonte: string, trecho: string) => semEspaco(fonte).indexOf(semEspaco(trecho));

/** Os arquivos de código de uma pasta. */
function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho.split(path.sep).join('/')] : [];
  });
}

test('o calendário das casas só é refeito nas rotas, nunca durante a renderização (nem em src/lib/pagamento-stripe.ts)', () => {
  const chamam = arquivos('src').filter((a) => /\bcalendarioMudou\(\)/.test(codigo(a)));
  assert.ok(chamam.length >= 4, String(chamam));
  for (const a of chamam) {
    // a definição mora em src/lib/casas.ts; quem chama é uma rota (route.ts)
    assert.ok(a === 'src/lib/casas.ts' || /\/route\.ts$/.test(a), `${a} chama calendarioMudou fora de uma rota`);
  }
  assert.doesNotMatch(codigo('src', 'lib', 'pagamento-stripe.ts'), /calendarioMudou|revalidateTag|conferirDatasDoPedidoPago/);
  assert.doesNotMatch(codigo('src', 'app', 'api', 'pedido', 'pedido-stripe.ts'), /calendarioMudou|revalidateTag/);
  // e a conferência das datas na virada para pago fica no aviso da Stripe
  const webhook = codigo('src', 'app', 'api', 'webhooks', 'stripe', 'route.ts');
  tem(
    webhook,
    "corrente && pagaDoPedido && reserva.status === 'pago' && reserva.pagamento.cobrar ? await conferirAsDatasDaCasa(reserva, sessao.id) : ''",
  );
  tem(webhook, 'const { prendeu, semTrava } = await conferirDatasDoPedidoPago(vouchers, sessaoId);');
});

test('o contexto das casas é obrigatório em todo lugar que confere o carrinho, e a POST lê o carrinho antes de conferir', () => {
  const carrinho = codigo('src', 'lib', 'carrinho-servidor.ts');
  tem(carrinho, 'export function conferirEscolha(bruta: unknown, contexto: ContextoDasCasas, agora: Date = new Date()): Conferida {');
  tem(carrinho, 'export const itensQueValem = (itens: ItemCarrinho[], contexto: ContextoDasCasas, agora?: Date) =>');
  tem(carrinho, 'export function itemVisivel(item: ItemCarrinho, idioma: Idioma, d: Dicionario, contexto: ContextoDasCasas, agora?: Date)');
  tem(carrinho, 'export function itensVisiveis(itens: ItemCarrinho[], idioma: Idioma, d: Dicionario, contexto: ContextoDasCasas)');
  tem(carrinho, 'export function sugestoesVisiveis(itens: ItemCarrinho[], idioma: Idioma, d: Dicionario, contexto: ContextoDasCasas,');
  // a casa recusada por noite ocupada, ou com a reserva das casas fechada, fica no carrinho (indisponível), e não some calada;
  // desde o pacote 2, também a que mudou e a que saiu do ar (essa, só enquanto o painel tem o nome dela)
  tem(carrinho, 'const motivo = motivoDaCasaIndisponivel(c);');
  tem(carrinho, "if (motivo === 'fora-do-ar') return i.escolha.tipo === 'casa' && Boolean(contexto.foraDoAr?.has(i.escolha.slug));");
  tem(carrinho, 'return c.ok || motivo !== undefined;');
  const rota = codigo('src', 'app', 'api', 'carrinho', 'route.ts');
  const post = rota.slice(rota.indexOf('export async function POST('));
  const leitura = onde(post, 'const guardado = await lerCarrinho(cookie);');
  const contexto = onde(post, 'const contexto = await contextoDoCarrinho(guardado, { admin: ehAdmin(loja), nova: corpo?.escolha });');
  const conferencia = onde(post, 'const conferida = conferirEscolha(corpo?.escolha, contexto);');
  assert.ok(leitura > 0 && leitura < contexto && contexto < conferencia, `${leitura} ${contexto} ${conferencia}`);
  // a mesma casa trocada de datas não se recusa a si mesma: os outros itens, sem o que está sendo trocado
  tem(post, 'const outros = atuais.filter((i) => i.id !== corpo?.substituir);');
  tem(post, "if (conferida.escolha.tipo === 'casa' && cruzaComAMesmaCasa(conferida.escolha, outros.map((i) => i.escolha)))");
  // o pedido: 409 'datas' quando a casa cai por noite ocupada, e nunca o caminho do WhatsApp para a casa
  const pedido = codigo('src', 'app', 'api', 'pedido', 'route.ts');
  tem(pedido, "if (todas.some(({ c }) => casaOcupada(c))) return erro('datas', 409);");
  tem(pedido, "if (temCasa && !forma) return erro('casa-so-online', 403);");
  tem(pedido, 'for (const n of novas) n.pagamento = { ...n.pagamento, cobrar };');
  tem(pedido, "if (await pedidoDeCasaEsperando(dados.cliente.email, carrinho.pedido?.codigo)) return erro('casa-esperando', 409);");
});

test('as datas presas com a sessão nova: pelo item do pedido, qualquer erro fecha a sessão, e o cancelamento grava antes de fechar', () => {
  const fonte = codigo('src', 'app', 'api', 'pedido', 'pedido-stripe.ts');
  const inicio = fonte.indexOf('export async function abrirSessaoDoPedido(');
  const corpo = fonte.slice(inicio, fonte.indexOf('\n}\n', inicio));
  const pos = (trecho: string) => {
    const i = onde(corpo, trecho);
    assert.notEqual(i, -1, trecho);
    return i;
  };
  const ordem = [
    pos("const aberta = depois.findLast((d) => d.estado === 'aberta');"),
    pos('temCasa = await prenderDatasDoPedido(vouchers, sessao.id);'),
    pos('const cancelado = await cancelarPedidoAberto(codigo, EVENTO_DATAS_OCUPADAS)'),
    pos('throw new DatasDaCasaOcupadas(codigo);'),
    pos('throw new DatasNaoPresas(codigo);'),
    pos('return { codigo, sessaoId: sessao.id, clientSecret: sessao.client_secret, forma };'),
  ];
  assert.deepEqual(
    [...ordem].sort((a, b) => a - b),
    ordem,
  );
  // o cancelamento (que grava o pedido como cancelado) vem antes de a sessão nova fechar: furo 14 da crítica
  const ocupadas = corpo.slice(
    corpo.indexOf('if (e instanceof DatasIndisponiveis) {'),
    corpo.indexOf('throw new DatasDaCasaOcupadas(codigo);'),
  );
  assert.ok(
    ocupadas.indexOf('cancelarPedidoAberto(') > 0 && ocupadas.indexOf('cancelarPedidoAberto(') < ocupadas.indexOf('await fecharNova();'),
  );
  // o erro do banco: o pedido cancelado ou vencido ANTES de a nova fechar, e a nova nunca chega ao cliente
  const banco = corpo.slice(corpo.indexOf("if (seATravaFalhar === 'cancelar') {"), corpo.indexOf('throw new DatasNaoPresas(codigo);'));
  assert.ok(banco.indexOf('voltarAVencido(') > 0 && banco.indexOf('voltarAVencido(') < banco.indexOf('await fecharNova();'));
  assert.equal(corpo.match(/clientSecret: sessao\.client_secret/g)?.length, 1);
  // a troca pela referência da sessão anterior saiu: é pelo item do pedido, conferindo as linhas que voltaram
  assert.doesNotMatch(fonte, /renomearBloqueiosDaSessao/);
  const pedidoCarrinho = codigo('src', 'lib', 'pedido-carrinho.ts');
  tem(pedidoCarrinho, ".update({ referencia: sessaoId }).eq('origem', 'site').in('item_pedido_id', [...itens]).select('item_pedido_id')");
  tem(pedidoCarrinho, 'const faltam = itensAPrender(estadias, await renomearPeloItem(estadias.map((e) => e.itemPedidoId), sessaoId));');
  tem(pedidoCarrinho, 'await bloquearCasasDoPedido(faltam.map(paraATrava), sessaoId);');
  // as rotas: o primeiro pagamento cancela; o "Pagar de novo" volta a vencido; as duas respondem 409 'datas' e 503 'banco'
  const pedido = codigo('src', 'app', 'api', 'pedido', 'route.ts');
  tem(pedido, "abrirSessaoDoPedido(await vouchersDoPedido(pedido.codigo), forma, agora, { seATravaFalhar: 'cancelar' })");
  tem(pedido, "if (err instanceof DatasDaCasaOcupadas) return erro('datas', 409);");
  tem(pedido, "if (err instanceof DatasNaoPresas) return erro('banco', 503);");
  const pagar = codigo('src', 'app', 'api', 'pedido', '[codigo]', 'pagar', 'route.ts');
  tem(pagar, "abrirSessaoDoPedido(vouchers, r.data.forma, agora, { seATravaFalhar: 'vencer' })");
  tem(pagar, "if (e instanceof DatasDaCasaOcupadas) return erro('datas', 409, { status: 'cancelado' });");
  tem(pagar, 'const conferencia = conferirOPagarDeNovo(casa, contexto, agora);');
});

test('a página da casa: o botão põe a casa no carrinho e abre o checkout, e a página de "reservar" não existe', () => {
  assert.doesNotMatch(codigo('src', 'data', 'casas.ts'), /RESERVA_CASAS_ABERTA/);
  const pagina = codigo('src', 'app', '[locale]', 'casas-de-temporada', '[slug]', 'page.tsx');
  assert.doesNotMatch(pagina, /\/reservar/);
  tem(pagina, 'const reservaAberta = await casasAbertasPara({ admin: false }).catch(() => false);');
  tem(pagina, 'const ultimaSaida = limiteDaSaida(c.pacotes, hojeEmBuzios());');
  const quadro = codigo('src', 'components', 'casas', 'ReservaCasa.tsx');
  tem(quadro, "{ tipo: 'casa', slug, entrada, saida, hospedes }, { abrir: false, ...(mudando ? { substituir: mudando } : {}) })");
  tem(quadro, 'router.push(hrefCheckout);');
  tem(quadro, 'const aberta = casasAbertas ?? reservaAberta;');
  // o valor do evento do Pixel é o que se cobra hoje: o sinal
  tem(quadro, 'value: conta.sinalCentavos / 100,');
});

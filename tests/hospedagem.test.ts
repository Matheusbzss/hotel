import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dicionario } from '../src/i18n/index.ts';
import {
  LINHA_DO_HOTEL_INFORMADO,
  MAXIMO_NOME_DO_HOTEL,
  hospedagemDoCheckout,
  hotelDoPainel,
  hotelJaInformado,
  nomeDoHotel,
  passoDoHotel,
} from '../src/lib/hospedagem.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('o hotel continua obrigatório, a não ser que o cliente marque "Ainda não sei" (opção D2-A, 25/11)', () => {
  assert.deepEqual(hospedagemDoCheckout({ cidade: 'buzios', hotel: '  Pousada do Sol  ' }), { cidade: 'buzios', hotel: 'Pousada do Sol' });
  assert.equal(hospedagemDoCheckout({ cidade: 'buzios', hotel: '' }), null);
  assert.equal(hospedagemDoCheckout({ cidade: 'buzios', hotel: '   ', aInformar: false }), null);
  assert.deepEqual(hospedagemDoCheckout({ cidade: 'cabo-frio', hotel: '', aInformar: true }), {
    cidade: 'cabo-frio',
    hotel: '',
    aInformar: true,
  });
  // o nome digitado antes de marcar não vai pela metade
  assert.deepEqual(hospedagemDoCheckout({ cidade: 'buzios', hotel: 'Pous', aInformar: true }), {
    cidade: 'buzios',
    hotel: '',
    aInformar: true,
  });
});

test('o hotel "a informar" aparece com o texto de cada idioma, e o nome digitado aparece como sempre', () => {
  const esperado = { pt: 'A informar', es: 'Por confirmar', 'es-ar': 'Por confirmar', en: 'To be confirmed' } as const;
  for (const idioma of ['pt', 'es', 'es-ar', 'en'] as const) {
    const d = dicionario(idioma);
    assert.equal(nomeDoHotel({ hotel: '', aInformar: true }, d.reserva.hotelAInformar), esperado[idioma], idioma);
    assert.equal(nomeDoHotel({ hotel: 'Pousada do Sol' }, d.reserva.hotelAInformar), 'Pousada do Sol', idioma);
    assert.ok(d.checkout.hotelNaoSei.length > 0, idioma);
    assert.match(d.checkout.hotelNaoSeiAjuda, /WhatsApp/, idioma);
  }
  assert.equal(dicionario('es-ar').checkout.hotelNaoSei, 'Todavía no lo sé');
  assert.equal(dicionario('pt').checkout.hotelNaoSei, 'Ainda não sei');
  assert.equal(dicionario('en').checkout.hotelNaoSei, 'I don’t know yet');
});

test('o servidor, o checkout, o voucher, a página do pedido e o painel usam a mesma regra', () => {
  const api = ler('src/app/api/pedido/route.ts');
  assert.match(api, /hospedagemDoCheckout\(e\.hospedagem\)/);
  assert.match(api, /if \(hospedagem === null\) return erro\('hospedagem\.hotel'\)/);
  assert.match(api, /if \('passeio' in c && !hospedagem\) return erro\('hospedagem'\)/);
  const form = ler('src/components/carrinho/FormularioCarrinho.tsx');
  assert.match(form, /if \(!hotelAInformar && hotel\.trim\(\)\.length < 2\) e\.hotel = C\.erros\.obrigatorio;/);
  assert.match(form, /hotelAInformar\s+\? \{ cidade: cidadeHosp, hotel: '', aInformar: true \}/);
  assert.equal(ler('src/lib/pdf-voucher.ts').match(/nomeDoHotel\(reserva\.hospedagem, d\.reserva\.hotelAInformar\)/g)?.length, 2);
  assert.match(ler('src/lib/reserva-publica.ts'), /hotel: nomeDoHotel\(r\.hospedagem, d\.reserva\.hotelAInformar\)/);
  const painel = ler('src/app/admin/page.tsx');
  assert.match(painel, /r\.hospedagem\.aInformar \?/);
  assert.match(painel, /pedir pelo WhatsApp antes do passeio/);
});

test('o hotel gravado depois no painel (Pacote 29): limpo, até 120 letras, só na hospedagem a informar', () => {
  assert.equal(hotelDoPainel('  Pousada   do\nSol  '), 'Pousada do Sol');
  assert.equal(hotelDoPainel('Pousada\tdo Sol'), 'Pousada do Sol');
  assert.equal(hotelDoPainel(''), '');
  assert.equal(hotelDoPainel('   '), '');
  assert.equal(hotelDoPainel(null), '');
  assert.equal(hotelDoPainel('x'.repeat(MAXIMO_NOME_DO_HOTEL)), 'x'.repeat(MAXIMO_NOME_DO_HOTEL));
  // comprido demais volta vazio (erro no painel), nunca cortado sem a equipe ver
  assert.equal(hotelDoPainel('x'.repeat(MAXIMO_NOME_DO_HOTEL + 1)), '');
});

test('gravar o hotel num passeio (Pacote 29, revisão): decidido com o passeio relido, uma linha só, o segundo toque sem erro', () => {
  const aInformar = { cidade: 'buzios' as const, hotel: '', aInformar: true as const };
  const linha = `${LINHA_DO_HOTEL_INFORMADO}: Pousada do Sol`;
  assert.equal(linha, 'Hotel informado no painel: Pousada do Sol');
  // o primeiro passeio do pedido: grava o hotel, na cidade do checkout, com a linha
  assert.deepEqual(passoDoHotel(aInformar, [{ evento: 'Reserva criada' }], 'Pousada do Sol'), {
    tipo: 'gravar',
    hospedagem: { cidade: 'buzios', hotel: 'Pousada do Sol' },
    linha,
  });
  // o segundo passeio do mesmo pedido (o histórico do pedido já tem a linha): grava o hotel, sem outra linha
  assert.deepEqual(passoDoHotel(aInformar, [{ evento: 'Reserva criada' }, { evento: linha }], 'Pousada do Sol'), {
    tipo: 'gravar',
    hospedagem: { cidade: 'buzios', hotel: 'Pousada do Sol' },
  });
  // o duplo clique: a segunda requisição relê o passeio já gravado com o mesmo hotel e volta como deu certo
  assert.deepEqual(passoDoHotel({ cidade: 'buzios', hotel: 'Pousada do Sol' }, [{ evento: linha }], 'Pousada do Sol'), { tipo: 'ja-estava' });
  // outro hotel já gravado no passeio (outra pessoa da equipe, no meio-tempo): nada muda e a rota avisa (segunda revisão)
  assert.deepEqual(passoDoHotel({ cidade: 'buzios', hotel: 'Outra' }, [], 'Pousada do Sol'), { tipo: 'outro-hotel' });
  // sem nome: não vale
  assert.deepEqual(passoDoHotel(aInformar, [], ''), { tipo: 'nao-vale' });
  // sem histórico lido (nunca acontece, mas não quebra): grava com a linha
  assert.equal(passoDoHotel(aInformar, undefined, 'Pousada do Sol').tipo, 'gravar');
});

test('o painel grava o hotel a informar: o campo uma vez por pedido, a rota decide com o passeio relido dentro da trava', () => {
  const painel = ler('src/app/admin/page.tsx');
  assert.match(painel, /name="acao" value="hotel"/);
  assert.match(painel, /maxLength=\{MAXIMO_NOME_DO_HOTEL\}/);
  assert.match(painel, /i\.codigo === primeiroAInformar \? \{ filtro, busca \} : undefined/);
  const rota = ler('src/app/api/admin/reservas/[codigo]/route.ts');
  assert.match(rota, /if \(acao === 'hotel'\) \{/);
  assert.match(rota, /if \(!hotel\) return voltar\('hotel-invalido'\);/);
  // nada de decidir pela lista lida no começo da requisição: cada passeio é relido dentro de atualizarReserva
  assert.match(rota, /const passo = passoDoHotel\(x\.hospedagem, x\.historico, hotel\);/);
  // a linha do histórico só com o primeiro passeio do pedido (segunda revisão: sem o banco, cada voucher tem uma cópia)
  assert.match(rota, /const primeiroPasseio = vouchers\.find\(\(v\) => !ehTransfer\(v\)\)\?\.codigo;/);
  assert.match(rota, /return passo\.linha && v\.codigo === primeiroPasseio \? registrar\(x, passo\.linha\) : x;/);
  // outro hotel já gravado: para no primeiro passeio que diz isso, e a volta avisa
  assert.match(rota, /if \(outro\) \{\s+outroHotel = true;\s+break;\s+\}/);
  assert.match(rota, /if \(outroHotel\) return voltar\('hotel-ja-informado'\);\s+return voltar\(gravados > 0 \|\| jaEstava \? undefined : 'acao-nao-vale'\);/);
  assert.doesNotMatch(rota, /vouchers\.some\(\(v\) => !ehTransfer\(v\) && !v\.hospedagem\.aInformar/);
  assert.match(ler('src/lib/pedidos-painel.ts'), /'hotel-invalido': 'Escreva o nome do hotel ou da pousada \(até 120 letras\)\. Nada foi gravado\.'/);
  assert.match(
    ler('src/lib/pedidos-painel.ts'),
    /'hotel-ja-informado': 'Este pedido já tem um hotel gravado no painel \(veja o histórico do pedido\)\. Nada foi mudado\.'/,
  );
});

test('um hotel só por pedido (segunda revisão do Pacote 29): o primeiro nome gravado vale para todos os passeios', () => {
  const aInformar = { cidade: 'buzios' as const, hotel: '', aInformar: true as const };
  const linhaX = `${LINHA_DO_HOTEL_INFORMADO}: Pousada Mar`;
  // o hotel que o painel já gravou no pedido: o da primeira linha do histórico, ou null
  assert.equal(hotelJaInformado([]), null);
  assert.equal(hotelJaInformado(undefined), null);
  assert.equal(hotelJaInformado([{ evento: 'Reserva criada' }, { evento: linhaX }]), 'Pousada Mar');
  assert.equal(hotelJaInformado([{ evento: linhaX }, { evento: `${LINHA_DO_HOTEL_INFORMADO}: Outra` }]), 'Pousada Mar');
  // o nome com ": " dentro continua inteiro
  assert.equal(hotelJaInformado([{ evento: `${LINHA_DO_HOTEL_INFORMADO}: Hotel: Centro` }]), 'Hotel: Centro');
  // duas pessoas com nomes diferentes ao mesmo tempo: a que chega no segundo passeio depois da outra já ter gravado o
  // primeiro lê, no histórico do pedido, o outro nome, e nada grava; antes, ela gravava o seu nome no segundo passeio
  assert.deepEqual(passoDoHotel(aInformar, [{ evento: linhaX }], 'Pousada Marr'), { tipo: 'outro-hotel' });
  // a mesma pessoa no segundo passeio (ou o pedido em que a gravação parou no meio): o mesmo nome, sem outra linha
  assert.deepEqual(passoDoHotel(aInformar, [{ evento: linhaX }], 'Pousada Mar'), {
    tipo: 'gravar',
    hospedagem: { cidade: 'buzios', hotel: 'Pousada Mar' },
  });
  // o primeiro passeio já com o outro nome: também 'outro-hotel' (a rota para ali, sem tocar nos outros)
  assert.deepEqual(passoDoHotel({ cidade: 'buzios', hotel: 'Pousada Mar' }, [{ evento: linhaX }], 'Pousada Marr'), {
    tipo: 'outro-hotel',
  });
  // o pedido sem hotel gravado: grava com a linha
  assert.equal(passoDoHotel(aInformar, [{ evento: 'Reserva criada' }], 'Pousada Mar').tipo, 'gravar');
});

test('a frase do Pix para quem é de fora (Pacote 29, decisão do dono de 25/11): em espanhol e inglês, vazia em português', () => {
  assert.equal(dicionario('pt').checkout.pixDeFora, '');
  assert.equal(dicionario('es').checkout.pixDeFora, 'Pix es el pago instantáneo de Brasil. Si no tienes una app que pague Pix, elige tarjeta.');
  assert.equal(dicionario('es-ar').checkout.pixDeFora, 'Pix es el pago instantáneo de Brasil. Si no tenés una app que pague Pix, elegí tarjeta.');
  assert.equal(dicionario('en').checkout.pixDeFora, 'Pix is Brazil’s instant payment system. If you don’t have an app that pays with Pix, choose card.');
  // o checkout e a página do pedido (pagar de novo) levam a frase até a escolha do pagamento, que a mostra em cima da explicação
  assert.match(ler('src/components/carrinho/FormularioCarrinho.tsx'), /pixDeFora: C\.pixDeFora,/);
  assert.match(ler('src/lib/reserva-publica.ts'), /pixDeFora: C\.pixDeFora,/);
  assert.match(ler('src/components/pagamento/EscolhaPagamento.tsx'), /\{T\.pixDeFora && <span className="mb-1 block font-semibold text-\(--color-tinta\)">\{T\.pixDeFora\}<\/span>\}/);
});

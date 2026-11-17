import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// As rotas do Next e o arquivo das reservas não rodam em node puro (usam o atalho "@/" e módulos só do servidor).
// Estes testes leem o código deles e seguram seis travas que não podem se perder numa mudança futura. O
// comportamento de ponta a ponta é conferido na simulação da Stripe, fora do npm test. Só leitura: nada é gravado.

/** O código de um arquivo de src/, sem as linhas de comentário. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

test('o PDF do voucher só sai para o voucher pago: o que não vale leva à página da reserva (303), nunca a um texto cru', () => {
  const rota = codigo('app', 'api', 'voucher', '[codigo]', 'route.ts');
  // a trava olha o status do VOUCHER (statusDoVoucher), não só o do pedido, e vem antes de gerar o PDF
  const trava = rota.search(/if \(statusDoVoucher\(reserva\) !== 'pago'\)\s+return semVoucher\(new URL\(pagina, req\.url\)\);/);
  assert.notEqual(trava, -1);
  assert.ok(trava < rota.indexOf('gerarVoucherPdf(reserva'));
  assert.doesNotMatch(rota, /reserva\.status !== 'pago'/);
  // o destino é a página da reserva com o token, no idioma do pedido (a mesma que o QR do PDF abre), num 303 que não
  // fica guardado e não conta à página seguinte de onde o cliente veio
  assert.match(
    rota,
    /const pagina = `\$\{rota\(reserva\.idioma, `\/reserva\/\$\{reserva\.codigo\}`\)\}\?t=\$\{encodeURIComponent\(reserva\.token\)\}`;/,
  );
  assert.match(rota, /const resposta = NextResponse\.redirect\(pagina, 303\);/);
  assert.match(rota, /resposta\.headers\.set\('Cache-Control', 'private, no-store'\);/);
  assert.match(rota, /resposta\.headers\.set\('Referrer-Policy', 'no-referrer'\);/);
  assert.match(rota, /await gerarVoucherPdf\(reserva, `\$\{urlDoSite\(\)\}\$\{pagina\}`\)/);
  // nunca mais o 409 com o texto cru ("disponível após a confirmação do pagamento", até num pedido reembolsado)
  assert.doesNotMatch(rota, /status: 409/);
  assert.doesNotMatch(rota, /Voucher disponível/);
  // quem não tem o token certo continua com o 404 de antes, sem endereço nenhum
  assert.match(
    rota,
    /if \(!reserva \|\| !tokenConfere\(reserva, t\)\) return new Response\('Reserva não encontrada', \{ status: 404 \}\);/,
  );
  assert.ok(rota.indexOf('tokenConfere(reserva, t)') < trava);
  // é a mesma função com que o site mostra o voucher ao cliente
  assert.match(rota, /import \{ statusDoVoucher, tokenConfere \} from '@\/lib\/reserva-publica';/);
  assert.match(codigo('lib', 'reserva-publica.ts'), /export function statusDoVoucher\(/);
});

/** Os arquivos de uma pasta de src/, com as subpastas. */
function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    return e.isDirectory() ? arquivosDe(caminho) : [caminho];
  });
}

/**
 * A abertura de uma tag JSX que começa em `inicio` (o "<"): até o ">" que a fecha, pulando o que está entre chaves (um
 * `href={…}` pode ter "=>" dentro).
 */
function aberturaDaTag(fonte: string, inicio: number): string {
  let chaves = 0;
  for (let i = inicio; i < fonte.length; i++) {
    const c = fonte[i];
    if (c === '{') chaves++;
    else if (c === '}') chaves--;
    else if (c === '>' && chaves === 0) return fonte.slice(inicio, i + 1);
  }
  return fonte.slice(inicio);
}

test('os links do PDF do voucher não levam o atributo download', () => {
  // com ele, o navegador salvaria como arquivo a página da reserva (o voucher que deixou de valer com a página aberta)
  // ou, no motor do iPhone, um arquivo com a resposta; sem ele, o PDF pago continua baixando (a rota manda attachment)
  const links = arquivosDe('src')
    .filter((f) => f.endsWith('.tsx'))
    .flatMap((f) => {
      const fonte = readFileSync(f, 'utf8');
      return [...fonte.matchAll(/\/api\/voucher\//g)].map((m) => ({
        onde: f,
        tag: aberturaDaTag(fonte, fonte.lastIndexOf('<a', m.index)),
      }));
    });
  // pelo menos os dois botões de hoje: o da página da reserva e o de cada voucher da página do pedido
  assert.ok(links.length >= 2, links.map((l) => l.onde).join('\n'));
  for (const { onde, tag } of links) {
    assert.match(tag, /^<a\s/, onde);
    assert.doesNotMatch(tag, /\sdownload\b/, `${onde}: ${tag}`);
  }
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

test('o Pix vencido: a sessão só fecha na Stripe depois de o pedido ser gravado, e a página nunca lê recusa num Pix', () => {
  const pagamento = codigo('lib', 'pagamento-stripe.ts');
  const inicio = pagamento.indexOf('export async function aplicarSessao(');
  assert.notEqual(inicio, -1);
  // só o corpo de aplicarSessao, até a função seguinte
  const aplicar = pagamento.slice(inicio, pagamento.indexOf('\nexport ', inicio + 1));
  // a leitura usa o mesmo agora (o tempo de tocar em "Continuar" no Pix)
  assert.match(aplicar, /const leitura = interpretarSessao\(sessao, agora\);/);
  const gravar = aplicar.indexOf('await atualizarReserva(');
  const fechar = aplicar.search(/if \(leitura\.fecharSessao\) \{?\s*await expirarSessao\(sessao\.id\)/);
  assert.notEqual(gravar, -1);
  assert.notEqual(fechar, -1);
  // fechada, a Stripe apaga o erro do pagamento: primeiro o pedido gravado com o motivo, depois a sessão fechada,
  // e só então os e-mails
  assert.ok(gravar < fechar);
  assert.ok(fechar < aplicar.indexOf('await pedidoExpirou('));
  // uma falha ao fechar não desfaz o pedido gravado: fica no registro do servidor
  assert.match(aplicar, /await expirarSessao\(sessao\.id\)\.catch\(/);

  // a página: paraPublico passa a forma registrada no pedido à regra da recusa, que nunca dá texto de cartão num Pix
  const publica = codigo('lib', 'reserva-publica.ts');
  assert.match(publica, /recusa: recusaDoPedido\(r\.status, r\.pagamento\.motivoCodigo, r\.pagamento\.metodo\),/);
  assert.match(publica, /return recusaParaOCliente\(status, motivoCodigo, metodo\);/);
  assert.doesNotMatch(publica, /chaveDaRecusa\(/);
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

test('o transfer pede a antecedência no servidor, no cartão do transfer e no transfer que chega pela URL', () => {
  /** A lista do import de '@/data/transfer' de um arquivo: a regra é a mesma função nos três lugares. */
  const doTransfer = (fonte: string) => fonte.match(/import \{([^}]*)\} from '@\/data\/transfer';/)?.[1] ?? '';

  // o servidor: conferirEscolha é a única porta do carrinho, do checkout e da criação do pedido
  const carrinho = codigo('lib', 'carrinho-servidor.ts');
  assert.match(doTransfer(carrinho), /\btransferComAntecedencia\b/);
  const inicio = carrinho.indexOf('export function conferirEscolha(');
  assert.notEqual(inicio, -1);
  const conferir = carrinho.slice(inicio, carrinho.indexOf('\nexport ', inicio + 1));
  const trava = conferir.search(
    /if \(!transferComAntecedencia\(e\.ida\.data, e\.ida\.hora, agora\)\) return \{ ok: false, erro: 'antecedencia' \};/,
  );
  assert.notEqual(trava, -1);
  // depois do "de amanhã em diante" e antes do preço, com o mesmo agora do resto da conferência
  assert.ok(conferir.indexOf('primeiroDiaTransfer(hoje)') < trava);
  assert.ok(trava < conferir.indexOf('precoTrecho('));

  // o cartão do transfer: problema() faz a mesma conta, com o relógio do aparelho, logo depois do "informe o horário"
  const widget = codigo('components', 'transfer', 'WidgetTransfer.tsx');
  assert.match(doTransfer(widget), /\btransferComAntecedencia\b/);
  const comeco = widget.indexOf('function problema(): string {');
  assert.notEqual(comeco, -1);
  const problema = widget.slice(comeco, widget.indexOf('\n  }', comeco));
  assert.match(problema, /if \(!hora\) return T\.erroHora;\s+if \(!transferComAntecedencia\(data, hora\)\) return erroAntecedencia;/);

  // quando só o servidor recusa (o relógio do aparelho errado, ou o transfer de um link antigo em /transfer/checkout),
  // o código 'antecedencia' mostra a frase nova, nunca a genérica; o número de horas vem da regra, não escrito à mão
  const formulario = codigo('components', 'transfer', 'FormularioTransfer.tsx');
  for (const [nome, fonte] of [
    ['WidgetTransfer.tsx', widget],
    ['FormularioTransfer.tsx', formulario],
  ]) {
    assert.match(fonte, /r\.erro === 'antecedencia' \? erroAntecedencia :/, nome);
    assert.match(fonte, /const erroAntecedencia = .*T\.erroAntecedencia.*ANTECEDENCIA_TRANSFER_MINUTOS \/ 60/, nome);
  }
});

test('o checkout de um carrinho que virou pedido pago leva ao pedido: só com o status pago, pelo link privado de sempre', () => {
  const publica = codigo('lib', 'reserva-publica.ts');
  const inicio = publica.indexOf('export async function pagamentoDoCheckout(');
  assert.notEqual(inicio, -1);
  const funcao = publica.slice(inicio, publica.indexOf('\nexport ', inicio + 1));
  assert.match(funcao, /pedidoPago\?: \{ codigo: string; href: string \}/);
  // só o pago: reembolsado, contestado e cancelado continuam como antes ("Seu carrinho está vazio.")
  assert.match(funcao, /const pago = pedido !== undefined && pedido\.status === 'pago';/);
  assert.match(
    funcao,
    /\.\.\.\(pago \? \{ pedidoPago: \{ codigo: pedido\.codigo, href: linkDoPedido\(idioma, pedido\.codigo, pedido\.token\) \} \} : \{\}\),/,
  );
  // o "continuar o pagamento" de antes não muda: pendente ou expirado
  assert.match(funcao, /const aberto = pedido !== undefined && \(pedido\.status === 'pendente' \|\| pedido\.status === 'expirado'\);/);
  assert.equal(funcao.match(/pedidoPago:/g)?.length, 1);
});

test('sem o banco, o pedido de um item é achado pelo próprio código, como no banco', () => {
  const reservas = codigo('lib', 'reservas.ts');
  // a busca dos arquivos (e do Blob) é a função pura vouchersDoCodigo, testada em tests/reservas-banco.test.ts
  assert.match(reservas, /async lerPedido\(codigo\) \{\s+return vouchersDoCodigo\(await a\.listar\(\), codigo\);\s+\}/);
  assert.doesNotMatch(reservas, /\.filter\(\(r\) => r\.pedido\?\.codigo === codigo\)/);
  // e a linha do pedido no banco é gravada com o mesmo código
  assert.match(codigo('lib', 'reservas-banco.ts'), /codigo: codigoDoPedido\(r\),/);
});

test('o checkout com pedido pendente confere a Stripe pela porta de sempre, esperando no máximo 3 s', () => {
  const checkout = codigo('app', '[locale]', 'checkout', 'page.tsx');
  const inicio = checkout.indexOf("if (carrinho.pedido?.status === 'pendente') {");
  assert.notEqual(inicio, -1);
  const fim = checkout.indexOf('const inicial = itensVisiveis(', inicio);
  assert.notEqual(fim, -1);
  const bloco = checkout.slice(inicio, fim);
  // a mesma rede de segurança da página do pedido: conferirNaStripe (aplicarSessao, os freios por pedido e por IP), só
  // aqui dentro, só com o pedido pendente
  assert.match(bloco, /const consulta = conferirNaStripe\(r, \{ origem: 'pagina', ip \}\)\.catch\(\(\) => null\);/);
  assert.equal(checkout.split('conferirNaStripe(').length, 2);
  // o limite de 3 s: a consulta que passa dele termina depois da resposta (after), e a página abre como está
  assert.match(checkout, /const LIMITE_DA_CONSULTA_MS = 3_?000;/);
  assert.match(
    bloco,
    /const conferida = await Promise\.race\(\[consulta, new Promise<null>\(\(ok\) => setTimeout\(\(\) => ok\(null\), LIMITE_DA_CONSULTA_MS\)\)\]\);/,
  );
  const depois = bloco.indexOf('after(() => consulta);');
  assert.notEqual(depois, -1);
  assert.ok(depois < bloco.indexOf('await Promise.race('));
  // o IP é lido antes, fora do after: dentro dele, a página não pode ler a requisição
  const ip = bloco.indexOf('const ip = ipDaRequisicao(await headers());');
  assert.notEqual(ip, -1);
  assert.ok(ip < depois);
  // o carrinho só é relido quando a consulta mudou o pedido; e isso vem antes de montar os itens e o pedido pago
  assert.match(
    bloco,
    /if \(conferida && conferida\.status !== 'pendente'\) carrinho = await lerCarrinho\(codigoDoCarrinho\)\.catch\(\(\) => carrinho\);/,
  );
  assert.ok(fim < checkout.indexOf('await pagamentoDoCheckout('));
  assert.match(checkout, /import \{ after \} from 'next\/server';/);
});

test('a página aberta confere o status quando o cliente volta para a aba, e a pergunta sai na hora', () => {
  // o gancho mora num arquivo só dele desde 16/11 (Pacote 11): CheckoutEmbutido.tsx, StatusReserva.tsx e
  // AoVoltarParaAAba.tsx o importam de lá
  const arquivo = codigo('components', 'pagamento', 'useStatusDoPedido.ts');
  const inicio = arquivo.indexOf('export function useStatusDoPedido(');
  assert.notEqual(inicio, -1);
  const gancho = arquivo.slice(inicio, arquivo.indexOf('\n}\n', inicio) + 2);
  // o ritmo: 'sempre' é o padrão (os usos de antes não mudam) e 'ao-voltar' só pergunta na volta para a aba
  assert.match(arquivo, /export type RitmoDaConsulta = 'sempre' \| 'ao-voltar';/);
  assert.match(arquivo, /^const INTERVALO_CONSULTA_MS = 4000;$/m);
  assert.match(gancho, /ritmo: RitmoDaConsulta = 'sempre',?\s*\)/);
  // o relógio de 4 s só nasce no ritmo 'sempre': parada, a página de um pedido pago não pergunta nada
  assert.match(gancho, /const id = ritmo === 'sempre' \? window\.setInterval\(consultar, INTERVALO_CONSULTA_MS\) : undefined;/);
  assert.equal(gancho.split('setInterval(').length, 2);
  assert.match(gancho, /if \(id !== undefined\) window\.clearInterval\(id\);/);
  // os ouvintes valem nos dois ritmos: a aba que reaparece e a página que o navegador devolve inteira pelo "voltar"
  assert.match(gancho, /document\.addEventListener\('visibilitychange', aoVoltar\);/);
  assert.match(gancho, /window\.addEventListener\('pageshow', aoMostrar\);/);
  assert.match(gancho, /document\.removeEventListener\('visibilitychange', aoVoltar\);/);
  assert.match(gancho, /window\.removeEventListener\('pageshow', aoMostrar\);/);
  assert.doesNotMatch(gancho, /if \(ritmo|ritmo === 'ao-voltar'|ritmo !== 'sempre'/);
  assert.match(gancho, /\}, \[codigo, token, idioma, ativo, ritmo\]\);/);
  // na volta, a pergunta sai NA HORA (é ela que faz o servidor cortar o Pix que ninguém gerou em 30 minutos): os
  // ouvintes chamam consultar() direto, sem espera, fila ou freio do lado do navegador, e a primeira espera de
  // consultar é a própria pergunta ao servidor
  assert.match(gancho, /const aoVoltar = \(\) => document\.visibilityState === 'visible' && consultar\(\);/);
  assert.match(gancho, /const aoMostrar = \(e: PageTransitionEvent\) => e\.persisted && consultar\(\);/);
  assert.match(gancho, /const consultar = async \(\) => \{\s+try \{\s+const res = await fetch\(`\/api\/reservas\//);
  assert.doesNotMatch(gancho, /setTimeout|requestIdleCallback|requestAnimationFrame|debounce|throttle|Date\.now|performance\.now/);
  assert.doesNotMatch(gancho, /ultimaConsulta|ultimaPergunta|emCurso|ocupad/i);
});

test('a página só se redesenha depois de uma leitura que mudou o que ela mostra, e a do pedido confere todos os vouchers ao voltar', () => {
  const status = codigo('components', 'StatusReserva.tsx');
  const aoVoltar = codigo('components', 'pagamento', 'AoVoltarParaAAba.tsx');
  const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  // sem rede, um refresh cairia na navegação do navegador e tiraria o voucher da tela: só depois de uma leitura que
  // mudou (a pergunta que falha não chama aoLer). Desde o reteste de 16-17/11 (R5), "mudou" é leituraMudou (o status, o
  // valor devolvido e as partes de um reembolso que falhou; testada em tests/paginas-do-cliente.test.ts), não só o status
  const todosNaReserva = status.match(/router\.refresh\(\)/g) ?? [];
  assert.ok(todosNaReserva.length > 0);
  assert.equal((status.match(/if \(leituraMudou\(lido, r\)\) router\.refresh\(\);/g) ?? []).length, todosNaReserva.length);
  // a página do pedido: um router.refresh() só, dentro do redesenho com a trava (vários vouchers mudados na mesma volta,
  // um redesenho), que só a conferência de um voucher chama, e só depois de uma leitura dele que mudou
  assert.equal(aoVoltar.match(/router\.refresh\(\)/g)?.length, 1);
  assert.match(
    aoVoltar,
    /const redesenhar = useCallback\(\(\) => \{\s+if \(redesenhando\.current\) return;\s+redesenhando\.current = true;\s+router\.refresh\(\);\s+\}, \[router\]\);/,
  );
  // a trava solta quando a página redesenhada chega (a lista nova de vouchers)
  assert.match(aoVoltar, /useEffect\(\(\) => \{\s+redesenhando\.current = false;\s+\}, \[vouchers\]\);/);
  assert.equal(aoVoltar.match(/\bredesenhar\b/g)?.length, 2, 'a definição e o aoMudar de cada voucher');
  assert.equal(aoVoltar.match(/\baoMudar\(\)/g)?.length, 1);
  assert.match(aoVoltar, /if \(leituraMudou\(lido, voucher\)\) aoMudar\(\);/);
  // a comparação só do status não volta
  for (const fonte of [status, aoVoltar]) assert.doesNotMatch(fonte, /lido\.status !==/);
  // a página da reserva: uma chamada só, fora da tela de pagar (que acompanha sozinha), com o ritmo do status
  assert.equal(status.split('useStatusDoPedido(').length, 2);
  assert.match(
    status,
    /useStatusDoPedido\(\s+r\.codigo,\s+token,\s+idioma,\s+!online,[\s\S]+?r\.status === 'pendente' \? 'sempre' : 'ao-voltar',?\s+\);/,
  );
  // a página do pedido com vários itens, fora da tela de pagar: cada voucher perguntado por ele mesmo (o reembolso de um
  // voucher que não é o primeiro muda o status dele), comparado com o que a consulta devolve dele (paraPublico), só na
  // volta para a aba. Uma pergunta por voucher, cada uma pelo gancho de sempre: a pergunta sai na hora
  assert.equal(aoVoltar.split('useStatusDoPedido(').length, 2);
  assert.match(aoVoltar, /useStatusDoPedido\(\s+voucher\.codigo,\s+token,\s+idioma,\s+true,[\s\S]+?'ao-voltar',?\s+\);/);
  assert.match(
    aoVoltar,
    /\{vouchers\.map\(\(v\) => \(\s+<ConfereOVoucher key=\{v\.codigo\} voucher=\{v\} token=\{token\} idioma=\{idioma\} aoMudar=\{redesenhar\} \/>/,
  );
  assert.match(aoVoltar, /^'use client';/);
  const ramo = pedido.indexOf('{statusOnline && pagamento ? (');
  const senao = pedido.indexOf(') : (', ramo);
  const usa = pedido.indexOf('<AoVoltarParaAAba');
  assert.notEqual(ramo, -1);
  assert.equal(pedido.split('<AoVoltarParaAAba').length, 2);
  assert.ok(senao < usa, 'fora da tela de pagar');
  assert.ok(usa < pedido.indexOf('<h1 className="display text-head">{titulo}</h1>'));
  // todos os vouchers do pedido, com os valores de quando a página abriu; só esses valores vão ao navegador
  assert.match(
    pedido.slice(usa),
    /^<AoVoltarParaAAba\s+token=\{token\}\s+idioma=\{locale\}\s+vouchers=\{itens\.map\(\(\{ codigo, status, reembolsoCentavos, reembolsoPartes \}\) => \(\{\s+codigo,\s+status,\s+reembolsoCentavos,\s+reembolsoPartes,\s+\}\)\)\}\s+\/>/,
  );
  assert.doesNotMatch(pedido, /status=\{itens\[0\]\.status\}/);
});

test('o gancho da consulta mora num arquivo só dele: quem só confere o status não leva o formulário da Stripe', () => {
  // Pacote 11 (16/11): AoVoltarParaAAba importava o gancho do CheckoutEmbutido.tsx, e a página do pedido pago baixava
  // junto o pedaço do formulário da Stripe (@stripe/react-stripe-js) só para perguntar o status. Nada muda no que ele faz.
  const gancho = codigo('components', 'pagamento', 'useStatusDoPedido.ts');
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  const status = codigo('components', 'StatusReserva.tsx');
  const aoVoltar = codigo('components', 'pagamento', 'AoVoltarParaAAba.tsx');
  // o arquivo do gancho é do navegador e só importa o React e dois tipos: nada da Stripe, nada do CheckoutEmbutido
  assert.match(gancho, /^'use client';/);
  assert.match(gancho, /^export function useStatusDoPedido\(/m);
  const importacoes = [...gancho.matchAll(/^import\s[^;]*?\sfrom\s+'([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(importacoes.toSorted(), ['@/i18n/config', '@/lib/reserva-publica', 'react']);
  assert.match(gancho, /^import type \{ Idioma \} from '@\/i18n\/config';$/m);
  assert.match(gancho, /^import type \{ ReservaPublica \} from '@\/lib\/reserva-publica';$/m);
  assert.doesNotMatch(gancho, /@stripe\/|CheckoutEmbutido|import\(/);
  // o CheckoutEmbutido usa o gancho de lá, sem uma segunda cópia
  assert.doesNotMatch(checkout, /function useStatusDoPedido\(|\bRitmoDaConsulta\b|\bLeituraDoPedido\b|INTERVALO_CONSULTA_MS/);
  assert.match(checkout, /^import \{ useStatusDoPedido \} from '\.\/useStatusDoPedido';$/m);
  // a página da reserva e a do pedido fora da tela de pagar importam o gancho do arquivo dele (com a comparação das
  // leituras, leituraMudou, desde o reteste de 16-17/11); a do pedido, nada do CheckoutEmbutido
  assert.match(status, /^import \{[^}]*(?<![\w-])useStatusDoPedido(?![\w-])[^}]*\} from '\.\/pagamento\/useStatusDoPedido';$/m);
  assert.match(aoVoltar, /^import \{[^}]*(?<![\w-])useStatusDoPedido(?![\w-])[^}]*\} from '\.\/useStatusDoPedido';$/m);
  assert.doesNotMatch(aoVoltar, /CheckoutEmbutido|@stripe\//);
  // e nenhum arquivo de src/ importa o gancho (ou os tipos dele) do CheckoutEmbutido
  const culpados = arquivosDe('src')
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) =>
      /^import\s[^;]*\b(?:useStatusDoPedido|RitmoDaConsulta|LeituraDoPedido)\b[^;]*\sfrom\s+'[^']*CheckoutEmbutido';/m.test(
        readFileSync(f, 'utf8'),
      ),
    );
  assert.deepEqual(culpados, []);
});

test('o ponto de encontro é decidido no servidor e chega pronto: nenhum componente do navegador traz as regras do pagamento', () => {
  const reserva = codigo('app', '[locale]', 'reserva', '[codigo]', 'page.tsx');
  const status = codigo('components', 'StatusReserva.tsx');
  // a página da reserva (servidor) decide com o status do voucher, como o WhatsApp
  assert.match(reserva, /import \{[^}]*\bmostrarPontoDeEncontro\b[^}]*\} from '@\/lib\/formas-pagamento';/);
  assert.match(reserva, /encontroLiberado=\{mostrarPontoDeEncontro\(publica\.status\)\}/);
  // o componente recebe o sim ou o não e só desenha a linha com ele
  assert.match(status, /encontroLiberado: boolean;/);
  assert.match(status, /\{encontroLiberado && r\.horario && !r\.horario\.busca && \(/);
  assert.doesNotMatch(status, /mostrarPontoDeEncontro/);
  // nenhum arquivo do navegador ('use client') importa src/lib/formas-pagamento.ts com valor, só tipos: a regra não vai
  // para o navegador por causa da tela (o cartão do transfer já o leva por src/data/transfer.ts, Pacote 6)
  const doNavegador = arquivosDe('src')
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => ({ f, fonte: readFileSync(f, 'utf8') }))
    .filter(({ fonte }) => /^\s*['"]use client['"];/.test(fonte));
  assert.ok(doNavegador.length > 10);
  const culpados = doNavegador.flatMap(({ f, fonte }) =>
    [...fonte.matchAll(/^import\s+(type\s+)?\{[^}]*\}\s+from\s+'[^']*formas-pagamento(?:\.ts)?';/gm)]
      .filter((m) => !m[1])
      .map((m) => `${f}: ${m[0]}`),
  );
  assert.deepEqual(culpados, []);
});

test('a sessão que já é a corrente do pedido: nada é gravado e o pedido volta como está, nos arquivos, no Blob e no banco', () => {
  // Reteste de 16-17/11 (R10): com dois "Pagar" no mesmo segundo a Stripe devolve a mesma sessão aos dois, e a segunda
  // gravação repetia a linha "Sessão de pagamento criada". A sessão que já é a corrente fica, como a trava de status, no
  // começo de sessaoNovaNoPedido (as duas devolvem null antes de mexer no pedido; testadas em tests/stripe.test.ts)
  const pagamento = codigo('lib', 'pagamento-stripe.ts');
  assert.match(
    pagamento,
    /export function sessaoNovaNoPedido\(r: Reserva, sessaoId: string, forma: FormaPagamento\): string \| null \{\s+if \(!podeAbrirSessao\(r\.status\)\) return null;\s+if \(r\.pagamentoExternoId === sessaoId\) return null;\s+r\.provedor = 'stripe';/,
  );
  // registrarSessaoCriada: sem a linha (null), a mudança devolve null
  const inicio = pagamento.indexOf('export async function registrarSessaoCriada(');
  assert.notEqual(inicio, -1);
  const registrarSessao = pagamento.slice(inicio);
  assert.match(registrarSessao, /const evento = sessaoNovaNoPedido\(r, sessao\.id, forma\);/);
  assert.match(registrarSessao, /return evento \? registrar\(r, evento\) : null;/);
  // e atualizarReserva, com a mudança que devolve null, devolve o pedido como foi lido: antes da hora de atualização e da
  // gravação, que é a mesma para os três armazenamentos (principal(): os arquivos, o Blob ou o banco)
  const reservas = codigo('lib', 'reservas.ts');
  assert.match(
    reservas,
    /const nova = alterar\(structuredClone\(atual\.reserva\)\);\s+if \(!nova\) return atual\.reserva;\s+nova\.atualizadaEm = new Date\(\)\.toISOString\(\);\s+if \(await principal\(\)\.gravar\(nova, atual\.versao\)\) \{/,
  );
  // quem chama segue: a sessão gravada é a dela e o pedido continua pendente (sessaoFicouGravada), nada a fechar por isso
  const pedidoStripe = codigo('app', 'api', 'pedido', 'pedido-stripe.ts');
  assert.match(pedidoStripe, /return gravada\.pagamentoExternoId === sessaoId && gravada\.status === 'pendente';/);
});

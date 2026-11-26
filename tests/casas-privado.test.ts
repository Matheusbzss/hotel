import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// As casas (Etapa 7): travas que não podem se perder numa mudança futura, lidas no código e na migração (nada roda no
// banco). O ponto exato da casa nunca chega à página; prender as datas tem um caminho só; e o banco segura o resto.

/** Os arquivos de código de uma pasta, com o caminho em barras normais. */
function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho.split(path.sep).join('/')] : [];
  });
}

/** O código sem as linhas de comentário (os comentários podem falar da tabela; o código não pode usá-la). */
const codigo = (arquivo: string) =>
  readFileSync(arquivo, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

/** Os textos entre aspas do código (o nome de uma tabela ou função do banco só chega ao banco assim). */
const literais = (fonte: string): string[] =>
  [...fonte.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);

const CODIGO = arquivos('src').filter((a) => a !== 'src/lib/banco-tipos.ts');
/** O código do painel: as páginas e rotas de /admin e os componentes e módulos dele. */
const doPainel = (a: string) => /\/admin\//.test(a) || /painel/i.test(path.basename(a));

const MIGRACAO = readFileSync(path.join('supabase', 'migrations', '20261125234456_casas_precos_pacotes_ponto_e_hospedes.sql'), 'utf8');

test('o ponto exato da casa: nenhum código cita a tabela fechada, e só o painel cita as duas funções do ponto', () => {
  assert.ok(CODIGO.length > 100, `poucos arquivos: ${CODIGO.length}`);
  const citam = (nome: RegExp) => CODIGO.filter((a) => literais(codigo(a)).some((t) => nome.test(t)));
  // nem um select('*, casas_pontos(*)') na leitura completa das casas: o banco recusaria, e a página nunca precisa dela
  assert.deepEqual(citam(/\bcasas_pontos\b/), []);
  // a página lê só o centro (casas.centro_lat e casas.centro_lng); o ponto é do painel, para o dono conferir
  assert.deepEqual(
    citam(/\bponto_da_casa\b/).filter((a) => !doPainel(a)),
    [],
  );
  // e gravar o ponto também é só do painel (Pacote 32: o "Marcar a casa no mapa"). O \b não separa "marcar_" de
  // "ponto_da_casa" (o _ é letra para ele): por isso a função que grava tem a sua própria busca
  assert.deepEqual(
    citam(/\bmarcar_ponto_da_casa\b/).filter((a) => !doPainel(a)),
    [],
  );
  // as duas chamadas existem, num módulo só do painel, com os argumentos da migração
  assert.deepEqual(citam(/\bmarcar_ponto_da_casa\b/), ['src/lib/casas-painel.ts']);
  assert.deepEqual(citam(/^ponto_da_casa$/), ['src/lib/casas-painel.ts']);
  const painel = codigo(path.join('src', 'lib', 'casas-painel.ts'));
  assert.match(painel, /^import 'server-only';/);
  assert.match(painel, /supabase\(\)\.rpc\('marcar_ponto_da_casa', \{ p_casa: casaId, p_lat: ponto\.lat, p_lng: ponto\.lng \}\)/);
  assert.match(painel, /supabase\(\)\.rpc\('ponto_da_casa', \{ p_casa: casaId \}\)/);
});

/** Os arquivos por onde passa o ponto exato: o módulo do painel, a ação, a prévia do mapa, a parte do mapa e a página. */
const DO_PONTO = [
  'src/lib/casas-painel.ts',
  'src/app/api/admin/casas/[id]/acoes/route.ts',
  'src/app/api/admin/casas/[id]/mapa/route.ts',
  'src/components/admin/MarcarCasaNoMapa.tsx',
  'src/app/admin/casas/[id]/page.tsx',
];

test('marcar a casa no mapa: a ação e a prévia têm o login do painel, e o ponto nunca vai para o log', () => {
  // a mesma proteção das outras ações do painel: a sessão do admin e o pedido vindo do próprio site
  for (const rota of ['src/app/api/admin/casas/[id]/acoes/route.ts', 'src/app/api/admin/casas/[id]/mapa/route.ts']) {
    assert.match(codigo(rota), /const recusado = await pedidoRecusado\(req\);\s+if \(recusado\) return recusado;/, rota);
  }
  const acoes = codigo('src/app/api/admin/casas/[id]/acoes/route.ts');
  assert.match(acoes, /async marcar_no_mapa\(casa, campos\) \{\s+const lidas = lerCoordenadas\(/);
  assert.match(acoes, /marcarPontoDaCasa\(casa\.id, lidas\.ponto\)/);
  // a volta para a página leva só o nome do aviso: as coordenadas nunca vão para o endereço
  assert.doesNotMatch(acoes, /searchParams\.set\([^)]*(coordenadas|ponto\.|lidas)/);
  // nenhum console.* desses arquivos mostra o ponto, as coordenadas, a latitude ou a longitude; os erros passam por
  // semCoordenadas, que tira os números com cara de coordenada
  for (const arquivo of DO_PONTO) {
    for (const m of codigo(arquivo).matchAll(/console\.\w+\(([^;]*)\);/g)) {
      assert.doesNotMatch(m[1], /\bponto\b|coordenadas|\blat\b|\blng\b|lidas|centro/, `${arquivo}: ${m[0]}`);
      assert.match(m[1], /semCoordenadas|mensagemDe/, `${arquivo}: ${m[0]}`);
    }
  }
  // a prévia do mapa não fica guardada em cache nenhum, e só usa o centro público
  const mapa = codigo('src/app/api/admin/casas/[id]/mapa/route.ts');
  assert.match(mapa, /'Cache-Control': 'private, no-store'/);
  assert.match(mapa, /recorteSatelite\(casa\.centro\)/);
  assert.doesNotMatch(mapa, /pontoDaCasa|casas-painel/);
});

test('semCoordenadas tira do log os números com cara de coordenada e deixa o resto', async () => {
  // o módulo do painel só roda no servidor ('server-only'): a regra é lida do arquivo e conferida aqui
  const fonte = codigo(path.join('src', 'lib', 'casas-painel.ts'));
  const regra = /export const semCoordenadas = \(mensagem: string\) => mensagem\.replace\((\/.+\/g), '…'\);/.exec(fonte);
  assert.ok(regra, 'semCoordenadas mudou de forma: confira este teste');
  const [, corpo, bandeiras] = /^\/(.+)\/(\w*)$/.exec(regra[1]) as RegExpExecArray;
  const sem = (m: string) => m.replace(new RegExp(corpo, bandeiras), '…');
  assert.equal(sem('falhou em -22.750123, -41.880345'), 'falhou em …, …');
  assert.equal(sem('falhou em -22,7501 -41,8803'), 'falhou em … …');
  assert.equal(sem('casas_pontos_lat_check (código 23514)'), 'casas_pontos_lat_check (código 23514)');
  assert.equal(sem('Banco de dados: 42501 permission denied'), 'Banco de dados: 42501 permission denied');
});

test('o formulário do cadastro não pede mais endereço, latitude nem longitude, e o site não lê nem grava o ponto antigo', () => {
  const formulario = codigo(path.join('src', 'components', 'admin', 'FormularioCasa.tsx'));
  assert.doesNotMatch(formulario, /nome="(endereco|lat|lng)"|pontoAproximado|Endereço exato|latitude|longitude/);
  // nenhum código lê ou grava as colunas antigas (o que estiver nelas fica no banco, sem uso)
  for (const a of CODIGO) assert.doesNotMatch(codigo(a), /\blat_aprox\b|\blng_aprox\b/, a);
  for (const a of CODIGO.filter((x) => /casa/i.test(x))) assert.doesNotMatch(codigo(a), /\.endereco\b|endereco:/, a);
  // a parte do mapa roda no servidor; o formulário, que roda no navegador, não recebe o centro, os detalhes nem o ponto
  const parte = readFileSync(path.join('src', 'components', 'admin', 'MarcarCasaNoMapa.tsx'), 'utf8');
  assert.doesNotMatch(parte, /^\s*['"]use client['"]/m);
  const pagina = codigo('src/app/admin/casas/[id]/page.tsx');
  assert.match(pagina, /centro: _centro,\s+detalhes: _detalhes,\s+\.\.\.dados\s+\} = casa;/);
  assert.match(pagina, /<FormularioCasa casa=\{dados\} /);
  assert.match(pagina, /<MarcarCasaNoMapa casa=\{casa\} ponto=\{ponto\} /);
});

test('a foto do mapa da casa: o endereço leva a versão do centro e nenhuma coordenada, e só a versão de agora fica guardada', () => {
  // a foto fica guardada 1 dia pelo endereço inteiro (na Vercel e no navegador): com a versão do centro público no
  // endereço, mudar o ponto no painel muda o endereço, e a foto nova chega junto com os nomes das praias
  const pagina = codigo('src/app/[locale]/casas-de-temporada/[slug]/page.tsx');
  const endereco = /const imagemDoMapa = comMapa && c\.centro \? `([^`]+)` : undefined;/.exec(pagina)?.[1] ?? '';
  assert.equal(endereco.replace(/\$\{[^}]+\}/g, '…'), '/mapa/casas/….webp?v=…');
  // no endereço da foto entram só o da página da casa (o slug) e a versão
  assert.deepEqual(
    [...endereco.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]),
    ['c.slug', 'versaoDoRecorte(c.centro)'],
  );
  // o mapa da página recebe esse endereço, os nomes das praias e os textos: nenhuma coordenada vai ao HTML
  const mapa = /<MapaCasa\b[\s\S]*?\/>/.exec(pagina)?.[0] ?? '';
  assert.match(mapa, /imagem=\{imagemDoMapa\}/);
  assert.doesNotMatch(mapa, /centro|\blat\b|\blng\b/);

  // a versão: 8 letras e números de um resumo sha256 do centro, do qual não se volta às coordenadas
  const satelite = codigo('src/lib/satelite-casa.ts');
  assert.match(
    satelite,
    /export const versaoDoRecorte = \(centro: Ponto\): string =>\s+createHash\('sha256'\)\.update\(`\$\{centro\.lat\},\$\{centro\.lng\}`\)\.digest\('hex'\)\.slice\(0, 8\);/,
  );
  // a mesma conta aqui (o módulo usa o sharp e o atalho "@/", que os testes não abrem), com um centro fictício
  const versao = (p: { lat: number; lng: number }) => createHash('sha256').update(`${p.lat},${p.lng}`).digest('hex').slice(0, 8);
  const centro = { lat: -22.75, lng: -41.88 };
  assert.match(versao(centro), /^[0-9a-f]{8}$/);
  // o mesmo centro, a mesma versão (a foto guardada continua valendo); o centro 400 m a leste, outra versão
  assert.equal(versao({ lat: -22.75, lng: -41.88 }), versao(centro));
  assert.notEqual(versao({ lat: -22.75, lng: -41.8761 }), versao(centro));

  // a rota recorta sempre o centro gravado e só deixa guardar a foto pedida com a versão desse centro: a página aberta
  // antes da mudança (a versão velha) leva a foto nova sem guardar, e o endereço de uma versão nunca guarda outro centro
  const rota = codigo('src/app/mapa/casas/[arquivo]/route.ts');
  assert.match(rota, /const centro = await centroDaCasa\(arquivo\.replace\(\/\\\.webp\$\/, ''\)\);/);
  assert.match(rota, /const imagem = await recorteSatelite\(centro\);/);
  assert.match(rota, /const daVersao = new URL\(req\.url\)\.searchParams\.get\('v'\) === versaoDoRecorte\(centro\);/);
  assert.match(rota, /'Cache-Control': daVersao \? 'public, max-age=86400, s-maxage=86400' : 'private, no-store'/);
  assert.equal(rota.match(/searchParams/g)?.length, 1);
});

test('a tabela do ponto é fechada no banco, não se apaga, e o centro público fica na casa', () => {
  assert.match(MIGRACAO, /revoke all on public\.casas_pontos from public, anon, authenticated, service_role;/);
  // a tabela do ponto não guarda o centro: ele vai para casas.centro_lat e casas.centro_lng, só pelo gatilho
  const tabela = MIGRACAO.slice(
    MIGRACAO.indexOf('create table public.casas_pontos'),
    MIGRACAO.indexOf(');', MIGRACAO.indexOf('create table public.casas_pontos')),
  );
  assert.doesNotMatch(tabela, /centro/);
  assert.match(MIGRACAO, /add column centro_lat double precision/);
  assert.match(MIGRACAO, /create trigger casas_centro_so_pelo_ponto before insert or update of centro_lat, centro_lng on public\.casas/);
  assert.match(MIGRACAO, /create trigger casas_pontos_centro after insert or update on public\.casas_pontos/);
  // apagar a linha refaria o sorteio: só o apagamento em cascata da casa passa
  assert.match(MIGRACAO, /create trigger casas_pontos_sem_apagar before delete on public\.casas_pontos/);
  assert.match(MIGRACAO, /if pg_trigger_depth\(\) < 2 then\s+raise exception 'casas_pontos:/);
  // as duas funções do painel rodam com os direitos do dono da tabela e só o servidor as chama
  for (const funcao of ['marcar_ponto_da_casa(uuid, double precision, double precision)', 'ponto_da_casa(uuid)']) {
    assert.ok(MIGRACAO.includes(`revoke execute on function public.${funcao} from public, anon, authenticated;`), funcao);
    assert.ok(MIGRACAO.includes(`grant execute on function public.${funcao} to service_role;`), funcao);
  }
  // \r? porque no Windows o git entrega o arquivo com CRLF
  assert.equal((MIGRACAO.match(/\r?\nsecurity definer\r?\n/g) ?? []).length, 2);
});

test('prender as datas de uma casa tem um caminho só: a função do banco que confere todos os bloqueios', () => {
  const pedido = codigo(path.join('src', 'lib', 'pedido-carrinho.ts'));
  assert.match(pedido, /supabase\(\)\.rpc\('prender_datas_casas', argsDePrenderDatas\(estadias, sessaoId\)\)/);
  assert.match(pedido, /if \(data !== true\) throw new DatasIndisponiveis\(\);/);
  // nenhuma inserção direta de estadia do site: a única inserção em casas_bloqueios é o bloqueio à mão do painel
  for (const a of CODIGO) {
    const fonte = codigo(a);
    for (const m of fonte.matchAll(/from\('casas_bloqueios'\)\s*\.insert\(([^)]*)\)/g)) {
      assert.match(m[1], /origem: 'manual'/, `${a}: inserção em casas_bloqueios que não é o bloqueio à mão`);
    }
  }
});

test('o banco recusa a diária de fim de semana zerada e apaga o cadastro da estadia cancelada ou devolvida', () => {
  assert.match(MIGRACAO, /add column diaria_fim_de_semana_centavos integer check \(diaria_fim_de_semana_centavos > 0\)/);
  const limpeza = MIGRACAO.slice(MIGRACAO.indexOf('create or replace function public.apagar_hospedes_vencidos()'));
  assert.match(limpeza, /coalesce\(i\.data_fim, i\.data\) \+ 30 <= \(now\(\) at time zone 'America\/Sao_Paulo'\)::date/);
  assert.match(limpeza, /or i\.status in \('cancelado', 'reembolsado'\)/);
  assert.match(limpeza, /or p\.status in \('cancelado', 'reembolsado'\)/);
});

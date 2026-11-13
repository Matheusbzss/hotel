import { test } from 'node:test';
import assert from 'node:assert/strict';
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

const MIGRACAO = readFileSync(path.join('supabase', 'migrations', '20261113223000_casas_precos_pacotes_ponto_e_hospedes.sql'), 'utf8');

test('o ponto exato da casa: nenhum código cita a tabela fechada, e só o painel cita a função que o lê', () => {
  assert.ok(CODIGO.length > 100, `poucos arquivos: ${CODIGO.length}`);
  const citam = (nome: RegExp) => CODIGO.filter((a) => literais(codigo(a)).some((t) => nome.test(t)));
  // nem um select('*, casas_pontos(*)') na leitura completa das casas: o banco recusaria, e a página nunca precisa dela
  assert.deepEqual(citam(/\bcasas_pontos\b/), []);
  // a página lê só o centro (casas.centro_lat e casas.centro_lng); o ponto é do painel, para pôr o alfinete
  assert.deepEqual(
    citam(/\bponto_da_casa\b/).filter((a) => !doPainel(a)),
    [],
  );
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

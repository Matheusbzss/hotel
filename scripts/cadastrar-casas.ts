// Cadastra as casas de scripts/dados/casas.ts no banco (Fase 4, Etapa 7, parte J), SEMPRE DESLIGADAS (ativo = false):
// a casa, os pacotes de feriado e os bloqueios iniciais. Precisa da migração 20261113223000 já aplicada e das fotos já
// copiadas (scripts/preparar-fotos-casas.ts).
//
// Sem opção, só CONFERE os dados e mostra o que seria gravado: nada muda no banco. Com --gravar, grava as casas que
// ainda não existem (pelo endereço da página), em três passos: a casa, os pacotes e os bloqueios. Se um passo falhar no
// meio (rede, banco), rode de novo: na casa que já existe e está desligada, o script grava só os pacotes e os
// bloqueios iniciais que faltam (oQueFaltaNoBanco, em scripts/dados/casas.ts); a casa em si, os textos e o que o dono
// mudou no painel ficam como estão. Na casa que já está no ar, só mostra o que falta. Nunca liga casa nenhuma: quem
// liga é o "Publicar no site" do painel, depois que o dono conferir as comodidades, os pacotes e os textos.
//
// Uso, na pasta do projeto:
//   node --experimental-strip-types --env-file=.env.local scripts/cadastrar-casas.ts [--gravar]

import { existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database, TablesInsert } from '../src/lib/banco-tipos.ts';
import {
  EsquemaComodidades,
  EsquemaDestaques,
  EsquemaPacotes,
  EsquemaQuartos,
  EsquemaRegrasProprias,
  EsquemaTextoBairro,
  colunasDosDetalhes,
  contarCamas,
  linhaDePacote,
  lugaresNasCamas,
} from '../src/lib/casa-detalhes.ts';
import { contaEstadia, pacotesComValores, type TabelaEstadia } from '../src/lib/estadia.ts';
import { CASAS_PARA_CADASTRAR, fotosNoSite, listasDaCasa, oQueFaltaNoBanco, type CasaParaCadastrar } from './dados/casas.ts';

const GRAVAR = process.argv.includes('--gravar');
const reais = (centavos: number) => `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const tabelaDe = (c: CasaParaCadastrar): TabelaEstadia => ({
  diariaCentavos: c.diariaCentavos,
  diariaFimDeSemanaCentavos: c.diariaFimDeSemanaCentavos,
  minimoNoites: c.minimoNoites,
  fimDeSemanaJunto: c.fimDeSemanaJunto,
  periodos: [],
  pacotes: c.pacotes,
});

/** Confere a casa antes de gravar: a forma de cada dado, as contas da ficha e as fotos. Devolve os problemas. */
function conferir(c: CasaParaCadastrar): string[] {
  const erros: string[] = [];
  const forma: [string, { safeParse: (v: unknown) => { success: boolean } }, unknown][] = [
    ['quartos', EsquemaQuartos, c.quartosDetalhe],
    ['comodidades', EsquemaComodidades, c.comodidadesMarcadas],
    ['destaques', EsquemaDestaques, c.destaques],
    ['regras próprias', EsquemaRegrasProprias, c.regrasProprias],
    ['texto do bairro', EsquemaTextoBairro, c.textoBairro],
    ['pacotes', EsquemaPacotes, c.pacotes],
  ];
  for (const [nome, esquema, valor] of forma) if (!esquema.safeParse(valor).success) erros.push(`${nome} fora da forma`);
  // as duas diárias maiores que zero: sem elas a conta deixa a casa sem preço (src/lib/estadia.ts)
  if (!(c.diariaCentavos > 0) || !(c.diariaFimDeSemanaCentavos > 0)) erros.push('sem a diária de semana ou a de fim de semana');
  if (c.quartosDetalhe.length !== c.quartos) erros.push(`${c.quartos} quartos, mas ${c.quartosDetalhe.length} na lista`);
  if (lugaresNasCamas(c.quartosDetalhe) !== c.capacidade) erros.push(`capacidade ${c.capacidade} diferente dos lugares nas camas`);
  for (const foto of fotosNoSite(c)) if (!existsSync(path.join('public', foto))) erros.push(`falta a foto ${foto}`);
  return erros;
}

/** A linha da tabela casas, desligada. Endereço, ponto no mapa, limpeza, caução e calendário de fora ficam vazios. */
function linhaDaCasa(c: CasaParaCadastrar): TablesInsert<'casas'> {
  const listas = listasDaCasa(c);
  return {
    slug: c.slug,
    ativo: false,
    cidade: c.cidade,
    nome: c.nome,
    bairro: c.local,
    resumo: c.resumo,
    descricao: c.descricao,
    endereco: null,
    lat_aprox: null,
    lng_aprox: null,
    quartos: c.quartos,
    suites: c.suites,
    banheiros: c.banheiros,
    capacidade: c.capacidade,
    camas: listas.camas,
    comodidades: listas.comodidades,
    regras: listas.regras,
    cancelamento: listas.cancelamento,
    check_in: '15h',
    check_out: '12h',
    diaria_base_centavos: c.diariaCentavos,
    minimo_noites: c.minimoNoites,
    taxa_limpeza_centavos: null,
    caucao_centavos: null,
    fotos: fotosNoSite(c),
    ical_url: null,
    ...colunasDosDetalhes({
      lavabos: c.lavabos,
      diariaFimDeSemanaCentavos: c.diariaFimDeSemanaCentavos,
      fimDeSemanaJunto: c.fimDeSemanaJunto,
      quartosDetalhe: c.quartosDetalhe,
      comodidadesMarcadas: c.comodidadesMarcadas,
      destaques: c.destaques,
      regrasProprias: c.regrasProprias,
      textoBairro: c.textoBairro,
    }),
  };
}

let problemas = 0;
for (const c of CASAS_PARA_CADASTRAR) {
  const erros = conferir(c);
  problemas += erros.length;
  const fds = contaEstadia(tabelaDe(c), '2026-12-11', '2026-12-14');
  console.log(`\n${c.nome.pt} (${c.slug}) ${erros.length ? `— PROBLEMAS: ${erros.join('; ')}` : '— conferida'}`);
  console.log(
    `  ${c.capacidade} hóspedes · ${c.quartos} quartos (${c.suites} suítes) · ${contarCamas(c.quartosDetalhe)} camas · ${c.banheiros + c.lavabos / 2} banheiros · ${c.fotos.length} fotos`,
  );
  console.log(
    `  diária ${reais(c.diariaCentavos)}; sábado e domingo ${reais(c.diariaFimDeSemanaCentavos)}; fim de semana de sexta a segunda ${reais(fds.totalCentavos)} (${reais(fds.totalPixCentavos)} no Pix)`,
  );
  for (const grupo of pacotesComValores(tabelaDe(c))) {
    for (const o of grupo) {
      console.log(
        `  ${o.pacote.nome.pt}: ${o.pacote.entrada} a ${o.pacote.saida}, ${o.noites} diárias, ${reais(o.totalCentavos)} (${reais(o.totalPixCentavos)} no Pix; sinal ${reais(o.sinalCentavos)} ou ${reais(o.sinalPixCentavos)})`,
      );
    }
  }
  for (const b of c.bloqueios) console.log(`  bloqueio: entrada ${b.inicio}, saída ${b.fim} (${b.referencia})`);
}

if (problemas) {
  console.log(`\n${problemas} problema(s): nada foi gravado.`);
  process.exit(1);
}
if (!GRAVAR) {
  console.log('\nTudo conferido. Nada foi gravado: rode de novo com --gravar para cadastrar as casas, desligadas.');
  process.exit(0);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.log('Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local.');
  process.exit(1);
}
const db = createClient<Database>(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const DE_NOVO = 'Rode de novo com --gravar: o script completa o que faltou.';

/** Grava os pacotes e os bloqueios iniciais de uma casa. Se falhar, a casa fica gravada e a mensagem diz o que fazer. */
async function gravarPacotesEBloqueios(
  c: CasaParaCadastrar,
  casaId: string,
  pacotes: CasaParaCadastrar['pacotes'],
  bloqueios: CasaParaCadastrar['bloqueios'],
) {
  if (pacotes.length) {
    const r = await db.from('casas_pacotes').insert(pacotes.map((p) => linhaDePacote(casaId, p)));
    if (r.error) throw new Error(`${c.slug}: a casa está gravada (desligada), mas os pacotes não: ${r.error.message}. ${DE_NOVO}`);
  }
  if (bloqueios.length) {
    const r = await db
      .from('casas_bloqueios')
      .insert(bloqueios.map((b) => ({ casa_id: casaId, inicio: b.inicio, fim: b.fim, origem: 'manual', referencia: b.referencia })));
    if (r.error)
      throw new Error(`${c.slug}: a casa e os pacotes estão gravados (desligada), mas os bloqueios não: ${r.error.message}. ${DE_NOVO}`);
  }
}

for (const c of CASAS_PARA_CADASTRAR) {
  const { data: existente, error: erroBusca } = await db.from('casas').select('id, ativo').eq('slug', c.slug).maybeSingle();
  if (erroBusca) throw new Error(`Banco de dados: ${erroBusca.message}`);
  if (existente) {
    // a casa já existe: confere se os pacotes e os bloqueios iniciais chegaram (um --gravar pode ter caído no meio)
    const [pacotes, bloqueios] = await Promise.all([
      db.from('casas_pacotes').select('entrada, saida, grupo').eq('casa_id', existente.id),
      db.from('casas_bloqueios').select('inicio, fim, origem').eq('casa_id', existente.id),
    ]);
    if (pacotes.error || bloqueios.error) throw new Error(`Banco de dados: ${(pacotes.error ?? bloqueios.error)?.message}`);
    const falta = oQueFaltaNoBanco(c, { pacotes: pacotes.data, bloqueios: bloqueios.data });
    for (const conflito of falta.conflitos) console.log(`${c.slug}: não gravado, confira no painel: ${conflito}.`);
    if (!falta.pacotes.length && !falta.bloqueios.length) {
      console.log(`${c.slug}: já cadastrada (${existente.ativo ? 'no ar' : 'desligada'}), com os pacotes e os bloqueios; nada mudou.`);
      continue;
    }
    const resumo = `${falta.pacotes.length} pacote(s) e ${falta.bloqueios.length} bloqueio(s)`;
    if (existente.ativo) {
      console.log(`${c.slug}: já está NO AR e faltam ${resumo}; nada foi gravado (confira no painel).`);
      continue;
    }
    await gravarPacotesEBloqueios(c, existente.id, falta.pacotes, falta.bloqueios);
    console.log(`${c.slug}: já cadastrada (desligada); completados ${resumo} que faltavam.`);
    continue;
  }
  const { data: casa, error } = await db.from('casas').insert(linhaDaCasa(c)).select('id').single();
  if (error) {
    const dica = /column|coluna/i.test(error.message) ? ' A migração 20261113223000 já foi aplicada?' : '';
    throw new Error(`${c.slug}: ${error.message}.${dica}`);
  }
  await gravarPacotesEBloqueios(c, casa.id, c.pacotes, c.bloqueios);
  console.log(`${c.slug}: cadastrada DESLIGADA, com ${c.pacotes.length} pacotes e ${c.bloqueios.length} bloqueio(s).`);
}

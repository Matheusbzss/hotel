// Cadastra um pacote de avaliações reais (avaliacoes.json + fotos/, em material-recebido) e copia as fotos
// para public/avaliacoes/. Os textos entram como vieram, palavra por palavra.
//
// Sem opção, só CONTA o que falta. Com --gravar, grava no banco as que faltam, escondidas. Com --publicar,
// publica as do pacote. Com --local, grava só nos arquivos do computador (.data/avaliacoes), já publicadas,
// para ver a seção antes de mexer no banco.
//
// Uso, na pasta do projeto:
//   node --experimental-strip-types --env-file=.env.local scripts/importar-avaliacoes.ts [pasta] [--gravar] [--publicar] [--local]

import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

interface ItemPacote {
  nome: string;
  foto?: string | null;
  pais?: string | null;
  cidade?: string | null;
  idioma: 'pt' | 'es' | 'en';
  nota?: number | null;
  titulo?: string | null;
  texto: string;
  produto_slug?: string | null;
  data_avaliacao: string;
  origem: string;
  origem_url?: string | null;
}

const args = process.argv.slice(2);
const PASTA = args.find((a) => !a.startsWith('--')) ?? 'material-recebido/avaliacoes-tripadvisor';
const GRAVAR = args.includes('--gravar');
const PUBLICAR = args.includes('--publicar');
const LOCAL = args.includes('--local');

const pacote = JSON.parse(await readFile(path.join(PASTA, 'avaliacoes.json'), 'utf8')) as ItemPacote[];
const fotoNoSite = (i: ItemPacote) => (i.foto ? `/avaliacoes/${path.basename(i.foto)}` : null);

/** Copia as fotos do pacote para a pasta pública do site. */
async function copiarFotos() {
  await mkdir('public/avaliacoes', { recursive: true });
  for (const i of pacote) if (i.foto) await copyFile(path.join(PASTA, i.foto), path.join('public/avaliacoes', path.basename(i.foto)));
}

if (LOCAL) {
  await copiarFotos();
  await mkdir('.data/avaliacoes', { recursive: true });
  for (const i of pacote) {
    const id = randomUUID();
    await writeFile(
      path.join('.data/avaliacoes', `${id}.json`),
      JSON.stringify({
        id,
        nome: i.nome,
        pais: i.pais ?? undefined,
        cidade: i.cidade ?? undefined,
        produtoSlug: i.produto_slug ?? undefined,
        nota: i.nota ?? undefined,
        titulo: i.titulo ?? undefined,
        texto: i.texto,
        idioma: i.idioma,
        origem: i.origem,
        data: i.data_avaliacao,
        foto: fotoNoSite(i) ?? undefined,
        publicada: true,
      }),
    );
  }
  console.log(`${pacote.length} avaliações gravadas em .data/avaliacoes (só no computador).`);
  process.exit(0);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.log('Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local.');
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: existentes, error } = await db.from('avaliacoes').select('id, nome, data_avaliacao, texto, publicada');
if (error) throw new Error(error.message);
const noBanco = (i: ItemPacote) =>
  existentes.find((e) => e.nome === i.nome && e.data_avaliacao === i.data_avaliacao && e.texto === i.texto);
const faltam = pacote.filter((i) => !noBanco(i));
console.log(`No pacote: ${pacote.length}. Já no banco: ${pacote.length - faltam.length}. Faltam: ${faltam.length}.`);

if (GRAVAR) {
  await copiarFotos();
  if (faltam.length) {
    const { error: e } = await db.from('avaliacoes').insert(
      faltam.map((i) => ({
        nome: i.nome,
        pais: i.pais ?? null,
        cidade: i.cidade ?? null,
        produto_slug: i.produto_slug ?? null,
        nota: i.nota ?? null,
        titulo: i.titulo ?? null,
        texto: i.texto,
        idioma: i.idioma,
        origem: i.origem,
        origem_url: i.origem_url ?? null,
        data_avaliacao: i.data_avaliacao,
        foto: fotoNoSite(i),
      })),
    );
    if (e) throw new Error(e.message);
  }
  console.log(`Gravadas ${faltam.length}, escondidas.`);
}

if (PUBLICAR) {
  const ids = existentes.filter((e) => pacote.some((i) => noBanco(i)?.id === e.id)).map((e) => e.id);
  const { error: e } = await db.from('avaliacoes').update({ publicada: true }).in('id', ids);
  if (e) throw new Error(e.message);
  console.log(`Publicadas ${ids.length}.`);
}

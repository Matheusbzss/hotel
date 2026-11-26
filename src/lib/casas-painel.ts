import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { supabase, usarBanco } from './banco';
import { casasMudaram, gravarCentroNoComputador } from './casas';
import { centroDoCirculo, sortearDeslocamento, type Deslocamento, type Ponto } from './circulo-casa';

/**
 * O PONTO EXATO DA CASA, SÓ PARA O PAINEL (Fase 4, Etapa 7, parte C; Pacote 32). O dono cola no painel as coordenadas
 * do Google Maps, e o ponto vai para a tabela FECHADA casas_pontos só pela função do banco que grava o ponto (a mesma
 * que sorteia o deslocamento de 150 a 350 m uma vez e leva o centro público do círculo para casas.centro_lat e
 * casas.centro_lng). Ninguém lê a tabela direto: o painel lê o ponto pela outra função do banco, para mostrar ao dono o
 * que ficou salvo. tests/casas-privado.test.ts confere que só o código do painel cita as duas funções.
 *
 * O ponto nunca vai para o log, para o endereço da página ou para o cache: os erros saem sem número de coordenada
 * (semCoordenadas). No computador, sem o banco, o ponto e o sorteio ficam em .data/casas-pontos/<id>.json, e o centro,
 * no arquivo da casa, como o banco faz.
 */

const PASTA = path.join(process.cwd(), '.data', 'casas-pontos');
const arquivoDo = (id: string) => path.join(PASTA, `${id}.json`);

/** O ponto no computador, com o deslocamento sorteado na primeira marcação (mudar o ponto não sorteia de novo). */
type PontoNoComputador = Ponto & { deslocamento: Deslocamento };

/** Tira de uma mensagem os números com cara de coordenada (com 3 casas ou mais depois do ponto), antes de ir ao log. */
export const semCoordenadas = (mensagem: string) => mensagem.replace(/-?\d{1,3}[.,]\d{3,}/g, '…');

const mensagemDe = (e: unknown) => semCoordenadas(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

async function doComputador(id: string): Promise<PontoNoComputador | null> {
  try {
    return JSON.parse(await fs.readFile(arquivoDo(id), 'utf8')) as PontoNoComputador;
  } catch {
    return null;
  }
}

/** O ponto que o dono marcou, para o painel mostrar o que ficou salvo. null enquanto a casa não está marcada. */
export async function pontoDaCasa(casaId: string): Promise<Ponto | null> {
  if (!usarBanco()) {
    const p = await doComputador(casaId);
    return p ? { lat: p.lat, lng: p.lng } : null;
  }
  const { data, error } = await supabase().rpc('ponto_da_casa', { p_casa: casaId });
  if (error) throw new Error(`Banco de dados: ${mensagemDe(error)}`);
  const p = data?.[0];
  return p ? { lat: p.lat, lng: p.lng } : null;
}

/**
 * Marca a casa no mapa, ou muda o ponto dela (o círculo anda junto, com o mesmo sorteio). Quem chama já conferiu o
 * login e as coordenadas (a ação marcar_no_mapa, src/app/api/admin/casas/[id]/acoes/route.ts). Devolve false se não
 * deu para gravar: nada mudou, e o motivo vai para o log sem o ponto.
 */
export async function marcarPontoDaCasa(casaId: string, ponto: Ponto): Promise<boolean> {
  try {
    if (usarBanco()) {
      const { error } = await supabase().rpc('marcar_ponto_da_casa', { p_casa: casaId, p_lat: ponto.lat, p_lng: ponto.lng });
      if (error) throw new Error(`Banco de dados: ${error.code ?? ''} ${error.message}`);
    } else {
      if (process.env.VERCEL) throw new Error('Banco de casas não configurado: faltam SUPABASE_URL e SUPABASE_SECRET_KEY na Vercel.');
      const deslocamento = (await doComputador(casaId))?.deslocamento ?? sortearDeslocamento();
      await fs.mkdir(PASTA, { recursive: true });
      await fs.writeFile(arquivoDo(casaId), JSON.stringify({ lat: ponto.lat, lng: ponto.lng, deslocamento }, null, 2));
      await gravarCentroNoComputador(casaId, centroDoCirculo(ponto, deslocamento));
    }
  } catch (e) {
    console.error(`[casas] não deu para marcar a casa ${casaId} no mapa: ${mensagemDe(e)}`);
    return false;
  }
  casasMudaram();
  return true;
}

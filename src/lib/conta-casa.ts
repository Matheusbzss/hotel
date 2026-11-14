// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { gruposDePacotes, noitesDoPacote, type ContaEstadia, type Pacote, type TipoNoite } from './estadia.ts';
import { somarDias } from './validacao.ts';

/**
 * O CALENDÁRIO E A CONTA DA PÁGINA DA CASA (Fase 4, Etapa 7, parte E), no navegador: as linhas da conta e os ajustes
 * de datas que o calendário oferece quando a escolha esbarra numa regra (o mínimo de noites, o fim de semana junto,
 * o pacote inteiro). A conta em si é a de src/lib/estadia.ts, a mesma que o servidor refaz antes de cobrar. Nada aqui
 * puxa o banco nem bibliotecas grandes; os testes estão em tests/casa-pagina.test.ts.
 */

/** Uma linha da conta: as noites do mesmo tipo e da mesma diária juntas; as de um pacote, numa linha só. */
export interface LinhaDaConta {
  tipo: TipoNoite;
  noites: number;
  diariaCentavos: number;
  pacote?: Pacote;
}

/** As noites da estadia em linhas, na ordem em que aparecem ("1 diária de semana", "2 diárias de sábado e domingo"). */
export function linhasDaConta(noites: ContaEstadia['noites']): LinhaDaConta[] {
  const linhas: LinhaDaConta[] = [];
  const porChave = new Map<string, LinhaDaConta>();
  for (const n of noites) {
    const chave = n.pacote ? `pacote:${n.pacote.entrada}:${n.pacote.saida}` : `${n.tipo}:${n.diariaCentavos}`;
    const linha = porChave.get(chave);
    if (linha) {
      linha.noites++;
      continue;
    }
    const nova: LinhaDaConta = { tipo: n.tipo, noites: 1, diariaCentavos: n.diariaCentavos, ...(n.pacote ? { pacote: n.pacote } : {}) };
    porChave.set(chave, nova);
    linhas.push(nova);
  }
  return linhas;
}

/** As datas que fecham o fim de semana: a entrada recua até a primeira noite que falta, a saída vai até o dia seguinte à última. */
export function datasComOFimDeSemana(entrada: string, saida: string, faltam: readonly string[]): { entrada: string; saida: string } {
  if (!faltam.length) return { entrada, saida };
  const ordem = [...faltam].sort();
  const depoisDaUltima = somarDias(ordem[ordem.length - 1], 1);
  return { entrada: ordem[0] < entrada ? ordem[0] : entrada, saida: depoisDaUltima > saida ? depoisDaUltima : saida };
}

/** As datas que levam o pacote inteiro: a estadia cresce até cobrir a entrada e a saída dele. */
export function datasComOPacote(entrada: string, saida: string, p: Pick<Pacote, 'entrada' | 'saida'>): { entrada: string; saida: string } {
  return { entrada: p.entrada < entrada ? p.entrada : entrada, saida: p.saida > saida ? p.saida : saida };
}

/**
 * As opções de pacote que pegam a noite, do mesmo feriado. Tocar no dia 28/12 (só o Réveillon de 5 diárias tem essa
 * noite) devolve uma opção; no 30/12, as duas (o cliente escolhe). Noite fora de pacote: nenhuma.
 */
export function pacotesDaNoite(pacotes: readonly Pacote[], noite: string): Pacote[] {
  for (const grupo of gruposDePacotes(pacotes)) {
    const comANoite = grupo.filter((p) => noitesDoPacote(p).includes(noite));
    if (comANoite.length) return comANoite;
  }
  return [];
}

/** As opções do mesmo feriado de um pacote (o próprio pacote, se ele não tem grupo). */
export const opcoesDoPacote = (pacotes: readonly Pacote[], p: Pacote): Pacote[] =>
  p.grupo ? pacotes.filter((x) => x.grupo === p.grupo) : pacotes.filter((x) => x === p);

/** O pacote de cada noite (a primeira opção do grupo que a pega), para marcar o calendário. */
export function pacotePorNoite(pacotes: readonly Pacote[]): Map<string, Pacote> {
  const mapa = new Map<string, Pacote>();
  for (const grupo of gruposDePacotes(pacotes)) for (const p of grupo) for (const n of noitesDoPacote(p)) if (!mapa.has(n)) mapa.set(n, p);
  return mapa;
}

/** A primeira noite livre a partir de `desde` (o calendário abre no mês dela, e não num mês todo ocupado). */
export function primeiraNoiteLivre(desde: string, ocupadas: ReadonlySet<string>, limite = 400): string {
  let noite = desde;
  for (let i = 0; i < limite && ocupadas.has(noite); i++) noite = somarDias(noite, 1);
  return noite;
}

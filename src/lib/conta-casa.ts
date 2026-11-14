// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { noitesEntre } from './diarias.ts';
import {
  contaEstadia,
  gruposDePacotes,
  noiteDeFimDeSemana,
  noitesDoFimDeSemana,
  noitesDoPacote,
  type ContaEstadia,
  type OpcoesEstadia,
  type Pacote,
  type TabelaEstadia,
  type TipoNoite,
} from './estadia.ts';
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

/* ------------------------------------------------------------------ */
/* Os ajustes de um toque                                              */

/** Um ajuste de datas que o calendário oferece, já conferido: a conta das datas finais passa. */
export interface AjusteDeDatas {
  entrada: string;
  saida: string;
  noites: number;
  /**
   * O que o botão diz que muda: 'pacote' (a estadia passa a levar um pacote inteiro), 'fim-de-semana' (passa a levar a
   * sexta, o sábado e o domingo), 'chegada' ou 'saida' (só a data muda).
   */
  tipo: 'pacote' | 'fim-de-semana' | 'chegada' | 'saida';
  /** tipo 'pacote': o pacote que a estadia passa a levar inteiro (o primeiro, se forem dois, como Natal e Réveillon). */
  pacote?: Pacote;
  /** tipo 'pacote': todos os pacotes que a estadia passa a levar, na ordem das datas. */
  pacotes?: Pacote[];
}

/** Quantas regras um ajuste resolve em sequência (o mínimo que leva ao sábado, o sábado que leva ao Natal...). */
const PASSOS_DO_AJUSTE = 4;
/** Quantos botões de ajuste o calendário mostra, no máximo. */
export const AJUSTES_NO_MAXIMO = 3;

type Datas = { entrada: string; saida: string };

/**
 * As opções de um pacote pela metade que a estadia pode levar sem cair em outra opção: as que têm TODAS as noites do
 * feriado que a estadia já pega. Ex.: de 21/12 a 30/12, a estadia pega 28 e 29/12 do Réveillon; só o de 5 diárias (28/12
 * a 02/01) tem as duas. Levar o de 4 diárias (29/12 a 02/01) daria as mesmas datas e cairia no de 5.
 */
function opcoesQueCabem(grupo: readonly Pacote[], noites: ReadonlySet<string>): Pacote[] {
  const pegas = new Set(grupo.flatMap(noitesDoPacote).filter((n) => noites.has(n)));
  return grupo.filter((p) => {
    const doPacote = new Set(noitesDoPacote(p));
    return [...pegas].every((n) => doPacote.has(n));
  });
}

/** As datas que resolvem a regra em que a conta esbarrou, sempre aumentando a estadia. */
function crescer(d: Datas, c: ContaEstadia): Datas[] {
  if (c.motivo === 'minimo') return [{ entrada: d.entrada, saida: somarDias(d.entrada, c.minimoNoites) }];
  if (c.motivo === 'fim-de-semana') return [datasComOFimDeSemana(d.entrada, d.saida, c.faltam ?? [])];
  if (c.motivo === 'pacote' && c.pacoteIncompleto?.length) {
    const noites = new Set(noitesEntre(d.entrada, d.saida));
    return opcoesQueCabem(c.pacoteIncompleto, noites).map((p) => datasComOPacote(d.entrada, d.saida, p));
  }
  return [];
}

/**
 * Os ajustes de um toque quando a escolha esbarra numa regra (Etapa 7, parte E), JÁ RESOLVIDOS ATÉ O FIM: cada ajuste
 * é aplicado e a conta é refeita; se o resultado esbarra em outra regra (o mínimo que leva ao sábado, o sábado que leva
 * ao Natal), o ajuste seguinte entra junto, até a estadia passar. Assim o botão mostra as datas finais e nunca promete
 * um pacote que não entrega. Primeiro os que aumentam a estadia (levar o pacote, o fim de semana, a saída depois do
 * mínimo); depois as saídas mais curtas que já passam sozinhas (chegar antes, para cumprir o mínimo; sair antes do fim
 * de semana ou do pacote). Datas repetidas saem; no máximo AJUSTES_NO_MAXIMO.
 */
export function ajustesDaEstadia(t: TabelaEstadia, entrada: string, saida: string, opcoes: OpcoesEstadia = {}): AjusteDeDatas[] {
  const conta = contaEstadia(t, entrada, saida, opcoes);
  if (conta.ok || !conta.motivo || !['minimo', 'fim-de-semana', 'pacote'].includes(conta.motivo)) return [];
  const original = new Set(noitesEntre(entrada, saida));
  const pacotesAntes = new Set(conta.pacotes);

  // aumenta até a conta passar (ou desiste depois de PASSOS_DO_AJUSTE regras)
  const resolver = (d: Datas, passos: number): Datas[] => {
    const c = contaEstadia(t, d.entrada, d.saida, opcoes);
    if (c.ok) return [d];
    if (passos >= PASSOS_DO_AJUSTE) return [];
    return crescer(d, c)
      .filter((n) => n.entrada !== d.entrada || n.saida !== d.saida)
      .flatMap((n) => resolver(n, passos + 1));
  };

  // as alternativas mais curtas: só entram se passarem sozinhas
  const alternativas: Datas[] = [];
  const passa = (d: Datas) => d.entrada < d.saida && contaEstadia(t, d.entrada, d.saida, opcoes).ok;
  if (conta.motivo === 'minimo') alternativas.push({ entrada: somarDias(saida, -conta.minimoNoites), saida });
  if (conta.motivo === 'fim-de-semana') {
    // sair na sexta do primeiro fim de semana que a estadia pega (sem a noite de sexta)
    const primeira = [...original].sort().find((n) => noitesDoFimDeSemana(n).length > 0);
    if (primeira) alternativas.push({ entrada, saida: noitesDoFimDeSemana(primeira)[0] });
  }
  if (conta.motivo === 'pacote' && conta.pacoteIncompleto?.length) {
    // sair na véspera da primeira noite do feriado que a estadia pega
    const doGrupo = new Set(conta.pacoteIncompleto.flatMap(noitesDoPacote));
    const primeira = [...original].sort().find((n) => doGrupo.has(n));
    if (primeira) alternativas.push({ entrada, saida: primeira });
  }

  const candidatas = [...crescer({ entrada, saida }, conta).flatMap((d) => resolver(d, 1)), ...alternativas.filter(passa)];
  const vistas = new Set<string>();
  const ajustes: AjusteDeDatas[] = [];
  for (const d of candidatas) {
    const chave = `${d.entrada}|${d.saida}`;
    if (vistas.has(chave) || (d.entrada === entrada && d.saida === saida)) continue;
    vistas.add(chave);
    const final = contaEstadia(t, d.entrada, d.saida, opcoes);
    const noites = noitesEntre(d.entrada, d.saida);
    const novos = final.pacotes.filter((p) => !pacotesAntes.has(p));
    const ganhouFimDeSemana = noites.some((n) => !original.has(n) && (noiteDeFimDeSemana(n) || noitesDoFimDeSemana(n)[0] === n));
    const tipo: AjusteDeDatas['tipo'] = novos.length
      ? 'pacote'
      : ganhouFimDeSemana
        ? 'fim-de-semana'
        : d.saida === saida && d.entrada !== entrada
          ? 'chegada'
          : 'saida';
    ajustes.push({
      entrada: d.entrada,
      saida: d.saida,
      noites: noites.length,
      tipo,
      ...(novos.length ? { pacote: novos[0], pacotes: novos } : {}),
    });
  }
  return ajustes.slice(0, AJUSTES_NO_MAXIMO);
}

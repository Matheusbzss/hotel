/** Validações usadas no navegador (checkout) e no servidor (API). */

import type { Idioma } from '../i18n/config';

export const CIDADES_HOSPEDAGEM = ['buzios', 'cabo-frio', 'arraial-do-cabo'] as const;
export type CidadeHospedagem = (typeof CIDADES_HOSPEDAGEM)[number];

export const NOME_CIDADE_HOSPEDAGEM: Record<CidadeHospedagem, string> = {
  buzios: 'Búzios',
  'cabo-frio': 'Cabo Frio',
  'arraial-do-cabo': 'Arraial do Cabo',
};

/** Códigos de país mais comuns entre os clientes (o campo também aceita outros). */
export const DDIS = [
  { ddi: '55', pais: 'BR', bandeira: '🇧🇷' },
  { ddi: '54', pais: 'AR', bandeira: '🇦🇷' },
  { ddi: '598', pais: 'UY', bandeira: '🇺🇾' },
  { ddi: '56', pais: 'CL', bandeira: '🇨🇱' },
  { ddi: '595', pais: 'PY', bandeira: '🇵🇾' },
  { ddi: '591', pais: 'BO', bandeira: '🇧🇴' },
  { ddi: '51', pais: 'PE', bandeira: '🇵🇪' },
  { ddi: '57', pais: 'CO', bandeira: '🇨🇴' },
  { ddi: '52', pais: 'MX', bandeira: '🇲🇽' },
  { ddi: '1', pais: 'US/CA', bandeira: '🇺🇸' },
  { ddi: '351', pais: 'PT', bandeira: '🇵🇹' },
  { ddi: '34', pais: 'ES', bandeira: '🇪🇸' },
  { ddi: '44', pais: 'UK', bandeira: '🇬🇧' },
  { ddi: '33', pais: 'FR', bandeira: '🇫🇷' },
  { ddi: '49', pais: 'DE', bandeira: '🇩🇪' },
  { ddi: '39', pais: 'IT', bandeira: '🇮🇹' },
] as const;

/**
 * O país que os formulários sugerem em cada idioma: o DDI do telefone e o país da cobrança do cartão. Sugestão a
 * confirmar com o dono (es-ar → Argentina; es neutro → Chile; pt → Brasil; en → EUA): para mudar, só mexer aqui.
 */
export const PAIS_PADRAO: Record<Idioma, { ddi: string; pais: string }> = {
  pt: { ddi: '55', pais: 'BR' },
  en: { ddi: '1', pais: 'US' },
  es: { ddi: '56', pais: 'CL' },
  'es-ar': { ddi: '54', pais: 'AR' },
};

export const soDigitos = (v: string) => v.replace(/\D/g, '');

export function cpfValido(valor: string): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = calc(cpf.slice(0, 9), 10);
  const d2 = calc(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

export function passaporteValido(valor: string): boolean {
  const p = valor.replace(/[\s-]/g, '');
  return /^[A-Za-z0-9]{5,20}$/.test(p);
}

export function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim()) && valor.length <= 160;
}

/**
 * Os domínios de e-mail mais usados por quem compra no site (Argentina, Chile e Brasil, mais os grandes de qualquer lugar):
 * é com eles que sugestaoDeEmail compara um domínio digitado com erro. Os que estão aqui nunca recebem sugestão (mail.com e
 * email.com existem, e ficariam a uma letra do gmail.com).
 */
export const DOMINIOS_COMUNS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'live.com',
  'me.com',
  'msn.com',
  // sem o aol.com: raro aqui, e o "bol.com" (o bol.com.br sem o .br) ganharia a sugestão errada
  'mail.com',
  'email.com',
  'gmx.com',
  'protonmail.com',
  'proton.me',
  // Argentina
  'hotmail.com.ar',
  'yahoo.com.ar',
  'outlook.com.ar',
  'live.com.ar',
  'fibertel.com.ar',
  'arnet.com.ar',
  'speedy.com.ar',
  // Chile
  'live.cl',
  'vtr.net',
  'yahoo.es',
  'hotmail.es',
  'outlook.es',
  // Brasil
  'hotmail.com.br',
  'yahoo.com.br',
  'outlook.com.br',
  'live.com.br',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'ig.com.br',
] as const;

/**
 * Quantas trocas separam dois textos: uma letra a mais, a menos, trocada por outra, ou duas vizinhas invertidas
 * ("hotmial"). Para de contar acima de `teto`.
 */
function distancia(a: string, b: string, teto: number): number {
  if (Math.abs(a.length - b.length) > teto) return teto + 1;
  const linhas: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) linhas[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(linhas[i - 1][j] + 1, linhas[i][j - 1] + 1, linhas[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, linhas[i - 2][j - 2] + 1);
      linhas[i][j] = d;
    }
  }
  return linhas[a.length][b.length];
}

/**
 * Pacote 34 (P13): o e-mail com um erro de digitação comum no domínio ("gmail.con", "hotmial.com", "gmial.com") passava sem
 * aviso, e o link do pedido, os vouchers e os lembretes iam para um endereço que não existe. Devolve o e-mail com o domínio
 * mais parecido da lista (DOMINIOS_COMUNS), a até 2 trocas e sem empate, ou null: e-mail sem formato de e-mail, domínio da
 * lista, ou longe de todos (o da empresa do cliente, por exemplo). Só sugere: quem troca é o cliente, com um toque.
 * O nome do provedor (antes do primeiro ponto) e o final (depois dele) são conferidos separados (revisão do Pacote 34):
 * com o nome certo, só um final a 1 troca do da lista ("hotmail.con", "yahoo.com.arr"); com o final igual, só um nome a
 * até 2 trocas (1 nos nomes curtos: "hotmial.com", "gmial.com"). Assim um provedor certo de outro país ("hotmail.fr",
 * "yahoo.de", "live.it") ou outro provedor de verdade ("aol.com", "att.net", "qq.com") nunca recebe sugestão.
 */
export function sugestaoDeEmail(email: string): string | null {
  const limpo = email.trim();
  if (!emailValido(limpo)) return null;
  const arroba = limpo.lastIndexOf('@');
  const usuario = limpo.slice(0, arroba);
  const dominio = limpo.slice(arroba + 1).toLowerCase();
  if ((DOMINIOS_COMUNS as readonly string[]).includes(dominio)) return null;
  // o Gmail só tem o gmail.com: "gmail.com.ar" e "gmail.cl" são erro de digitação
  if (/^gmail\.[a-z.]+$/.test(dominio)) return `${usuario}@gmail.com`;
  const partes = (d: string) => {
    const ponto = d.indexOf('.');
    return { nome: d.slice(0, ponto), fim: d.slice(ponto + 1) };
  };
  const digitado = partes(dominio);
  const tetoDoNome = digitado.nome.length >= 5 ? 2 : 1;
  let melhor: string | null = null;
  let menor = Number.POSITIVE_INFINITY;
  let empate = false;
  for (const certo of DOMINIOS_COMUNS) {
    const c = partes(certo);
    let d: number;
    if (digitado.nome === c.nome) {
      d = distancia(digitado.fim, c.fim, 1);
      if (d > 1) continue;
    } else if (digitado.fim === c.fim) {
      d = distancia(digitado.nome, c.nome, tetoDoNome);
      if (d > tetoDoNome) continue;
    } else {
      // os dois errados ao mesmo tempo ("gmial.con"): só 1 troca em cada e só para um ".com"
      if (c.fim !== 'com') continue;
      const noNome = distancia(digitado.nome, c.nome, 1);
      const noFim = distancia(digitado.fim, c.fim, 1);
      if (noNome > 1 || noFim > 1) continue;
      d = noNome + noFim;
    }
    if (d < menor) {
      menor = d;
      melhor = certo;
      empate = false;
    } else if (d === menor) empate = true;
  }
  return melhor && !empate ? `${usuario}@${melhor}` : null;
}

/**
 * Quantos algarismos tem o telefone de cada país da lista sem o código do país (o código de área e o número): é com isso
 * que semDdiRepetido sabe se os primeiros algarismos são o código do país repetido ou parte do número. No Brasil, 10 ou 11
 * (o DDD 55, do Rio Grande do Sul, começa com os mesmos algarismos do código do país); na Argentina, 10, ou 11 com o 9 do
 * celular; no Chile, 9.
 */
const ALGARISMOS_SEM_O_PAIS: Record<string, readonly [number, number]> = {
  '55': [10, 11],
  '54': [10, 11],
  '598': [8, 8],
  '56': [9, 9],
  '595': [9, 9],
  '591': [8, 8],
  '51': [9, 9],
  '57': [10, 10],
  '52': [10, 10],
  '1': [10, 10],
  '351': [9, 9],
  '34': [9, 9],
  '44': [10, 10],
  '33': [9, 9],
  '49': [10, 11],
  '39': [9, 10],
};

/** O texto sem os `n` primeiros algarismos e sem os separadores que vinham logo depois deles (espaço, hífen, ponto, parêntese). */
function semOsPrimeirosAlgarismos(texto: string, n: number): string {
  let vistos = 0;
  let i = 0;
  while (i < texto.length && vistos < n) {
    if (/\d/.test(texto[i])) vistos++;
    i++;
  }
  return texto.slice(i).replace(/^[\s().-]+/, '');
}

/**
 * Pacote 34 (P5): o telefone sem o código do país repetido no começo. A caixa do país fica ao lado do número, mas a ajuda
 * antiga pedia "con el código del país" e o cliente digitava o +54 de novo: o pedido saía com "+54 5491155550000", e é
 * por esse número que a equipe manda o ponto de encontro. Com "+" ou "00" na frente, o código escrito vale: o da caixa sai
 * do número e, se for o código de outro país da lista, a caixa passa para ele ("+56 9…" com a caixa na Argentina). Sem
 * eles, os primeiros algarismos só saem quando são o código da caixa E o número, com eles, fica comprido demais para o país
 * (ALGARISMOS_SEM_O_PAIS): "55 21 99999-9999" perde o 55; "55 99123-4567" (DDD 55) fica como está. O número volta como
 * foi digitado (espaços e hífen), só sem o código e o que vinha antes dele.
 */
export function semDdiRepetido(ddi: string, numero: string): { ddi: string; numero: string } {
  const d = soDigitos(ddi);
  const inicio = /^[\s(]*(\+|00)?[\s(]*/.exec(numero);
  const explicito = Boolean(inicio?.[1]);
  const resto = numero.slice(inicio?.[0].length ?? 0);
  const digitos = soDigitos(resto);
  if (explicito) {
    const escrito = DDIS.map((x) => x.ddi as string)
      .filter((x) => digitos.startsWith(x))
      .sort((a, b) => b.length - a.length)[0];
    if (escrito && digitos.length - escrito.length >= 6) return { ddi: escrito, numero: semOsPrimeirosAlgarismos(resto, escrito.length) };
    return { ddi: d, numero };
  }
  const faixa = ALGARISMOS_SEM_O_PAIS[d];
  const sem = digitos.length - d.length;
  if (faixa && d && digitos.startsWith(d) && digitos.length > faixa[1] && sem >= faixa[0] && sem <= faixa[1]) {
    return { ddi: d, numero: semOsPrimeirosAlgarismos(resto, d.length) };
  }
  return { ddi: d, numero };
}

/** Valida telefone a partir do DDI e do número nacional (sem o código do país repetido: semDdiRepetido). */
export function telefoneValido(ddi: string, numero: string): boolean {
  const t = semDdiRepetido(ddi, numero);
  const d = soDigitos(t.ddi);
  const n = soDigitos(t.numero);
  if (!d || d.length > 3) return false;
  if (d === '55') return n.length === 10 || n.length === 11;
  return n.length >= 6 && n.length <= 14;
}

/** O telefone como o pedido e a cotação gravam: "+54 91155550000", sem o código do país repetido (semDdiRepetido). */
export function telefoneParaGravar(ddi: string, numero: string): string {
  const t = semDdiRepetido(ddi, numero);
  return `+${soDigitos(t.ddi)} ${soDigitos(t.numero)}`;
}

/** Data de hoje (AAAA-MM-DD) no fuso de Búzios. */
export function hojeEmBuzios(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

export function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Aceita datas de hoje até 1 ano à frente. */
export function dataPasseioValida(dataIso: string, agora: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return false;
  const d = new Date(`${dataIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dataIso) return false;
  const hoje = hojeEmBuzios(agora);
  return dataIso >= hoje && dataIso <= somarDias(hoje, 366);
}

export function formatarDataIso(dataIso: string, locale: string): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** Algoritmo de Luhn para o número do cartão. */
export function cartaoValido(numero: string): boolean {
  const n = soDigitos(numero);
  if (n.length < 13 || n.length > 19) return false;
  let soma = 0;
  let dobrar = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (dobrar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobrar = !dobrar;
  }
  return soma % 10 === 0;
}

export function validadeCartaoValida(mm: number, aa: number, agora: Date = new Date()): boolean {
  if (!mm || mm < 1 || mm > 12) return false;
  const ano = aa < 100 ? 2000 + aa : aa;
  const fimDoMes = new Date(Date.UTC(ano, mm, 1));
  return fimDoMes.getTime() > agora.getTime() && ano < agora.getUTCFullYear() + 25;
}

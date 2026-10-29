/** Validações usadas no navegador (checkout) e no servidor (API). */

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

/** Valida telefone a partir do DDI e do número nacional. */
export function telefoneValido(ddi: string, numero: string): boolean {
  const d = soDigitos(ddi);
  const n = soDigitos(numero);
  if (!d || d.length > 3) return false;
  if (d === '55') return n.length === 10 || n.length === 11;
  return n.length >= 6 && n.length <= 14;
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

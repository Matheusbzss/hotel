import { CIDADES, type Cidade, type Passeio } from '@/data/passeios';
import { fmt, rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { ehDiaInteiro, faixaDuracao, horasCurtas, horasDoTexto, type FaixaDuracao } from './duracao';
import { faixasIdade } from './orcamento';
import { precoPasseio, type PrecoPasseio } from './passeio-view';
import { regraCriancas } from './precos';

/** Uma linha do boletim: os fatos do passeio em células, prontos para o navegador. */
export interface ItemBoletim extends PrecoPasseio {
  categoria: Passeio['categoria'];
  faixa: FaixaDuracao;
  horas: string;
  /** "por pessoa" ou "por buggy · até 2" na coluna "preço por". */
  paraQuem: string;
  /** Regra curta de crianças para a coluna do computador. */
  criancas: string;
  checkoutHref: string;
}

export function criancasCurto(p: Passeio, d: Dicionario): string {
  const B = d.boletim.criancas;
  const regra = regraCriancas(p);
  const partes: string[] = [];
  if (p.unidade !== 'pessoa') partes.push(B.contam);
  else {
    const f = faixasIdade(regra);
    if (f.gratis && f.meia) partes.push(fmt(B.gratisMeia, { g: f.gratis[1], m1: f.meia[0], m2: f.meia[1] }));
    else if (f.gratis) partes.push(fmt(B.gratis, { g: f.gratis[1] }));
    else partes.push(B.todos);
  }
  if (regra.idadeMinima) partes.push(fmt(B.idadeMin, { n: regra.idadeMinima }));
  return partes.join('; ');
}

export function itemBoletim(p: Passeio, idioma: Idioma, d: Dicionario): ItemBoletim {
  const base = precoPasseio(p, idioma, d);
  const dia = ehDiaInteiro(p.duracao.pt);
  const h = horasDoTexto(p.duracao.pt);
  return {
    ...base,
    categoria: p.categoria,
    faixa: faixaDuracao(h, dia),
    horas: horasCurtas(h, d.boletim.dia, dia),
    paraQuem: base.unidadeCurta,
    criancas: criancasCurto(p, d),
    checkoutHref: rota(idioma, `/checkout/${p.slug}`),
  };
}

/** Itens em ordem de cidade (Búzios, Arraial, Cabo Frio, Rio) e, dentro dela, na ordem do cadastro. */
export function itensBoletim(passeios: Passeio[], idioma: Idioma, d: Dicionario): ItemBoletim[] {
  const ordem = (c: Cidade) => CIDADES[c].ordem;
  return passeios
    .map((p, i) => ({ p, i }))
    .sort((a, b) => ordem(a.p.cidade) - ordem(b.p.cidade) || a.i - b.i)
    .map(({ p }) => itemBoletim(p, idioma, d));
}

import { dicionario } from '@/i18n';
import { rota, type Idioma } from '@/i18n/config';
import { urlDoSite } from '@/lib/site';

/**
 * O caminho até a página (Início > Passeios > Nome), para o Google mostrar o site em camadas nos resultados.
 * Recebe as páginas abaixo da inicial, com o caminho em português: `rota` traduz.
 */
export function migalhas(idioma: Idioma, itens: { nome: string; caminho: string }[]) {
  const base = urlDoSite();
  const todos = [{ nome: dicionario(idioma).nav.inicio, caminho: '/' }, ...itens];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: todos.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.nome,
      item: `${base}${rota(idioma, item.caminho)}`,
    })),
  };
}

/** Reais com duas casas, como o Google pede no preço. */
export const precoNosDados = (centavos: number) => (centavos / 100).toFixed(2);

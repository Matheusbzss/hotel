import Link from 'next/link';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, rota, type Idioma } from '@/i18n/config';
import { idiomaDeConteudo } from '@/i18n/conteudo';
import {
  MINIMO_NO_SITE,
  NOME_DA_ORIGEM,
  notaDaAgencia,
  origemDaNota,
  trechoDaAvaliacao,
  trechosDoCartao,
  type Avaliacao,
} from '@/lib/avaliacao';

/**
 * Cartão compacto de opiniões perto da reserva (desenho A, escolhido pelo dono em 08/11/2026 entre A, B e C).
 * A nota média e a contagem são só das avaliações da agência — o título deixa isso claro —, com a fonte quando
 * todas vieram do mesmo site ("5 opiniões do Tripadvisor", a mesma regra da página inicial), 2 trechos
 * curtos (quem cita o passeio vem primeiro; frase inteira antes de frase cortada) e o link para a seção
 * de opiniões da página inicial. Some sem o mínimo publicado (a seção de destino do link nem existiria)
 * ou sem nota da agência.
 */
export function OpinioesPasseio({
  avaliacoes,
  slug,
  idioma,
  d,
  className = '',
}: {
  /** As publicadas (src/lib/avaliacao.ts, avaliacoesDoSite). */
  avaliacoes: Avaliacao[];
  slug: string;
  idioma: Idioma;
  d: Dicionario;
  className?: string;
}) {
  const { media, total } = notaDaAgencia(avaliacoes);
  if (avaliacoes.length < MINIMO_NO_SITE || total === 0) return null;
  const trechos = trechosDoCartao(avaliacoes, slug, idioma);
  const nota = media.toLocaleString(LOCALE_INTL[idioma], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // a contagem com a fonte, como em src/components/home/Opinioes.tsx: com origens misturadas, só a contagem
  const contagem = total === 1 ? d.passeio.opinioesContagemUma : fmt(d.passeio.opinioesContagem, { n: total });
  const origem = origemDaNota(avaliacoes);
  const site = origem && NOME_DA_ORIGEM[origem];
  return (
    <section
      aria-labelledby="opinioes-passeio-titulo"
      className={`rounded-cartao border border-(--color-borda) bg-(--color-papel) p-5 sm:p-6 ${className}`}
    >
      <h2 id="opinioes-passeio-titulo" className="text-lead font-semibold">
        {d.passeio.opinioesTitulo}
      </h2>
      <p className="mt-1 flex items-center gap-1.5">
        {/* a mesma estrela da seção de opiniões da página inicial (src/components/home/Opinioes.tsx) */}
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-(--color-acao)" aria-hidden="true">
          <path fill="currentColor" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" />
        </svg>
        <span className="sr-only">{fmt(d.opinioes.nota, { n: nota })}</span>
        <span className="numeros font-semibold" aria-hidden="true">
          {nota}
        </span>
        <span className="text-small text-(--color-tinta-suave)">
          · {site ? fmt(d.opinioes.naOrigem, { contagem, origem: site }) : contagem}
        </span>
      </p>
      <ul className="mt-4 space-y-3 border-t border-(--color-borda) pt-4">
        {trechos.map((a) => (
          <li key={a.id} className="text-small">
            <p>“{trechoDaAvaliacao(a.texto)}”</p>
            <p className="mt-0.5 text-(--color-tinta-suave)">
              {a.nome}
              {a.idioma && a.idioma !== idiomaDeConteudo(idioma) && ` · ${d.opinioes.original[a.idioma]}`}
            </p>
          </li>
        ))}
      </ul>
      {/* #opinioes-titulo é o id que existe hoje na seção da página inicial */}
      <Link href={`${rota(idioma, '/')}#opinioes-titulo`} className="link mt-4 inline-block text-small">
        {d.passeio.opinioesVerTodas}
      </Link>
    </section>
  );
}

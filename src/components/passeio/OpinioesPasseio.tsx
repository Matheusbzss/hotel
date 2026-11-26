import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import { idiomaDeConteudo } from '@/i18n/conteudo';
import { notaDaAgencia, notaVisivel, opinioesDoCartao, trechoDaAvaliacao, type Avaliacao } from '@/lib/avaliacao';
import { ListaOpinioes, type OpiniaoDoCartao } from './ListaOpinioes';

/**
 * Cartão compacto de opiniões perto da reserva (desenho A, escolhido pelo dono em 08/11/2026 entre A, B e C).
 * A nota média e a contagem são só das avaliações da agência — o título deixa isso claro —, sem o nome do site
 * de onde vieram ("5,0 · 5 opiniões", como na página inicial; Pacote 27), 2 trechos
 * curtos (quem cita o passeio vem primeiro; frase inteira antes de frase cortada) e o "Ver todas as opiniões", que abre
 * o cartão ali mesmo, com todas as opiniões da agência (Pacote 34, ENT-11: antes, o link levava para a página inicial e o
 * cliente perdia o passeio e o horário escolhidos). Some sem o mínimo publicado ou sem nota da agência.
 * No transfer (Pacote 34, ENT-04), o mesmo cartão, com `slug` "transfer": as avaliações marcadas com ele vêm primeiro.
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
  if (!notaVisivel(avaliacoes)) return null;
  const { media, total } = notaDaAgencia(avaliacoes);
  // fechado, os 2 trechos de sempre; aberto, os mesmos e, depois deles, as outras da agência (src/lib/avaliacao.ts)
  const { iniciais, todas } = opinioesDoCartao(avaliacoes, slug, idioma);
  const nota = media.toLocaleString(LOCALE_INTL[idioma], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const contagem = total === 1 ? d.passeio.opinioesContagemUma : fmt(d.passeio.opinioesContagem, { n: total });
  const doCartao = (a: Avaliacao): OpiniaoDoCartao => ({
    id: a.id,
    nome: a.nome,
    ...(a.idioma && a.idioma !== idiomaDeConteudo(idioma) ? { original: d.opinioes.original[a.idioma] } : {}),
    trecho: trechoDaAvaliacao(a.texto),
    texto: a.texto,
  });
  return (
    <section
      aria-labelledby="opinioes-passeio-titulo"
      className={`rounded-cartao border border-(--color-borda) bg-(--color-papel) p-5 sm:p-6 ${className}`}
    >
      {/* chegando pela etiqueta da nota no topo, o título para abaixo da cápsula do menu */}
      <h2 id="opinioes-passeio-titulo" className="scroll-mt-24 text-lead font-semibold">
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
        <span className="text-small text-(--color-tinta-suave)">· {contagem}</span>
      </p>
      <ListaOpinioes
        iniciais={iniciais.map(doCartao)}
        todas={todas.map(doCartao)}
        idTitulo="opinioes-passeio-titulo"
        textos={{
          verTodas: d.passeio.opinioesVerTodas,
          verMenos: d.passeio.opinioesVerMenos,
          lerMais: d.opinioes.lerMais,
          lerMenos: d.opinioes.lerMenos,
        }}
      />
    </section>
  );
}

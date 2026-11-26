import 'server-only';
import { SEM_CASAS, noitesDaCasa, slugsDasCasas, type ContextoDasCasas } from './casa-no-carrinho';
import type { CarrinhoGuardado } from './carrinho-servidor';
import { bloqueiosDasCasasAgora, casasDaPagina } from './casas';
import { itensDeCasaDoCarrinho } from './pedido-carrinho';
import { casasAbertasPara } from './reserva-casas';

/**
 * O CONTEXTO DAS CASAS para conferir o carrinho (src/lib/casa-no-carrinho.ts), lido ANTES da conferência e só quando há
 * casa entre as escolhas: o carrinho só de passeio e transfer continua sem nenhuma leitura a mais (SEM_CASAS). Lê as casas
 * da página (as no ar; na prévia local, também as da prévia), as noites ocupadas de AGORA, sem cache (bloqueiosDasCasasAgora),
 * e se a reserva das casas vale para este visitante (o interruptor RESERVA_CASAS e o pagamento online). As noites presas
 * pelo próprio pedido do visitante saem das ocupadas pela lista dos itens do pedido (`itensProprios`).
 */
export async function contextoDasCasas({
  escolhas,
  admin,
  itensProprios = [],
}: {
  /** As escolhas a conferir: as do carrinho e, na POST /api/carrinho, a nova (a primeira casa de um carrinho também). */
  escolhas: readonly unknown[];
  admin: boolean;
  /** Os itens (item_pedido_id; nos arquivos, o voucher) do próprio pedido do visitante: as noites deles contam como livres. */
  itensProprios?: readonly string[];
}): Promise<ContextoDasCasas> {
  const slugs = slugsDasCasas(escolhas);
  if (!slugs.length) return SEM_CASAS;
  const [todas, aberta] = await Promise.all([casasDaPagina(), casasAbertasPara({ admin })]);
  const casas = todas.filter((c) => slugs.includes(c.slug));
  const bloqueios = await bloqueiosDasCasasAgora(casas.map((c) => c.id));
  const proprios = new Set(itensProprios);
  return {
    lido: true,
    aberta,
    casas: new Map(
      casas.map((casa) => [
        casa.slug,
        {
          casa,
          ...noitesDaCasa(
            bloqueios.filter((b) => b.casaId === casa.id),
            proprios,
          ),
        },
      ]),
    ),
  };
}

/**
 * O contexto do carrinho do cookie: as escolhas dele (e a nova, se houver) e, quando o carrinho já virou um pedido que espera
 * o pagamento, os itens de casa desse pedido (as noites que ele prendeu são livres para este mesmo visitante). Os itens do
 * pedido só são lidos quando o carrinho tem casa.
 */
export async function contextoDoCarrinho(
  carrinho: Pick<CarrinhoGuardado, 'itens' | 'pedidoId' | 'pedido'>,
  opcoes: { admin: boolean; nova?: unknown },
): Promise<ContextoDasCasas> {
  const escolhas = [...carrinho.itens.map((i) => i.escolha), ...(opcoes.nova !== undefined ? [opcoes.nova] : [])];
  if (!slugsDasCasas(escolhas).length) return SEM_CASAS;
  return contextoDasCasas({ escolhas, admin: opcoes.admin, itensProprios: await itensDeCasaDoCarrinho(carrinho) });
}

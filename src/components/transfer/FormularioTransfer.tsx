'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LUGARES, VEICULOS, precoTrecho, totalTransfer, type IdLugar, type Malas, type Veiculo } from '@/data/transfer';
import type { Dicionario } from '@/i18n';
import { fmt, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import type { EscolhaTransfer, TrechoEscolhido } from '@/lib/carrinho';
import { formatarHora } from '@/lib/horarios';
import { formatarCentavos, precoPixCentavos } from '@/lib/orcamento';
import { rastrear } from '@/lib/pixel';
import { textoMalas } from '@/lib/transfer-view';
import { formatarDataIso } from '@/lib/validacao';
import { useCarrinho } from '../carrinho/CarrinhoContexto';

export interface PontaPedido {
  lugar: IdLugar;
  endereco: string;
}

export interface TrechoPedido {
  saida: PontaPedido;
  destino: PontaPedido;
  data: string;
  hora: string;
}

/** O transfer montado no cartão da página (chega pela URL). */
export interface PedidoTransfer {
  veiculo: Veiculo;
  ida: TrechoPedido;
  volta?: TrechoPedido;
  passageiros: number;
  malas: Malas;
}

/**
 * O transfer avulso que chegou pela URL (links antigos e compartilhados): mostra o resumo e segue pelo mesmo
 * caminho de tudo no site, o carrinho e o checkout único (/checkout), onde entram os dados do titular, os voos,
 * as cadeirinhas e o pagamento. Nada é cobrado aqui.
 */
export function FormularioTransfer({
  idioma,
  locale,
  pedido,
  textos,
  links,
}: {
  idioma: Idioma;
  locale: string;
  pedido: PedidoTransfer;
  textos: {
    checkout: Dicionario['checkout'];
    transfer: Dicionario['transfer'];
    carrinho: Dicionario['carrinho'];
    preco: Dicionario['preco'];
    dataHora: string;
  };
  links: { checkout: string; transfer: string };
}) {
  const C = textos.checkout;
  const T = textos.transfer;
  const K = textos.carrinho;
  const router = useRouter();
  const { adicionar } = useCarrinho();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const trechos = [pedido.ida, ...(pedido.volta ? [pedido.volta] : [])];
  const totalReais = totalTransfer(
    trechos.map((t) => ({ saida: t.saida.lugar, destino: t.destino.lugar })),
    pedido.veiculo,
  );
  // no Pix, cada trecho com o desconto (o mesmo cálculo do servidor)
  const totalPix =
    totalReais === null
      ? null
      : trechos.reduce(
          (s, t) => s + precoPixCentavos(Math.round((precoTrecho(t.saida.lugar, t.destino.lugar, pedido.veiculo) ?? 0) * 100)),
          0,
        );
  const nomePonta = (p: PontaPedido) =>
    p.endereco ? `${texto(LUGARES[p.lugar].nome, idioma)}, ${p.endereco}` : texto(LUGARES[p.lugar].nome, idioma);
  const dataHora = (t: TrechoPedido) => fmt(textos.dataHora, { data: formatarDataIso(t.data, locale), hora: formatarHora(t.hora, idioma) });

  /** O trecho como o carrinho guarda: fora dos aeroportos, o hotel, a pousada ou o endereço. */
  const trecho = (t: TrechoPedido): TrechoEscolhido => {
    const ponta = (p: PontaPedido) => ({
      lugar: p.lugar,
      ...(p.endereco.trim() && !LUGARES[p.lugar].aeroporto ? { endereco: p.endereco.trim() } : {}),
    });
    return { saida: ponta(t.saida), destino: ponta(t.destino), data: t.data, hora: t.hora };
  };

  /** Põe o transfer no carrinho (o servidor confere e precifica) e segue para o checkout único. */
  async function seguir() {
    if (totalReais === null) return;
    setEnviando(true);
    setErro('');
    const escolha: EscolhaTransfer = {
      tipo: 'transfer',
      veiculo: pedido.veiculo,
      ida: trecho(pedido.ida),
      ...(pedido.volta ? { volta: trecho(pedido.volta) } : {}),
      passageiros: pedido.passageiros,
      malas: pedido.malas,
    };
    const r = await adicionar(escolha, { abrir: false });
    if (r.ok) {
      rastrear('AddToCart', { content_ids: ['transfer'], content_type: 'product', value: totalReais, currency: 'BRL' });
      // fica "adicionando" até a página do checkout abrir
      router.push(links.checkout);
      return;
    }
    setErro(r.erro === 'cheio' ? K.cheio : K.erroAdicionar);
    setEnviando(false);
  }

  return (
    <div className="max-w-[40rem]">
      <div className="tom-campo">
        <div className="px-6 pb-6 pt-6">
          <h2 className="text-lead font-semibold">{C.resumo}</h2>
          <p className="mt-4 text-lead font-semibold leading-tight">{T.titulo}</p>
          <p className="mt-1 text-small text-(--tinta-suave)">
            {texto(VEICULOS[pedido.veiculo].nome, idioma)} · {texto(VEICULOS[pedido.veiculo].modelos, idioma)}
          </p>
          <dl className="mt-5 space-y-4">
            {(
              [
                [T.ida, pedido.ida],
                [T.volta, pedido.volta],
              ] as const
            ).map(
              ([rotulo, t]) =>
                t && (
                  <div key={rotulo}>
                    <dt className="text-small">{rotulo}</dt>
                    <dd className="font-semibold">{dataHora(t)}</dd>
                    <dd className="text-small">
                      {nomePonta(t.saida)} → {nomePonta(t.destino)}
                    </dd>
                  </div>
                ),
            )}
            <div className="flex justify-between gap-4">
              <dt>{T.passageiros}</dt>
              <dd className="text-right font-semibold">{pedido.passageiros}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{T.malas}</dt>
              <dd className="text-right font-semibold">{textoMalas(pedido.malas, T)}</dd>
            </div>
          </dl>
          <Link href={links.transfer} className="link mt-4 inline-flex min-h-11 items-center text-small font-semibold text-white">
            {T.mudarTrajeto}
          </Link>
        </div>
        <div className="bg-[color-mix(in_oklab,white_10%,var(--fundo))] px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <span className="font-semibold">
              {pedido.volta ? T.totalIdaVolta : T.total} <span className="text-(--color-d2)">{textos.preco.noPix}</span>
            </span>
            <span className="numeros titulo leading-none">{totalPix === null ? '—' : formatarCentavos(totalPix, locale)}</span>
          </div>
          {totalReais !== null && (
            <p className="mt-2 flex justify-between gap-4 text-small text-(--tinta-suave)">
              <span>
                {pedido.volta ? T.totalIdaVolta : T.total} {textos.preco.noCartao}
              </span>
              <span className="numeros font-semibold">{formatarCentavos(Math.round(totalReais * 100), locale)}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {erro && (
          <p className="bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
            {erro}
          </p>
        )}
        <button type="button" className="botao w-full" onClick={seguir} disabled={enviando || totalReais === null} aria-busy={enviando}>
          {enviando ? K.adicionando : C.irParaPagamento}
        </button>
        {/* nenhum botão cobra na hora: os dados, a forma de pagamento e o valor são conferidos no checkout */}
        <p className="text-small">{K.semCobranca}</p>
      </div>
    </div>
  );
}

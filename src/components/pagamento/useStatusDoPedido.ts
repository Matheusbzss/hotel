'use client';

import { useEffect, useRef } from 'react';
import type { Idioma } from '@/i18n/config';
import type { ReservaPublica } from '@/lib/reserva-publica';

/**
 * A pergunta do status do pedido ao servidor (GET /api/reservas/[codigo]), num arquivo só dela: a tela de pagar
 * (CheckoutEmbutido.tsx), a página da reserva (StatusReserva.tsx) e a página do pedido fora da tela de pagar
 * (AoVoltarParaAAba.tsx) usam este gancho. Fora do CheckoutEmbutido.tsx, quem só confere o status não leva junto o
 * formulário da Stripe (@stripe/react-stripe-js): a página do pedido pago não baixa esse pedaço por causa do gancho.
 */

const INTERVALO_CONSULTA_MS = 4000;

/** O que a página precisa saber da resposta de GET /api/reservas/[codigo] (paraPublico do voucher consultado). */
export type LeituraDoPedido = Pick<ReservaPublica, 'status' | 'recusa' | 'reembolsoCentavos' | 'reembolsoPartes' | 'pagamentoRetido'>;

/** O que, numa leitura, muda a página que não espera pagamento: o status, o valor devolvido e as partes do reembolso. */
export type LeituraQueRedesenha = Pick<LeituraDoPedido, 'status' | 'reembolsoCentavos' | 'reembolsoPartes' | 'pagamentoRetido'>;

/** As partes de um reembolso que falhou como um texto só, para comparar (sem falha, vazio). */
const partesDaLeitura = ({ reembolsoPartes: p }: LeituraQueRedesenha): string =>
  p ? `${p.originalCentavos}|${p.pendenteCentavos}|${p.outroMeioCentavos}` : '';

/**
 * A leitura mudou o que a página mostra, comparada com o que ela mostrou ao abrir (o mesmo paraPublico dos dois lados):
 * o status do voucher, o valor devolvido (o do pedido inteiro: num pedido com vários itens, o reembolso de um voucher
 * só muda o valor de todos) ou as partes de um reembolso que falhou (a equipe registrou a devolução por outro meio: o
 * status continua "reembolsado" e o pendente vira devolvido de outro jeito). Sem valor devolvido e com zero, é o mesmo.
 * Até o reteste de 16-17/11 (R5) a comparação era só do status, e essas duas mudanças não redesenhavam a página aberta.
 */
export function leituraMudou(lido: LeituraQueRedesenha, antes: LeituraQueRedesenha): boolean {
  return (
    lido.status !== antes.status ||
    (lido.reembolsoCentavos ?? 0) !== (antes.reembolsoCentavos ?? 0) ||
    partesDaLeitura(lido) !== partesDaLeitura(antes) ||
    // o pagamento que chegou com o pedido cancelado: a equipe decidiu devolver (o pedido continua cancelado; Pacote 22)
    Boolean(lido.pagamentoRetido) !== Boolean(antes.pagamentoRetido)
  );
}

/**
 * O ritmo da pergunta: 'sempre', a cada 4 s e ao voltar para a aba (o pedido espera o pagamento); 'ao-voltar', só quando
 * o cliente volta para a aba (o pedido já não espera pagamento: pago, contestado, reembolsado, cancelado…).
 */
export type RitmoDaConsulta = 'sempre' | 'ao-voltar';

/**
 * Pergunta ao servidor o status do pedido enquanto `ativo`: no ritmo 'sempre', a cada 4 segundos; nos dois ritmos, na
 * hora em que o cliente volta para a aba (a aba que reaparece, ou a página que o navegador guardou inteira e devolveu
 * pelo botão de voltar). Na volta, a pergunta sai na hora, sem espera nem freio do lado do navegador: é ela que leva o
 * servidor a reler a sessão e a fazer o corte dos 30 minutos do Pix que ninguém gerou (os freios da consulta à Stripe
 * são só os do servidor, conferirNaStripe). Quem decide é o servidor; o navegador só pergunta e mostra.
 */
export function useStatusDoPedido(
  codigo: string,
  token: string,
  idioma: Idioma,
  ativo: boolean,
  aoLer: (lido: LeituraDoPedido) => void,
  ritmo: RitmoDaConsulta = 'sempre',
) {
  const aoLerRef = useRef(aoLer);
  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const consultar = async () => {
      try {
        const res = await fetch(`/api/reservas/${encodeURIComponent(codigo)}?t=${encodeURIComponent(token)}&idioma=${idioma}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const corpo = (await res.json()) as { reserva?: LeituraDoPedido };
        if (vivo && corpo.reserva) aoLerRef.current(corpo.reserva);
      } catch {}
    };
    // o relógio só no pedido que espera o pagamento; parada, a página de um pedido pago não pergunta nada
    const id = ritmo === 'sempre' ? window.setInterval(consultar, INTERVALO_CONSULTA_MS) : undefined;
    // a volta para a aba: a pergunta sai na hora
    const aoVoltar = () => document.visibilityState === 'visible' && consultar();
    // a página que o navegador guardou inteira e devolveu pelo botão de voltar (ou de avançar): a pergunta sai na hora
    const aoMostrar = (e: PageTransitionEvent) => e.persisted && consultar();
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('pageshow', aoMostrar);
    return () => {
      vivo = false;
      if (id !== undefined) window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('pageshow', aoMostrar);
    };
  }, [codigo, token, idioma, ativo, ritmo]);
}

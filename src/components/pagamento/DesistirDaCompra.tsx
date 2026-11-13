'use client';

import { useEffect, useRef, useState } from 'react';
// só o tipo: src/lib/desistencia.ts leva junto as regras do pagamento, que não precisam ir para o navegador
import type { EstadoDesistencia } from '@/lib/desistencia';

/** O mesmo número de MOTIVO_MAXIMO (src/lib/desistencia.ts; tests/desistencia.test.ts confere): o servidor corta ali. */
const MOTIVO_MAXIMO = 500;

/** Os textos da desistência pelo site (chaves pedido.desistir*, mais o "Voltar", o "Processando…" e o erro genérico). */
export interface TextosDesistencia {
  /** "Desistir da compra": o link discreto e o título da confirmação. */
  link: string;
  /** O que acontece: 7 dias com reembolso integral, depois a política de cancelamento, resposta por e-mail. */
  texto: string;
  /** "Motivo (opcional)" */
  motivo: string;
  /** "Confirmar a desistência" */
  confirmar: string;
  /** "Ver a política de cancelamento" */
  politica: string;
  /** Depois de enviar: o pedido de desistência chegou. */
  recebido: string;
  /** Já tinha chegado antes (a página recarregada, ou um segundo envio). */
  repetido: string;
  voltar: string;
  processando: string;
  erro: string;
}

type Etapa = 'fechado' | 'aberto' | 'enviando' | 'recebido' | 'repetido';

/**
 * O link discreto "Desistir da compra", na página do pedido pago (Decreto 7.962/2013, art. 5º, § 1º: desistir pela
 * mesma ferramenta da compra). Ele abre uma confirmação ali mesmo, com o motivo opcional, e envia o pedido ao
 * servidor (POST /api/pedido/[codigo]/desistir, com o token do link privado). A resposta é a confirmação imediata do
 * recebimento; o servidor não reembolsa nada sozinho. Quem decide se o link aparece é o servidor (estadoDaDesistencia).
 */
export function DesistirDaCompra({
  codigoPedido,
  token,
  estado,
  hrefPolitica,
  textos: T,
  className = '',
}: {
  /** O código que a rota recebe: o do pedido (ou o do voucher, no pedido de um item só). */
  codigoPedido: string;
  token: string;
  /** 'disponivel' mostra o link; 'pedida' já mostra que o pedido de desistência chegou. */
  estado: EstadoDesistencia;
  hrefPolitica: string;
  textos: TextosDesistencia;
  className?: string;
}) {
  const [etapa, setEtapa] = useState<Etapa>(estado === 'pedida' ? 'repetido' : 'fechado');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const linkRef = useRef<HTMLButtonElement>(null);
  const aberta = etapa === 'aberto' || etapa === 'enviando';
  const fechou = useRef(false);

  // quem abre a confirmação vai direto para ela (leitor de tela e teclado); quem volta, de volta para o link
  useEffect(() => {
    if (aberta) tituloRef.current?.focus();
    else if (etapa === 'fechado' && fechou.current) linkRef.current?.focus();
  }, [aberta, etapa]);

  async function enviar() {
    setEtapa('enviando');
    setErro('');
    try {
      const res = await fetch(`/api/pedido/${encodeURIComponent(codigoPedido)}/desistir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { ok?: boolean; repetido?: boolean };
      if (res.ok && corpo.ok) {
        setEtapa(corpo.repetido ? 'repetido' : 'recebido');
        return;
      }
    } catch {}
    setErro(T.erro);
    setEtapa('aberto');
  }

  if (etapa === 'recebido' || etapa === 'repetido') {
    return (
      <p role="status" className={`max-w-[52ch] bg-superficie px-5 py-4 text-small ${className}`}>
        {etapa === 'recebido' ? T.recebido : T.repetido}
      </p>
    );
  }

  if (!aberta) {
    return (
      <div className={className}>
        <button
          ref={linkRef}
          type="button"
          className="inline-flex min-h-11 items-center text-small text-(--color-tinta-suave) underline underline-offset-4 hover:text-(--color-tinta)"
          onClick={() => setEtapa('aberto')}
        >
          {T.link}
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="desistir-titulo" className={`max-w-[52ch] bg-superficie px-5 py-5 ${className}`}>
      <h2 id="desistir-titulo" ref={tituloRef} tabIndex={-1} className="font-semibold outline-none">
        {T.link}
      </h2>
      <p className="mt-2 text-small">{T.texto}</p>
      <a href={hrefPolitica} className="link mt-1 inline-flex min-h-11 items-center text-small font-semibold">
        {T.politica}
      </a>
      <label htmlFor="desistir-motivo" className="rotulo mt-3 block">
        {T.motivo}
      </label>
      <textarea
        id="desistir-motivo"
        className="campo min-h-24"
        maxLength={MOTIVO_MAXIMO}
        value={motivo}
        onChange={(ev) => setMotivo(ev.target.value)}
        disabled={etapa === 'enviando'}
      />
      {erro && (
        <p role="alert" className="mt-3 bg-erro-claro px-4 py-3 text-small font-semibold text-mar">
          {erro}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          className="botao botao-vazado w-full sm:w-auto"
          onClick={enviar}
          disabled={etapa === 'enviando'}
          aria-busy={etapa === 'enviando'}
        >
          {etapa === 'enviando' ? T.processando : T.confirmar}
        </button>
        <button
          type="button"
          className="link inline-flex min-h-11 items-center font-semibold"
          onClick={() => {
            fechou.current = true;
            setErro('');
            setEtapa('fechado');
          }}
          disabled={etapa === 'enviando'}
        >
          {T.voltar}
        </button>
      </div>
    </section>
  );
}

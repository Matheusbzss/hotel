'use client';

import { useEffect, useRef, useState } from 'react';
import { fmt } from '@/i18n/config';
import { formatarCentavos } from '@/lib/orcamento';
import { rastrear } from '@/lib/pixel';
import type { ReservaPublica } from '@/lib/reserva-publica';
import { formatarDataIso } from '@/lib/validacao';
import { IconeWhatsApp } from './IconeWhatsApp';

type T = Record<string, string>;

function tempoRestante(fim?: string): string {
  if (!fim) return '';
  const ms = Date.parse(fim) - Date.now();
  if (!(ms > 0)) return '0:00';
  const min = Math.floor(ms / 60000);
  const seg = Math.floor((ms % 60000) / 1000);
  return `${min}:${String(seg).padStart(2, '0')}`;
}

export function StatusReserva({
  inicial,
  token,
  idioma,
  locale,
  qrSvg,
  textos,
  statusTextos,
  linkWhatsApp,
  linkNovaReserva,
  numeroWhatsApp,
  telefoneExibicao,
}: {
  inicial: ReservaPublica;
  token: string;
  idioma: string;
  locale: string;
  qrSvg?: string;
  textos: T;
  statusTextos: T;
  linkWhatsApp: string;
  linkNovaReserva: string;
  numeroWhatsApp: string;
  /** O WhatsApp da equipe como aparece no voucher (+55 21 …). */
  telefoneExibicao: string;
}) {
  const [r, setR] = useState(inicial);
  const [restante, setRestante] = useState(tempoRestante(inicial.pixExpiraEm));
  const [copiado, setCopiado] = useState(false);
  const enviadoPixel = useRef(false);

  // Consulta o status enquanto o pagamento está pendente
  useEffect(() => {
    if (r.status !== 'pendente') return;
    let ativo = true;
    const consultar = async () => {
      try {
        const res = await fetch(`/api/reservas/${r.codigo}?t=${encodeURIComponent(token)}&idioma=${idioma}`, { cache: 'no-store' });
        if (!res.ok) return;
        const corpo = (await res.json()) as { reserva?: ReservaPublica };
        if (ativo && corpo.reserva) setR((atual) => ({ ...atual, ...corpo.reserva, pixCopiaECola: atual.pixCopiaECola }));
      } catch {}
    };
    const id = window.setInterval(consultar, 4000);
    const aoVoltar = () => document.visibilityState === 'visible' && consultar();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      ativo = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [r.status, r.codigo, token, idioma]);

  // Contagem regressiva do Pix
  useEffect(() => {
    if (r.status !== 'pendente' || !r.pixExpiraEm) return;
    const id = window.setInterval(() => setRestante(tempoRestante(r.pixExpiraEm)), 1000);
    return () => window.clearInterval(id);
  }, [r.status, r.pixExpiraEm]);

  // Evento de compra no Pixel da Meta, uma única vez por voucher (no pedido com vários itens, a página do pedido conta)
  useEffect(() => {
    if (r.status !== 'pago' || r.pedidoCodigo || enviadoPixel.current) return;
    enviadoPixel.current = true;
    const chave = `vh_compra_${r.codigo}`;
    try {
      if (localStorage.getItem(chave)) return;
      localStorage.setItem(chave, '1');
    } catch {}
    rastrear(
      'Purchase',
      {
        value: r.totalCentavos / 100,
        currency: 'BRL',
        content_ids: [r.passeioSlug],
        content_type: 'product',
        num_items: r.adultos + r.criancas,
      },
      r.codigo,
    );
  }, [r.status, r.pedidoCodigo, r.codigo, r.totalCentavos, r.passeioSlug, r.adultos, r.criancas]);

  // esperando o pagamento pelo WhatsApp: os dois valores, o do Pix (com desconto) e o do cartão
  const brl = r.totalPixCentavos
    ? `${formatarCentavos(r.totalPixCentavos, locale)} ${textos.noPix} · ${formatarCentavos(r.totalCentavos, locale)} ${textos.noCartao}`
    : formatarCentavos(r.totalCentavos, locale);
  const dataTexto = formatarDataIso(r.data, locale);
  // nas mensagens, a data vai junto com a hora: "sáb., 14 de nov. de 2026 às 9h"
  const dataHora = r.horario ? fmt(textos.dataHora, { data: dataTexto, hora: r.horario.texto }) : dataTexto;
  const pessoas = r.pessoasTexto;
  const nomePasseio = r.opcaoNome ? `${r.passeioNome} (${r.opcaoNome})` : r.passeioNome;
  // transfer: a data e a hora de cada trecho, e o trajeto da ida nas mensagens
  const t = r.transfer;
  const dataHoraTrecho = (tr: { data: string; hora: string }) =>
    fmt(textos.dataHora, { data: formatarDataIso(tr.data, locale), hora: tr.hora });
  const trajeto = t ? `${t.ida.saida} → ${t.ida.destino}` : '';

  const msgVoucher = t
    ? textos.transferMsgVoucher
        .replace('{codigo}', r.codigo)
        .replace('{trajeto}', trajeto)
        .replace('{data}', dataHoraTrecho(t.ida))
        .replace('{pessoas}', pessoas)
    : textos.msgVoucher
        .replace('{codigo}', r.codigo)
        .replace('{passeio}', nomePasseio)
        .replace('{data}', dataHora)
        .replace('{pessoas}', pessoas)
        .replace('{hotel}', `${r.hotel} (${r.cidadeHospedagem})`);
  const msgFinalizar = textos.msgWhatsapp
    .replace('{codigo}', r.codigo)
    .replace('{passeio}', t ? `${r.passeioNome}: ${trajeto}` : nomePasseio)
    .replace('{data}', t ? dataHoraTrecho(t.ida) : dataHora)
    .replace('{pessoas}', pessoas)
    .replace('{total}', brl);
  const wa = (m: string) => `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(m)}`;

  const Voucher = (
    <div className="tom-papel">
      <div className="px-6 pb-6 pt-6 md:px-8">
        <p className="text-small font-semibold">{r.status === 'pago' ? textos.voucher : textos.codigoReserva}</p>
        <p className="display numeros mt-1 text-[clamp(2rem,1.2rem+3.4vw,3.5rem)]">{r.codigo}</p>
        {t ? (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-2">
              <dt className="text-small">{r.passeioNome}</dt>
              <dd className="text-lead font-semibold leading-tight">{t.veiculo}</dd>
            </div>
            {(
              [
                [textos.transferIda, t.ida],
                [textos.transferVolta, t.volta],
              ] as const
            ).map(
              ([rotulo, tr]) =>
                tr && (
                  <div key={rotulo} className="col-span-2">
                    <dt className="text-small">{rotulo}</dt>
                    <dd className="font-bold">{dataHoraTrecho(tr)}</dd>
                    <dd>
                      {tr.saida} → {tr.destino}
                    </dd>
                    {tr.voo && (
                      <dd className="text-small">
                        {textos.transferVoo} {tr.voo}
                      </dd>
                    )}
                  </div>
                ),
            )}
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-small">{textos.transferPassageiros}</dt>
              <dd className="font-bold">{pessoas}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-small">{textos.nome}</dt>
              <dd className="font-bold">{r.nome}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-small">{textos.transferMalas}</dt>
              <dd className="font-bold">{t.malas}</dd>
            </div>
            {t.cadeirinhas && (
              <div className="col-span-2">
                <dt className="text-small">{textos.transferCadeirinhas}</dt>
                <dd className="font-bold">{t.cadeirinhas}</dd>
              </div>
            )}
          </dl>
        ) : (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-2">
              <dt className="text-small">{textos.passeio}</dt>
              <dd className="text-lead font-semibold leading-tight">{nomePasseio}</dd>
            </div>
            <div>
              <dt className="text-small">{textos.data}</dt>
              <dd className="font-bold">{dataTexto}</dd>
            </div>
            {r.horario && (
              <div>
                <dt className="text-small">{r.horario.busca ? textos.horarioBusca : textos.horarioSaida}</dt>
                <dd className="numeros text-lead font-bold leading-tight">{r.horario.texto}</dd>
              </div>
            )}
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-small">{textos.pessoas}</dt>
              <dd className="font-bold">{pessoas}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-small">{textos.nome}</dt>
              <dd className="font-bold">{r.nome}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-small">{textos.hotel}</dt>
              <dd className="font-bold">
                {r.hotel} — {r.cidadeHospedagem}
              </dd>
            </div>
            {r.horario && !r.horario.busca && (
              <div className="col-span-2">
                <dt className="text-small">{textos.encontro}</dt>
                <dd className="font-bold">{textos.encontroTexto}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      {/* o único lugar onde o cliente recebe o WhatsApp da equipe: o voucher da compra paga */}
      {r.status === 'pago' && (
        <div className="border-t border-(--color-borda) px-6 py-5 md:px-8">
          <p className="text-small">{textos.whatsappEquipe}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="numeros text-lead font-semibold">{telefoneExibicao}</p>
            <a
              href={wa(msgVoucher)}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-whats w-full sm:w-auto"
              data-evento="Contact"
            >
              <IconeWhatsApp className="size-5" />
              {textos.chamarWhatsapp}
            </a>
          </div>
          {/* no transfer, o titular manda por aqui o nome dos outros passageiros */}
          {t && <p className="mt-3 text-small">{textos.transferDemais}</p>}
        </div>
      )}
      <div className="tom-campo flex items-center justify-between gap-4 px-6 py-5 md:px-8">
        <span className="font-semibold">{statusTextos[r.status]}</span>
        <span className="numeros text-lead font-semibold">{brl}</span>
      </div>
    </div>
  );

  if (r.status === 'pago') {
    return (
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="display text-head">{textos.confirmadoTitulo}</h1>
          <p className="mt-4 max-w-[46ch] text-lead">{t ? textos.transferConfirmado : textos.confirmadoTexto}</p>
          <div className="mt-8">{Voucher}</div>
        </div>
        <div className="space-y-3 lg:col-span-5 lg:pt-32">
          <a href={`/api/voucher/${r.codigo}?t=${encodeURIComponent(token)}`} className="botao w-full" download>
            {textos.baixarPdf}
          </a>
          <div className="mt-6 bg-superficie px-5 py-5">
            <h2 className="font-bold">{textos.proximos}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>{t ? textos.transferEspera : r.horario?.busca ? textos.proximo1Busca : textos.proximo1Saida}</li>
              <li>{textos.proximo2}</li>
              <li>{textos.proximo3}</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (r.status === 'pendente' && r.metodo === 'pix' && r.pixCopiaECola) {
    return (
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <h1 className="display text-head">{textos.aguardandoPix}</h1>
          <p className="mt-4 max-w-[44ch] text-lead">{textos.pixInstrucoes}</p>
          <div className="mt-8 flex flex-col gap-6">
            <div className="order-2 lg:order-1">
              <div className="bg-papel">
                {qrSvg && (
                  <div
                    className="mx-auto w-full max-w-[320px] bg-white p-3"
                    role="img"
                    aria-label="QR Code Pix"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                )}
              </div>
              <p className="mt-3 text-center font-semibold" aria-live="polite">
                {textos.expiraEm.replace('{tempo}', restante)}
              </p>
            </div>
            <div className="order-1 lg:order-2">
              <label htmlFor="pix-copia" className="rotulo">
                {textos.pixCopiaCola}
              </label>
              <textarea
                id="pix-copia"
                readOnly
                value={r.pixCopiaECola}
                className="campo min-h-28 break-all font-[inherit] text-small"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="botao mt-3 w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(r.pixCopiaECola ?? '');
                    setCopiado(true);
                    window.setTimeout(() => setCopiado(false), 3000);
                  } catch {}
                }}
              >
                {copiado ? textos.copiado : textos.copiar}
              </button>
            </div>
          </div>
          <p className="mt-6 bg-superficie px-5 py-4">{textos.atualizaSozinho}</p>
        </div>
        <div className="lg:col-span-6">{Voucher}</div>
      </div>
    );
  }

  const mensagens: Record<string, { titulo: string; texto: string }> = {
    pendente: { titulo: statusTextos.pendente, texto: textos.atualizaSozinho },
    recusado: { titulo: textos.recusadoTitulo, texto: textos.recusadoTexto },
    expirado: { titulo: textos.expiradoTitulo, texto: textos.expiradoTexto },
    cancelado: { titulo: textos.canceladoTitulo, texto: textos.canceladoTexto },
    reembolsado: { titulo: statusTextos.reembolsado, texto: textos.canceladoTexto },
    aguardando_whatsapp: { titulo: textos.whatsappTitulo, texto: textos.whatsappTexto },
  };
  const m = mensagens[r.status] ?? mensagens.pendente;

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="lg:col-span-6">
        <h1 className="display text-head">{m.titulo}</h1>
        <p className="mt-4 max-w-[44ch] text-lead">{m.texto}</p>
        <div className="mt-8 space-y-3">
          {r.status === 'aguardando_whatsapp' ? (
            <a
              href={wa(msgFinalizar)}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-whats w-full sm:w-auto"
              data-evento="Contact"
            >
              <IconeWhatsApp className="size-5" />
              {textos.whatsappBotao}
            </a>
          ) : (
            <>
              {(r.status === 'recusado' || r.status === 'expirado') && (
                <a href={linkNovaReserva} className="botao w-full sm:w-auto">
                  {textos.tentarNovamente}
                </a>
              )}
              <a
                href={linkWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                className="botao botao-whats w-full sm:ml-3 sm:w-auto"
                data-evento="Contact"
              >
                <IconeWhatsApp className="size-5" />
                {textos.falarWhatsapp}
              </a>
            </>
          )}
        </div>
      </div>
      <div className="lg:col-span-6">{Voucher}</div>
    </div>
  );
}

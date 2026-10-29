'use client';

import { useEffect, useRef, useState } from 'react';
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

  // Evento de compra no Pixel da Meta, uma única vez por voucher
  useEffect(() => {
    if (r.status !== 'pago' || enviadoPixel.current) return;
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
  }, [r.status, r.codigo, r.totalCentavos, r.passeioSlug, r.adultos, r.criancas]);

  const brl = formatarCentavos(r.totalCentavos, locale);
  const dataTexto = formatarDataIso(r.data, locale);
  const pessoas = r.pessoasTexto;
  const nomePasseio = r.opcaoNome ? `${r.passeioNome} (${r.opcaoNome})` : r.passeioNome;

  const msgVoucher = textos.msgVoucher
    .replace('{codigo}', r.codigo)
    .replace('{passeio}', nomePasseio)
    .replace('{data}', dataTexto)
    .replace('{pessoas}', pessoas)
    .replace('{hotel}', `${r.hotel} (${r.cidadeHospedagem})`);
  const msgFinalizar = textos.msgWhatsapp
    .replace('{codigo}', r.codigo)
    .replace('{passeio}', nomePasseio)
    .replace('{data}', dataTexto)
    .replace('{pessoas}', pessoas)
    .replace('{total}', brl);
  const wa = (m: string) => `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(m)}`;

  const Voucher = (
    <div className="tom-sol">
      <div className="px-6 pb-6 pt-6 md:px-8">
        <p className="text-small font-semibold">{r.status === 'pago' ? textos.voucher : textos.codigoReserva}</p>
        <p className="largo numeros mt-1 text-[clamp(2rem,1.2rem+3.4vw,3.5rem)]">{r.codigo}</p>
        <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-small">{textos.passeio}</dt>
            <dd className="text-lead font-bold leading-tight">{nomePasseio}</dd>
          </div>
          <div>
            <dt className="text-small">{textos.data}</dt>
            <dd className="font-bold">{dataTexto}</dd>
          </div>
          <div>
            <dt className="text-small">{textos.pessoas}</dt>
            <dd className="font-bold">{pessoas}</dd>
          </div>
          <div>
            <dt className="text-small">{textos.nome}</dt>
            <dd className="font-bold">{r.nome}</dd>
          </div>
          <div>
            <dt className="text-small">{textos.hotel}</dt>
            <dd className="font-bold">
              {r.hotel} — {r.cidadeHospedagem}
            </dd>
          </div>
        </dl>
      </div>
      <div className="tom-mar flex items-center justify-between gap-4 px-6 py-5 md:px-8">
        <span className="font-semibold">{statusTextos[r.status]}</span>
        <span className="numeros text-lead font-bold text-sol">{brl}</span>
      </div>
    </div>
  );

  if (r.status === 'pago') {
    return (
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="largo text-head text-sol">{textos.confirmadoTitulo}</h1>
          <p className="mt-4 max-w-[46ch] text-lead">{textos.confirmadoTexto}</p>
          <div className="mt-8">{Voucher}</div>
        </div>
        <div className="space-y-3 lg:col-span-5 lg:pt-32">
          <a href={`/api/voucher/${r.codigo}?t=${encodeURIComponent(token)}`} className="botao w-full" download>
            {textos.baixarPdf}
          </a>
          <a href={wa(msgVoucher)} target="_blank" rel="noopener noreferrer" className="botao botao-whats w-full" data-evento="Contact">
            <IconeWhatsApp className="size-5" />
            {textos.enviarWhatsapp}
          </a>
          <div className="mt-6 bg-mar-2 px-5 py-5">
            <h2 className="font-bold">{textos.proximos}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>{textos.proximo1}</li>
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
          <h1 className="largo text-head text-sol">{textos.aguardandoPix}</h1>
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
          <p className="mt-6 bg-mar-2 px-5 py-4">{textos.atualizaSozinho}</p>
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
        <h1 className="largo text-head text-sol">{m.titulo}</h1>
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

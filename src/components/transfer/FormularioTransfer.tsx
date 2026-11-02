'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { LUGARES, VEICULOS, totalTransfer, type IdLugar, type Malas, type Veiculo } from '@/data/transfer';
import type { Dicionario } from '@/i18n';
import { fmt, type Idioma } from '@/i18n/config';
import { formatarHora } from '@/lib/horarios';
import { formatarCentavos } from '@/lib/orcamento';
import { textoMalas } from '@/lib/transfer-view';
import { DDIS, emailValido, formatarDataIso, telefoneValido } from '@/lib/validacao';
import { Campo, descricao } from '../FormularioCheckout';
import { Contador } from '../grupo/Contador';
import { IconeWhatsApp } from '../IconeWhatsApp';

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

type Erros = Partial<Record<string, string>>;

/** O checkout do transfer: só os dados do titular, os voos, as cadeirinhas e as observações. */
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
  textos: { checkout: Dicionario['checkout']; transfer: Dicionario['transfer']; dataHora: string; diminuir: string; aumentar: string };
  links: { termos: string; politica: string; reserva: string; transfer: string };
}) {
  const C = textos.checkout;
  const T = textos.transfer;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [ddi, setDdi] = useState(idioma === 'es' ? '54' : idioma === 'en' ? '1' : '55');
  const [telefone, setTelefone] = useState('');
  const [vooIda, setVooIda] = useState('');
  const [vooVolta, setVooVolta] = useState('');
  // uma idade por criança que vai de cadeirinha ('' = ainda não escolhida)
  const [idades, setIdades] = useState<string[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [aceite, setAceite] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [isca, setIsca] = useState('');

  const trechos = [pedido.ida, ...(pedido.volta ? [pedido.volta] : [])];
  const totalReais = totalTransfer(
    trechos.map((t) => ({ saida: t.saida.lugar, destino: t.destino.lugar })),
    pedido.veiculo,
  );
  const temAeroporto = (t: TrechoPedido) => Boolean(LUGARES[t.saida.lugar].aeroporto || LUGARES[t.destino.lugar].aeroporto);
  // saindo do aeroporto, o voo é o de chegada; indo para ele, o de partida
  const rotuloVoo = (t: TrechoPedido) => (LUGARES[t.saida.lugar].aeroporto ? T.vooChegada : T.vooPartida);
  const nomePonta = (p: PontaPedido) => (p.endereco ? `${LUGARES[p.lugar].nome[idioma]}, ${p.endereco}` : LUGARES[p.lugar].nome[idioma]);
  const dataHora = (t: TrechoPedido) => fmt(textos.dataHora, { data: formatarDataIso(t.data, locale), hora: formatarHora(t.hora, idioma) });
  const nomeIdade = (n: number) => (n === 0 ? T.menosDeUmAno : n === 1 ? T.umAno : fmt(T.nAnos, { n }));

  function validar(): Erros {
    const e: Erros = {};
    if (nome.trim().length < 3) e.nome = C.erros.obrigatorio;
    if (!emailValido(email)) e.email = C.erros.email;
    if (!telefoneValido(ddi, telefone)) e.telefone = C.erros.telefone;
    idades.forEach((i, n) => {
      if (i === '') e[`idade${n}`] = C.erros.obrigatorio;
    });
    if (!aceite) e.aceite = C.erros.aceite;
    return e;
  }
  const erros: Erros = tentou ? validar() : {};
  const temErros = Object.keys(erros).length > 0;

  async function enviar() {
    setErroGeral('');
    setTentou(true);
    if (Object.keys(validar()).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setEnviando(true);
    const trecho = (t: TrechoPedido, voo: string) => ({ ...t, voo: temAeroporto(t) ? voo.trim() : '' });
    try {
      const res = await fetch('/api/checkout/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idioma,
          veiculo: pedido.veiculo,
          ida: trecho(pedido.ida, vooIda),
          ...(pedido.volta ? { volta: trecho(pedido.volta, vooVolta) } : {}),
          passageiros: pedido.passageiros,
          malas: pedido.malas,
          cadeirinhas: idades.map(Number),
          cliente: { nome: nome.trim(), email: email.trim(), ddi, telefone },
          observacoes: observacoes.trim(),
          aceite: true,
          site: isca,
        }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { ok?: boolean; codigo?: string; token?: string; erro?: string };
      if (corpo.ok && corpo.codigo && corpo.token) {
        router.push(`${links.reserva}/${corpo.codigo}?t=${encodeURIComponent(corpo.token)}`);
        return;
      }
      setErroGeral(
        corpo.erro === 'data'
          ? T.erroData
          : corpo.erro === 'volta'
            ? T.erroVolta
            : corpo.erro === 'trajeto'
              ? T.trajetoIncompleto
              : C.erros.generico,
      );
    } catch {
      setErroGeral(C.erros.generico);
    }
    setEnviando(false);
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        enviar();
      }}
      className="grid gap-10 lg:grid-cols-12 lg:gap-14"
    >
      <div className="space-y-12 lg:col-span-7">
        {/* DADOS DO TITULAR */}
        <fieldset className="min-w-0">
          <legend className="text-lead font-semibold">{C.seusDados}</legend>
          <div className="mt-5 grid gap-5">
            <Campo id="nome" rotulo={C.nome} erro={erros.nome}>
              <input
                id="nome"
                className="campo"
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={120}
                aria-invalid={Boolean(erros.nome)}
                aria-describedby={descricao('nome', erros.nome)}
                required
              />
            </Campo>
            <Campo id="email" rotulo={C.email} erro={erros.email}>
              <input
                id="email"
                type="email"
                inputMode="email"
                className="campo"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={160}
                aria-invalid={Boolean(erros.email)}
                aria-describedby={descricao('email', erros.email)}
                required
              />
            </Campo>
            <div>
              <span className="rotulo" id="telefone-rotulo">
                {C.telefone}
              </span>
              <div className="flex gap-2">
                <label htmlFor="ddi" className="sr-only">
                  {C.ddi}
                </label>
                <select
                  id="ddi"
                  className="campo w-[7.5rem] shrink-0"
                  value={ddi}
                  onChange={(e) => setDdi(e.target.value)}
                  autoComplete="tel-country-code"
                >
                  {DDIS.map((o) => (
                    <option key={o.ddi + o.pais} value={o.ddi}>
                      {o.pais} +{o.ddi}
                    </option>
                  ))}
                </select>
                <input
                  id="telefone"
                  type="tel"
                  inputMode="tel"
                  className="campo"
                  autoComplete="tel-national"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  maxLength={24}
                  aria-labelledby="telefone-rotulo"
                  aria-invalid={Boolean(erros.telefone)}
                  aria-describedby={descricao('telefone', erros.telefone, C.telefoneAjuda)}
                  required
                />
              </div>
              {erros.telefone ? (
                <span id="telefone-erro" className="erro-campo" role="alert">
                  {erros.telefone}
                </span>
              ) : (
                <span id="telefone-ajuda" className="ajuda">
                  {C.telefoneAjuda}
                </span>
              )}
            </div>
          </div>
        </fieldset>

        {/* O TRANSFER: voos, cadeirinhas e observações */}
        <fieldset className="min-w-0">
          <legend className="text-lead font-semibold">{T.titulo}</legend>
          <div className="mt-5 grid gap-5">
            {temAeroporto(pedido.ida) && (
              <Campo id="voo-ida" rotulo={rotuloVoo(pedido.ida)} ajuda={T.vooAjuda}>
                <input
                  id="voo-ida"
                  className="campo uppercase"
                  value={vooIda}
                  onChange={(e) => setVooIda(e.target.value)}
                  maxLength={12}
                  aria-describedby="voo-ida-ajuda"
                />
              </Campo>
            )}
            {pedido.volta && temAeroporto(pedido.volta) && (
              <Campo id="voo-volta" rotulo={`${T.volta}: ${rotuloVoo(pedido.volta).toLowerCase()}`} ajuda={T.vooAjuda}>
                <input
                  id="voo-volta"
                  className="campo uppercase"
                  value={vooVolta}
                  onChange={(e) => setVooVolta(e.target.value)}
                  maxLength={12}
                  aria-describedby="voo-volta-ajuda"
                />
              </Campo>
            )}
            <div className="space-y-4 bg-papel p-5">
              <Contador
                rotulo={T.criancasCadeirinha}
                ajuda={T.criancasCadeirinhaAjuda}
                valor={idades.length}
                min={0}
                max={Math.min(pedido.passageiros, 10)}
                aoMudar={(n) =>
                  setIdades((atual) => (n > atual.length ? [...atual, ...Array(n - atual.length).fill('')] : atual.slice(0, n)))
                }
                textos={textos}
              />
              {idades.map((idade, n) => (
                <Campo key={n} id={`idade${n}`} rotulo={fmt(T.idadeCrianca, { n: n + 1 })} erro={erros[`idade${n}`]}>
                  <select
                    id={`idade${n}`}
                    className="campo"
                    value={idade}
                    onChange={(e) => setIdades((atual) => atual.map((v, i) => (i === n ? e.target.value : v)))}
                    aria-invalid={Boolean(erros[`idade${n}`])}
                    aria-describedby={descricao(`idade${n}`, erros[`idade${n}`])}
                  >
                    <option value="">{C.selecione}</option>
                    {Array.from({ length: 11 }, (_, i) => (
                      <option key={i} value={i}>
                        {nomeIdade(i)}
                      </option>
                    ))}
                  </select>
                </Campo>
              ))}
            </div>
            <Campo id="obs" rotulo={C.observacoes} ajuda={T.observacoesAjuda}>
              <textarea
                id="obs"
                className="campo min-h-28"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                maxLength={600}
                aria-describedby="obs-ajuda"
              />
            </Campo>
            <p className="bg-superficie px-5 py-4 font-semibold">{T.demaisPassageiros}</p>
          </div>
        </fieldset>

        {/* campo-isca para robôs: escondido de pessoas (taste-skill-ignore) */}
        <div aria-hidden="true" className="absolute -left-[9999px] size-0 overflow-hidden">
          <label htmlFor="site">Site</label>
          <input id="site" tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} />
        </div>

        {/* PAGAMENTO: o transfer finaliza com a equipe até o pagamento online entrar (Etapa 8) */}
        <fieldset className="min-w-0">
          <legend className="text-lead font-semibold">{C.pagamento}</legend>
          <div className="tom-superficie mt-5 px-5 py-5">
            <p className="font-bold">{C.indisponivelTitulo}</p>
            <p className="mt-2">{C.indisponivelTexto}</p>
          </div>
        </fieldset>

        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              id="aceite"
              type="checkbox"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              className="mt-1 size-6 shrink-0 accent-[var(--color-mar)]"
              aria-invalid={Boolean(erros.aceite)}
              aria-describedby={erros.aceite ? 'aceite-erro' : undefined}
            />
            {/* espaços dentro do texto: soltos entre pedaços, somem no que o leitor de tela fala */}
            <span>
              {`${C.aceitePre} `}
              <Link href={links.termos} target="_blank" className="link font-semibold">
                {C.aceiteTermos}
              </Link>
              {` ${C.aceiteMeio} `}
              <Link href={links.politica} target="_blank" className="link font-semibold">
                {C.aceitePolitica}
              </Link>
              .
            </span>
          </label>
          {erros.aceite && (
            <span id="aceite-erro" className="erro-campo" role="alert">
              {erros.aceite}
            </span>
          )}
        </div>
      </div>

      {/* RESUMO */}
      <aside className="lg:col-span-5">
        <div className="lg:sticky lg:top-24">
          <div className="tom-campo">
            <div className="px-6 pb-6 pt-6">
              <h2 className="text-lead font-semibold">{C.resumo}</h2>
              <p className="mt-4 text-lead font-semibold leading-tight">{T.titulo}</p>
              <p className="mt-1 text-small text-(--tinta-suave)">
                {VEICULOS[pedido.veiculo].nome[idioma]} · {VEICULOS[pedido.veiculo].modelos[idioma]}
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
            <div className="flex items-center justify-between gap-4 bg-[color-mix(in_oklab,white_10%,var(--fundo))] px-6 py-5">
              <span className="font-semibold">{pedido.volta ? T.totalIdaVolta : T.total}</span>
              <span className="numeros titulo leading-none">{totalReais === null ? '—' : formatarCentavos(totalReais * 100, locale)}</span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {(erroGeral || (tentou && temErros)) && (
              <p className="bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
                {erroGeral || C.erros.revise}
              </p>
            )}
            <button type="submit" className="botao botao-whats w-full" disabled={enviando || totalReais === null} aria-busy={enviando}>
              <IconeWhatsApp className="size-5" />
              {enviando ? C.processando : C.finalizarWhatsapp}
            </button>
            <p className="text-small">{C.avisoTotal}</p>
          </div>
        </div>
      </aside>
    </form>
  );
}

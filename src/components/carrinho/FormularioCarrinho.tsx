'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Dicionario } from '@/i18n';
import { fmt, type Idioma } from '@/i18n/config';
import { totaisDoCarrinho, type ItemVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { rastrear } from '@/lib/pixel';
import { CIDADES_HOSPEDAGEM, DDIS, NOME_CIDADE_HOSPEDAGEM, emailValido, telefoneValido, type CidadeHospedagem } from '@/lib/validacao';
import { Campo, descricao } from '../FormularioCheckout';
import { Contador } from '../grupo/Contador';
import { IconeWhatsApp } from '../IconeWhatsApp';
import { useCarrinho } from './CarrinhoContexto';
import { textoQuantidade } from './GavetaCarrinho';
import { ListaCarrinho } from './ListaCarrinho';
import { SugestoesCarrinho } from './SugestoesCarrinho';

type Erros = Partial<Record<string, string>>;

/** O que o checkout pergunta de cada transfer: os voos e uma idade por criança ('' = ainda não escolhida). */
interface ExtrasItem {
  ida: string;
  volta: string;
  idades: string[];
}

const SEM_EXTRAS: ExtrasItem = { ida: '', volta: '', idades: [] };
const codigoDoProduto = (i: ItemVisivel) => (i.escolha.tipo === 'passeio' ? i.escolha.slug : 'transfer');

/**
 * O checkout do carrinho: os dados do titular e a hospedagem uma vez só, o que cada transfer precisa, um
 * pagamento só e, no fim, um voucher por item. O pagamento é o que funciona hoje: registra aqui e finaliza
 * com a equipe pelo WhatsApp.
 */
export function FormularioCarrinho({
  idioma,
  locale,
  inicial,
  textos,
  links,
}: {
  idioma: Idioma;
  locale: string;
  /** O carrinho lido no servidor, para a página já abrir com os itens. */
  inicial: ItemVisivel[];
  textos: {
    checkout: Dicionario['checkout'];
    transfer: Dicionario['transfer'];
    carrinho: Dicionario['carrinho'];
    preco: Dicionario['preco'];
    diminuir: string;
    aumentar: string;
    dataPasseio: string;
    escolhaData: string;
    aPartirDe: string;
  };
  links: { termos: string; politica: string; reserva: string; pedido: string; passeios: string };
}) {
  const C = textos.checkout;
  const T = textos.transfer;
  const K = textos.carrinho;
  const { itens: atuais, carregado, remover, recarregar } = useCarrinho();
  const itens = carregado ? atuais : inicial;
  const formRef = useRef<HTMLFormElement>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [ddi, setDdi] = useState(idioma === 'es' ? '54' : idioma === 'en' ? '1' : '55');
  const [telefone, setTelefone] = useState('');
  const [cidadeHosp, setCidadeHosp] = useState<CidadeHospedagem | ''>('');
  const [hotel, setHotel] = useState('');
  const [extras, setExtras] = useState<Record<string, ExtrasItem>>({});
  const [observacoes, setObservacoes] = useState('');
  const [aceite, setAceite] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [isca, setIsca] = useState('');
  const emailGuardado = useRef('');

  const temPasseio = itens.some((i) => i.tipo === 'passeio');
  const transfers = itens.filter((i) => i.transfer);
  const { totalCentavos, totalPixCentavos } = totaisDoCarrinho(itens);
  const brl = (c: number) => formatarCifra(c, locale);
  const extrasDe = (id: string) => extras[id] ?? SEM_EXTRAS;
  const mudarExtras = (id: string, m: Partial<ExtrasItem>) => setExtras((e) => ({ ...e, [id]: { ...(e[id] ?? SEM_EXTRAS), ...m } }));
  const nomeIdade = (n: number) => (n === 0 ? T.menosDeUmAno : n === 1 ? T.umAno : fmt(T.nAnos, { n }));

  useEffect(() => {
    if (!inicial.length) return;
    const totais = totaisDoCarrinho(inicial);
    rastrear('InitiateCheckout', {
      content_ids: inicial.map(codigoDoProduto),
      content_type: 'product',
      value: totais.totalCentavos / 100,
      currency: 'BRL',
      num_items: inicial.length,
    });
    // só na abertura do checkout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** O e-mail digitado fica no carrinho, para lembrar quem não terminou (Fase 5). */
  function guardarEmail() {
    const limpo = email.trim();
    if (!emailValido(limpo) || limpo === emailGuardado.current) return;
    emailGuardado.current = limpo;
    fetch('/api/carrinho', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: limpo }),
    }).catch(() => null);
  }

  function validar(): Erros {
    const e: Erros = {};
    if (nome.trim().length < 3) e.nome = C.erros.obrigatorio;
    if (!emailValido(email)) e.email = C.erros.email;
    if (!telefoneValido(ddi, telefone)) e.telefone = C.erros.telefone;
    if (temPasseio) {
      if (!cidadeHosp) e.cidadeHosp = C.erros.obrigatorio;
      if (hotel.trim().length < 2) e.hotel = C.erros.obrigatorio;
    }
    for (const i of transfers) {
      extrasDe(i.id).idades.forEach((idade, n) => {
        if (idade === '') e[`idade-${i.id}-${n}`] = C.erros.obrigatorio;
      });
    }
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
    try {
      const res = await fetch('/api/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idioma,
          ids: itens.map((i) => i.id),
          cliente: { nome: nome.trim(), email: email.trim(), ddi, telefone },
          ...(temPasseio ? { hospedagem: { cidade: cidadeHosp, hotel: hotel.trim() } } : {}),
          transfers: Object.fromEntries(
            transfers.map((i) => {
              const x = extrasDe(i.id);
              return [i.id, { vooIda: x.ida.trim(), vooVolta: x.volta.trim(), cadeirinhas: x.idades.map(Number) }];
            }),
          ),
          observacoes: observacoes.trim(),
          aceite: true,
          site: isca,
        }),
      });
      const corpo = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        codigo?: string;
        token?: string;
        itens?: number;
        erro?: string;
      };
      if (corpo.ok && corpo.codigo && corpo.token) {
        // a página inteira recarrega: o carrinho, que virou pedido, volta vazio
        const base = corpo.itens === 1 ? links.reserva : links.pedido;
        window.location.assign(`${base}/${corpo.codigo}?t=${encodeURIComponent(corpo.token)}`);
        return;
      }
      if (corpo.erro === 'mudou') {
        await recarregar();
        setErroGeral(K.mudou);
      } else setErroGeral(C.erros.generico);
    } catch {
      setErroGeral(C.erros.generico);
    }
    setEnviando(false);
  }

  if (!itens.length) {
    return (
      <div className="max-w-[44ch]">
        <p className="text-lead">{K.vazio}</p>
        <Link href={links.passeios} className="botao mt-6">
          {K.verPasseios}
        </Link>
      </div>
    );
  }

  const seuPedido = (
    <section className="rounded-cartao border border-(--color-borda) bg-(--color-papel) px-5 pt-5 sm:px-6">
      <h2 className="text-lead font-semibold">
        {K.seuPedido} <span className="text-small font-normal text-(--color-tinta-suave)">· {textoQuantidade(K, itens.length)}</span>
      </h2>
      <div className="mt-4">
        <ListaCarrinho
          itens={itens}
          locale={locale}
          textos={{ mudar: K.mudar, remover: K.remover, noPix: textos.preco.noPix, noCartao: textos.preco.noCartao }}
          aoRemover={remover}
        />
      </div>
    </section>
  );

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
        {/* no celular, o pedido vem antes dos dados; no computador, fica preso na coluna do lado */}
        <div className="lg:hidden">{seuPedido}</div>

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
                onBlur={guardarEmail}
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

        {/* HOSPEDAGEM: uma vez só, para todos os passeios */}
        {temPasseio && (
          <fieldset className="min-w-0">
            <legend className="text-lead font-semibold">{C.hospedagem}</legend>
            <p className="ajuda">{K.hospedagemAjuda}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Campo id="cidadeHosp" rotulo={C.cidadeHospedagem} erro={erros.cidadeHosp}>
                <select
                  id="cidadeHosp"
                  className="campo"
                  value={cidadeHosp}
                  onChange={(e) => setCidadeHosp(e.target.value as CidadeHospedagem)}
                  aria-invalid={Boolean(erros.cidadeHosp)}
                  aria-describedby={descricao('cidadeHosp', erros.cidadeHosp)}
                  required
                >
                  <option value="">{C.selecione}</option>
                  {CIDADES_HOSPEDAGEM.map((c) => (
                    <option key={c} value={c}>
                      {NOME_CIDADE_HOSPEDAGEM[c]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="hotel" rotulo={C.hotel} erro={erros.hotel}>
                <input
                  id="hotel"
                  className="campo"
                  value={hotel}
                  onChange={(e) => setHotel(e.target.value)}
                  maxLength={120}
                  aria-invalid={Boolean(erros.hotel)}
                  aria-describedby={descricao('hotel', erros.hotel)}
                  required
                />
              </Campo>
            </div>
          </fieldset>
        )}

        {/* CADA TRANSFER: os voos e as cadeirinhas */}
        {transfers.map((i) => {
          const x = extrasDe(i.id);
          return (
            <fieldset key={i.id} className="min-w-0">
              <legend className="text-lead font-semibold">{i.titulo}</legend>
              <div className="mt-5 grid gap-5">
                {i.transfer?.voos.map((v) => (
                  <Campo key={v.trecho} id={`voo-${v.trecho}-${i.id}`} rotulo={v.rotulo} ajuda={T.vooAjuda}>
                    <input
                      id={`voo-${v.trecho}-${i.id}`}
                      className="campo uppercase"
                      value={x[v.trecho]}
                      onChange={(e) => mudarExtras(i.id, { [v.trecho]: e.target.value })}
                      maxLength={12}
                      aria-describedby={`voo-${v.trecho}-${i.id}-ajuda`}
                    />
                  </Campo>
                ))}
                <div className="space-y-4 bg-papel p-5">
                  <Contador
                    rotulo={T.criancasCadeirinha}
                    ajuda={T.criancasCadeirinhaAjuda}
                    valor={x.idades.length}
                    min={0}
                    max={Math.min(i.transfer?.passageiros ?? 1, 10)}
                    aoMudar={(n) =>
                      mudarExtras(i.id, {
                        idades: n > x.idades.length ? [...x.idades, ...Array(n - x.idades.length).fill('')] : x.idades.slice(0, n),
                      })
                    }
                    textos={textos}
                  />
                  {x.idades.map((idade, n) => {
                    const id = `idade-${i.id}-${n}`;
                    return (
                      <Campo key={id} id={id} rotulo={fmt(T.idadeCrianca, { n: n + 1 })} erro={erros[id]}>
                        <select
                          id={id}
                          className="campo"
                          value={idade}
                          onChange={(e) => mudarExtras(i.id, { idades: x.idades.map((v, k) => (k === n ? e.target.value : v)) })}
                          aria-invalid={Boolean(erros[id])}
                          aria-describedby={descricao(id, erros[id])}
                        >
                          <option value="">{C.selecione}</option>
                          {Array.from({ length: 11 }, (_, k) => (
                            <option key={k} value={k}>
                              {nomeIdade(k)}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    );
                  })}
                </div>
                <p className="bg-superficie px-5 py-4 font-semibold">{T.demaisPassageiros}</p>
              </div>
            </fieldset>
          );
        })}

        <Campo id="obs" rotulo={C.observacoes} ajuda={temPasseio ? C.observacoesAjuda : T.observacoesAjuda}>
          <textarea
            id="obs"
            className="campo min-h-28"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            maxLength={600}
            aria-describedby="obs-ajuda"
          />
        </Campo>

        {/* campo-isca para robôs: escondido de pessoas (taste-skill-ignore) */}
        <div aria-hidden="true" className="absolute -left-[9999px] size-0 overflow-hidden">
          <label htmlFor="site">Site</label>
          <input id="site" tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} />
        </div>

        {/* PAGAMENTO: finaliza com a equipe até o pagamento online entrar */}
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
        <div className="space-y-5 lg:sticky lg:top-24">
          <div className="hidden lg:block">{seuPedido}</div>
          {/* logo acima do total: no celular, as sugestões não empurram os dados do cliente para baixo */}
          <SugestoesCarrinho
            className="rounded-cartao border border-(--color-borda) bg-(--color-papel) px-5 pb-2 pt-5 sm:px-6"
            locale={locale}
            textos={{
              ...K,
              noPix: textos.preco.noPix,
              dataPasseio: textos.dataPasseio,
              escolhaData: textos.escolhaData,
              opcao: C.opcao,
              aPartirDe: textos.aPartirDe,
            }}
          />
          <div className="tom-campo px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold">
                {C.total} <span className="text-(--color-d2)">{textos.preco.noPix}</span>
              </span>
              <span className="numeros titulo leading-none">{brl(totalPixCentavos)}</span>
            </div>
            <p className="mt-2 flex justify-between gap-4 text-small text-(--tinta-suave)">
              <span>
                {C.total} {textos.preco.noCartao}
              </span>
              <span className="numeros font-semibold">{brl(totalCentavos)}</span>
            </p>
          </div>
          <div className="space-y-3">
            {(erroGeral || (tentou && temErros)) && (
              <p className="bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
                {erroGeral || C.erros.revise}
              </p>
            )}
            <button type="submit" className="botao botao-whats w-full" disabled={enviando} aria-busy={enviando}>
              <IconeWhatsApp className="size-5" />
              {enviando ? C.processando : C.finalizarWhatsapp}
            </button>
            <p className="text-small">{K.umPagamento}</p>
            <p className="text-small">{C.avisoTotal}</p>
          </div>
        </div>
      </aside>
    </form>
  );
}

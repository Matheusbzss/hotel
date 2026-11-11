'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Dicionario } from '@/i18n';
import { fmt, type Idioma } from '@/i18n/config';
import { totaisDoCarrinho, type ItemVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { textoDolar } from '@/lib/dolar';
import type { FormaPagamento } from '@/lib/formas-pagamento';
import { rastrear } from '@/lib/pixel';
import type { ChaveRecusa } from '@/lib/recusas';
import {
  CIDADES_HOSPEDAGEM,
  DDIS,
  NOME_CIDADE_HOSPEDAGEM,
  PAIS_PADRAO,
  emailValido,
  telefoneValido,
  type CidadeHospedagem,
} from '@/lib/validacao';
import { Campo, descricao } from '../Campo';
import { Contador } from '../grupo/Contador';
import { IconeWhatsApp } from '../IconeWhatsApp';
import { CheckoutEmbutido, type TextosCheckoutEmbutido } from '../pagamento/CheckoutEmbutido';
import {
  EscolhaPagamento,
  formaPadrao,
  valorDaForma,
  type TextosEscolhaPagamento,
  type TotaisDasFormas,
} from '../pagamento/EscolhaPagamento';
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

/**
 * Os textos do pagamento online que não estão nos blocos que o formulário já recebe (checkout.*, carrinho.*,
 * preco.*): os de pedido.* e recusa.* do checkout embutido. A página monta com textosDoPagamentoOnline.
 */
export interface TextosPagamentoOnline {
  /** "Código do pedido" (pedido.codigo), em cima do total enquanto o checkout embutido está aberto. */
  codigoPedido: string;
  recusadoTitulo: string;
  /** "Cartão recusado? Pague com Pix e ganhe {p}% de desconto", já com o {p} preenchido. */
  recusadoPix: string;
  dicaInternacional: string;
  tentarOutroCartao: string;
  semPixPrazo: string;
  recusa: Record<ChaveRecusa, string>;
}

/**
 * O pagamento online, quando o servidor liberou cartão e/ou Pix (formasDisponiveis, com o interruptor
 * PAGAMENTO_ONLINE e o prazo dos itens; a página monta com pagamentoDoCheckout). Sem ele, ou com a lista
 * vazia, o checkout continua como hoje: registra o pedido e finaliza com a equipe pelo WhatsApp.
 */
export interface PagamentoOnlineCarrinho {
  formas: FormaPagamento[];
  textos: TextosPagamentoOnline;
}

/** O pedido criado com a sessão de pagamento aberta: o formulário dá lugar ao checkout embutido. */
interface SessaoAberta {
  codigo: string;
  token: string;
  itens: number;
  clientSecret: string;
  forma: FormaPagamento;
  /** Os itens como estavam quando o pedido foi criado: é isso que a sessão da Stripe cobra, mesmo que o carrinho mude depois. */
  lista: ItemVisivel[];
}

const SEM_EXTRAS: ExtrasItem = { ida: '', volta: '', idades: [] };
const codigoDoProduto = (i: ItemVisivel) => (i.escolha.tipo === 'passeio' ? i.escolha.slug : 'transfer');

/**
 * O checkout do carrinho: os dados do titular e a hospedagem uma vez só, o que cada transfer precisa, um
 * pagamento só e, no fim, um voucher por item. Com o pagamento online liberado, o cliente escolhe cartão ou Pix,
 * o servidor cria o pedido (pendente) e a sessão da Stripe, e o formulário dela aparece aqui mesmo, com o resumo
 * do pedido ao lado; sem ele, o pedido é registrado e finalizado com a equipe pelo WhatsApp.
 */
export function FormularioCarrinho({
  idioma,
  locale,
  inicial,
  dolar = null,
  notaCambio = '',
  textos,
  links,
  pagamentoOnline,
  pedidoAberto,
}: {
  idioma: Idioma;
  locale: string;
  /** O carrinho lido no servidor, para a página já abrir com os itens. */
  inicial: ItemVisivel[];
  /** Reais por dólar, para o "≈ US$" das páginas em espanhol e inglês (null no português). */
  dolar?: number | null;
  /** A nota com a fonte e a data da cotação, perto do total (vazia sem o ≈ US$). */
  notaCambio?: string;
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
  pagamentoOnline?: PagamentoOnlineCarrinho;
  /** O carrinho está ligado a um pedido que ainda espera o pagamento: o link para continuar de onde parou. */
  pedidoAberto?: { href: string };
}) {
  const C = textos.checkout;
  const T = textos.transfer;
  const K = textos.carrinho;
  const P = textos.preco;
  // as formas que o servidor liberou; a lista encolhe se ele recusar uma na hora de enviar (o prazo de 2 h passou)
  const [formas, setFormas] = useState<FormaPagamento[]>(pagamentoOnline?.formas ?? []);
  const online = formas.length > 0 && pagamentoOnline !== undefined;
  const { itens: atuais, carregado, remover, recarregar } = useCarrinho();
  const itens = carregado ? atuais : inicial;
  const formRef = useRef<HTMLFormElement>(null);
  const checkoutRef = useRef<HTMLDivElement>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [ddi, setDdi] = useState(PAIS_PADRAO[idioma].ddi);
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
  const [forma, setForma] = useState<FormaPagamento | null>(() => formaPadrao(formas, idioma));
  const [sessao, setSessao] = useState<SessaoAberta | null>(null);
  const emailGuardado = useRef('');

  const temPasseio = itens.some((i) => i.tipo === 'passeio');
  const transfers = itens.filter((i) => i.transfer);
  const { totalCentavos, totalPixCentavos } = totaisDoCarrinho(itens);
  // passeio e transfer cobram o total; a casa (sinal) ainda não entra no carrinho
  const totais: TotaisDasFormas = { cartaoCentavos: totalCentavos, pixCentavos: totalPixCentavos };
  const brl = (c: number) => formatarCifra(c, locale);
  const usd = (c: number) => textoDolar(c, dolar, P.dolar, locale);
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
    // o funil das estatísticas: este carrinho chegou ao checkout
    fetch('/api/carrinho', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout: true }),
    }).catch(() => null);
    // só na abertura do checkout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // o checkout embutido entra no lugar do formulário: a tela volta para o começo dele
  useEffect(() => {
    if (sessao) checkoutRef.current?.scrollIntoView({ block: 'start' });
  }, [sessao]);

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
          // a forma escolhida: o servidor cria o pedido pendente e a sessão da Stripe; sem ela, o pedido do WhatsApp
          ...(online && forma ? { pagamento: forma } : {}),
        }),
      });
      const corpo = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        codigo?: string;
        token?: string;
        itens?: number;
        clientSecret?: string;
        erro?: string;
        /** Com o erro 'forma': as formas que ainda valem para estes itens. */
        formas?: unknown[];
      };
      if (corpo.ok && corpo.codigo && corpo.token) {
        if (online && forma && corpo.clientSecret) {
          // o formulário da Stripe entra aqui mesmo; o pedido já existe e o link privado já funciona
          rastrear('AddPaymentInfo', {
            content_ids: itens.map(codigoDoProduto),
            content_type: 'product',
            value: valorDaForma(totais, forma) / 100,
            currency: 'BRL',
            num_items: itens.length,
          });
          setSessao({
            codigo: corpo.codigo,
            token: corpo.token,
            itens: corpo.itens ?? itens.length,
            clientSecret: corpo.clientSecret,
            forma,
            lista: itens,
          });
          setEnviando(false);
          return;
        }
        // a página inteira recarrega: o carrinho, que virou pedido, volta vazio. Tem de ser assim (nunca router.push):
        // a página do pedido leva o token do cliente no endereço e precisa nascer sem as tags de anúncio (src/lib/pixel.ts)
        const base = corpo.itens === 1 ? links.reserva : links.pedido;
        window.location.assign(`${base}/${corpo.codigo}?t=${encodeURIComponent(corpo.token)}`);
        return;
      }
      if (corpo.erro === 'mudou') {
        await recarregar();
        setErroGeral(K.mudou);
      } else if (corpo.erro === 'forma') {
        // a forma deixou de valer enquanto o cliente preenchia (o prazo de 2 h passou): a lista encolhe para o que o servidor ainda aceita
        const restantes = (corpo.formas ?? []).filter((f): f is FormaPagamento => f === 'pix' || f === 'cartao');
        setFormas(restantes);
        setForma(formaPadrao(restantes, idioma, forma ?? undefined));
        setErroGeral(
          forma === 'pix' && !restantes.includes('pix') ? (pagamentoOnline?.textos.semPixPrazo ?? C.erros.generico) : C.erros.generico,
        );
      } else setErroGeral(C.erros.generico);
    } catch {
      setErroGeral(C.erros.generico);
    }
    setEnviando(false);
  }

  if (!itens.length && !sessao) {
    return (
      <div className="max-w-[44ch]">
        <p className="text-lead">{K.vazio}</p>
        {pedidoAberto ? (
          <Link href={pedidoAberto.href} className="botao mt-6">
            {K.continuarPagamento}
          </Link>
        ) : (
          <Link href={links.passeios} className="botao mt-6">
            {K.verPasseios}
          </Link>
        )}
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
          dolar={dolar}
          textos={{
            mudar: K.mudar,
            remover: K.remover,
            noPix: P.noPix,
            noCartao: P.noCartao,
            dolar: P.dolar,
          }}
          aoRemover={remover}
        />
      </div>
    </section>
  );

  /* O checkout embutido: o formulário da Stripe no lugar dos dados, com o resumo em cima (celular) ou ao lado (computador). */
  if (sessao && pagamentoOnline) {
    const O = pagamentoOnline.textos;
    const textosCheckout: TextosCheckoutEmbutido = {
      recusadoTitulo: O.recusadoTitulo,
      recusadoPix: O.recusadoPix,
      dicaInternacional: O.dicaInternacional,
      tentarOutroCartao: O.tentarOutroCartao,
      semPixPrazo: O.semPixPrazo,
      recusa: O.recusa,
      processando: C.processando,
      erroGenerico: C.erros.generico,
    };
    // o resumo é o do pedido criado, não o do carrinho de agora: a gaveta ainda deixa tirar item, e a Stripe cobra o pedido
    const doPedido = totaisDoCarrinho(sessao.lista);
    const valor = valorDaForma({ cartaoCentavos: doPedido.totalCentavos, pixCentavos: doPedido.totalPixCentavos }, sessao.forma);
    const base = sessao.itens === 1 ? links.reserva : links.pedido;
    const urlVolta = `${base}/${sessao.codigo}?t=${encodeURIComponent(sessao.token)}`;
    const itensDoPedido = (
      <section className="rounded-cartao border border-(--color-borda) bg-(--color-papel) px-5 py-5 sm:px-6">
        <h2 className="text-lead font-semibold">
          {K.seuPedido}{' '}
          <span className="text-small font-normal text-(--color-tinta-suave)">· {textoQuantidade(K, sessao.lista.length)}</span>
        </h2>
        <ul className="mt-3 divide-y divide-(--color-borda)">
          {sessao.lista.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-semi)] font-semibold leading-snug">{i.titulo}</p>
                {i.detalhes.map((linha) => (
                  <p key={linha} className="text-small text-(--color-tinta-suave)">
                    {linha}
                  </p>
                ))}
              </div>
              <span className="numeros shrink-0 font-semibold">{brl(sessao.forma === 'pix' ? i.totalPixCentavos : i.totalCentavos)}</span>
            </li>
          ))}
        </ul>
      </section>
    );
    // grid-cols-1: no celular, uma coluna que encolhe com a tela (o motivo está no formulário, mais abaixo)
    return (
      <div ref={checkoutRef} className="grid scroll-mt-24 grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-14">
        <aside className="lg:order-last lg:col-span-5">
          <div className="space-y-5 lg:sticky lg:top-24">
            <div className="tom-campo px-6 py-5">
              <p className="text-small">
                {O.codigoPedido} <span className="numeros font-semibold">{sessao.codigo}</span>
              </p>
              {/* o preço desce para a linha de baixo quando não cabe ao lado do rótulo, como no total do formulário */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="flex-1 font-semibold">
                  {C.total} <span className="text-(--color-d2)">{sessao.forma === 'pix' ? P.noPix : P.noCartao}</span>
                  {usd(valor) && <span className="whitespace-nowrap text-small font-normal text-(--tinta-suave)"> · {usd(valor)}</span>}
                </span>
                <span className="numeros titulo ml-auto leading-none">{brl(valor)}</span>
              </div>
              {dolar && notaCambio && <p className="mt-2 text-caption text-(--tinta-suave)">{notaCambio}</p>}
            </div>
            <div className="hidden lg:block">{itensDoPedido}</div>
            <p className="hidden text-small lg:block">{K.umPagamento}</p>
          </div>
        </aside>
        <div className="lg:col-span-7">
          <h2 className="text-lead font-semibold">{C.pagamento}</h2>
          <div className="mt-5">
            <CheckoutEmbutido
              clientSecret={sessao.clientSecret}
              forma={sessao.forma}
              codigoPedido={sessao.codigo}
              codigoConsulta={sessao.codigo}
              token={sessao.token}
              idioma={idioma}
              pixDisponivel={formas.includes('pix')}
              urlVolta={urlVolta}
              textos={textosCheckout}
              aoTrocarForma={(nova) => setSessao((s) => (s ? { ...s, forma: nova } : s))}
            />
          </div>
          {sessao.forma === 'cartao' && <p className="mt-4 text-small text-(--tinta-suave)">{C.seguro}</p>}
          <div className="mt-8 lg:hidden">{itensDoPedido}</div>
        </div>
      </div>
    );
  }

  const textosEscolha: TextosEscolhaPagamento | null = pagamentoOnline
    ? {
        formaPagamento: C.formaPagamento,
        cartao: C.cartao,
        pix: C.pix,
        cartaoAvista: C.cartaoAvista,
        pixExplicacao: C.pixExplicacao,
        pixApps: C.pixApps,
        descontoPix: P.descontoPix,
        semPixPrazo: pagamentoOnline.textos.semPixPrazo,
        dolar: P.dolar,
      }
    : null;
  // no total em destaque, a forma escolhida; a outra embaixo (sem pagamento online, o Pix em destaque, como no site)
  const destaquePix = !online || forma !== 'cartao';

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        enviar();
      }}
      // grid-cols-1: no celular, uma coluna que encolhe com a tela. Sem isto a coluna fica da largura do maior texto
      // que não quebra (o total com o ≈ US$, o item do pedido, as sugestões) e a página rola de lado na tela estreita
      className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14"
    >
      <div className="space-y-12 lg:col-span-7">
        {/* o carrinho já virou um pedido que espera o pagamento: o caminho de volta para ele, sem refazer nada */}
        {pedidoAberto && (
          <div className="tom-superficie px-5 py-4">
            <Link href={pedidoAberto.href} className="botao botao-vazado w-full sm:w-auto">
              {K.continuarPagamento}
            </Link>
          </div>
        )}
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

        {/* PAGAMENTO: cartão ou Pix quando o servidor liberou; senão, finaliza com a equipe */}
        {online && textosEscolha ? (
          <EscolhaPagamento
            formas={formas}
            escolhida={forma}
            aoEscolher={setForma}
            totais={totais}
            locale={locale}
            dolar={dolar}
            textos={textosEscolha}
          />
        ) : (
          <fieldset className="min-w-0">
            <legend className="text-lead font-semibold">{C.pagamento}</legend>
            <div className="tom-superficie mt-5 px-5 py-5">
              <p className="font-bold">{C.indisponivelTitulo}</p>
              <p className="mt-2">{C.indisponivelTexto}</p>
            </div>
          </fieldset>
        )}

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
            dolar={dolar}
            textos={{
              ...K,
              noPix: P.noPix,
              dolar: P.dolar,
              dataPasseio: textos.dataPasseio,
              escolhaData: textos.escolhaData,
              opcao: C.opcao,
              aPartirDe: textos.aPartirDe,
            }}
          />
          <div className="tom-campo px-6 py-5">
            {/* quando o rótulo e o preço não cabem lado a lado (tela estreita, total alto), o preço desce para a linha de
                baixo, à direita, em vez de empurrar a página para o lado */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="flex-1 font-semibold">
                {C.total} <span className="text-(--color-d2)">{destaquePix ? P.noPix : P.noCartao}</span>
                {usd(destaquePix ? totalPixCentavos : totalCentavos) && (
                  <span className="whitespace-nowrap text-small font-normal text-(--tinta-suave)">
                    {' '}
                    · {usd(destaquePix ? totalPixCentavos : totalCentavos)}
                  </span>
                )}
              </span>
              <span className="numeros titulo ml-auto leading-none" aria-live="polite">
                {brl(destaquePix ? totalPixCentavos : totalCentavos)}
              </span>
            </div>
            <p className="mt-2 flex justify-between gap-4 text-small text-(--tinta-suave)">
              <span>
                {C.total} {destaquePix ? P.noCartao : P.noPix}
                {usd(destaquePix ? totalCentavos : totalPixCentavos) && (
                  <span className="whitespace-nowrap"> · {usd(destaquePix ? totalCentavos : totalPixCentavos)}</span>
                )}
              </span>
              <span className="numeros font-semibold">{brl(destaquePix ? totalCentavos : totalPixCentavos)}</span>
            </p>
            {/* a fonte e a data da cotação, só quando o ≈ US$ aparece (espanhol e inglês) */}
            {dolar && notaCambio && <p className="mt-2 text-caption text-(--tinta-suave)">{notaCambio}</p>}
          </div>
          <div className="space-y-3">
            {(erroGeral || (tentou && temErros)) && (
              <p className="bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
                {erroGeral || C.erros.revise}
              </p>
            )}
            {online && forma ? (
              <button type="submit" className="botao w-full" disabled={enviando} aria-busy={enviando}>
                {enviando ? C.processando : fmt(C.pagar, { valor: brl(valorDaForma(totais, forma)) })}
              </button>
            ) : (
              <button type="submit" className="botao botao-whats w-full" disabled={enviando} aria-busy={enviando}>
                <IconeWhatsApp className="size-5" />
                {enviando ? C.processando : C.finalizarWhatsapp}
              </button>
            )}
            <p className="text-small">{K.umPagamento}</p>
            <p className="text-small">{C.avisoTotal}</p>
            {online && forma === 'cartao' && <p className="text-small text-(--tinta-suave)">{C.seguro}</p>}
          </div>
        </div>
      </aside>
    </form>
  );
}

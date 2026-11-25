'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Dicionario } from '@/i18n';
import { fmt, type Idioma } from '@/i18n/config';
import { totaisDoCarrinho, type ItemVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { cartaoEmDestaque } from '@/lib/preco-destaque';
import { textoDolar } from '@/lib/dolar';
import { envioProtegido, semRespostaDaProtecao } from '@/lib/envio-protegido';
import type { FormaPagamento, MotivoSemPix } from '@/lib/formas-pagamento';
import { rastrear } from '@/lib/pixel';
import type { ChaveRecusa } from '@/lib/recusas';
import { garantiasDoCheckout } from '@/lib/garantias-checkout';
import { formasChegaram, releituraDoCheckout } from '@/lib/releitura-do-checkout';
import { respostaDeRobo } from '@/lib/robos';
import {
  CIDADES_HOSPEDAGEM,
  DDIS,
  NOME_CIDADE_HOSPEDAGEM,
  PAIS_PADRAO,
  emailValido,
  telefoneValido,
  type CidadeHospedagem,
} from '@/lib/validacao';
import type { WhatsAppDoRobo } from '@/lib/whatsapp';
import { BotaoWhatsAppDoRobo } from '../BotaoWhatsAppDoRobo';
import { Campo, descricao } from '../Campo';
import { ComDolar } from '../ComDolar';
import { Contador } from '../grupo/Contador';
import { IconeWhatsApp } from '../IconeWhatsApp';
import { ICONES } from '../passeio/Confianca';
import { CheckoutEmbutido, motivoSemPix, type TextosCheckoutEmbutido } from '../pagamento/CheckoutEmbutido';
import {
  EscolhaPagamento,
  formaPadrao,
  fraseSemPix,
  valorDaForma,
  type TextosEscolhaPagamento,
  type TotaisDasFormas,
} from '../pagamento/EscolhaPagamento';
import { useCarrinho } from './CarrinhoContexto';
import { textoQuantidade } from './GavetaCarrinho';
import { ListaCarrinho } from './ListaCarrinho';
import { SugestoesCarrinho } from './SugestoesCarrinho';
import { TextoDoItem } from './TextoDoItem';

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
  /** Quando o valor do pedido passa do limite de um Pix (pedido.semPixLimite). */
  semPixLimite: string;
  /** O aviso do nome que o app do banco mostra no Pix (checkout.pixRecebedor). */
  pixRecebedor: string;
  recusa: Record<ChaveRecusa, string>;
}

/**
 * O pagamento online, quando o servidor liberou cartão e/ou Pix (formasDoPagamento, com o interruptor
 * PAGAMENTO_ONLINE, o prazo dos itens e o limite de valor do Pix; a página monta com pagamentoDoCheckout). Sem ele, ou
 * com a lista vazia, o checkout continua como hoje: registra o pedido e finaliza com a equipe pelo WhatsApp.
 */
export interface PagamentoOnlineCarrinho {
  formas: FormaPagamento[];
  /** Sem o Pix, por quê: o prazo ou o limite de valor de um Pix. */
  semPix?: MotivoSemPix;
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
/** A ajuda do telefone com cada número de exemplo inteiro numa linha: não quebra no espaço nem no hífen ("1234-" / "5678"). */
const numerosInteiros = (texto: string) =>
  texto.split(/(\+\d[\d -]*\d)/).map((parte, n) =>
    n % 2 ? (
      <span key={n} className="whitespace-nowrap">
        {parte}
      </span>
    ) : (
      parte
    ),
  );
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
  contato,
  pagamentoOnline,
  pagamentoLigado = false,
  pedidoAberto,
  lembretesLigados = false,
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
    /** "Tentar de novo" (reserva.tentarNovamente), quando o formulário da Stripe não carrega. */
    tentarDeNovo: string;
    /** Quem a proteção contra robôs confundiu com robô (comum.robo; o 403 'robo', src/lib/robos.ts). */
    robo: string;
    /** O botão do WhatsApp embaixo dessa mensagem, só com ela (whatsappDoRobo, src/lib/whatsapp.ts; Pacote 21). */
    roboWhatsapp: WhatsAppDoRobo;
    /** As garantias embaixo do botão (passeio.garantiasOnline; garantiasDoCheckout, src/lib/garantias-checkout.ts). */
    garantias: readonly string[];
  };
  links: { termos: string; politica: string; privacidade: string; reserva: string; pedido: string; passeios: string };
  /** O e-mail da equipe (o link já montado no servidor), para quando o formulário da Stripe não carrega. */
  contato?: { href: string; rotulo: string };
  pagamentoOnline?: PagamentoOnlineCarrinho;
  /**
   * O pagamento online vale para este visitante, seja qual for o carrinho (decidido no servidor: pagamentoOnlineAberto).
   * Com ele, o formulário que tem itens e ficou sem formas pede a página de novo ao servidor, uma vez a cada
   * volta à página (releituraDoCheckout). Sem ele (o pagamento online desligado), o caminho do WhatsApp continua como sempre.
   */
  pagamentoLigado?: boolean;
  /** O carrinho está ligado a um pedido que ainda espera o pagamento: o link para continuar de onde parou. */
  pedidoAberto?: { href: string };
  /** Os e-mails estão ligados (RESEND_API_KEY): só então a ajuda do e-mail fala dos lembretes do carrinho. */
  lembretesLigados?: boolean;
}) {
  const C = textos.checkout;
  const T = textos.transfer;
  const K = textos.carrinho;
  const P = textos.preco;
  // as formas que o servidor liberou; a lista encolhe se ele recusar uma na hora de enviar (o prazo de 2 h passou), e o
  // motivo de o Pix ficar de fora (o prazo ou o limite de valor) acompanha
  const [formas, setFormas] = useState<FormaPagamento[]>(pagamentoOnline?.formas ?? []);
  const [semPix, setSemPix] = useState<MotivoSemPix | undefined>(pagamentoOnline?.semPix);
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
  const erroRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

  // a página que abriu sem as formas (o carrinho estava vazio no servidor) e que o cliente reencontra com itens (o botão
  // de voltar reaproveita a página guardada, ou o Safari a devolve da memória de voltar): com o pagamento online ligado,
  // ela pede a página de novo ao servidor (router.refresh), uma vez a cada volta à página (jaReleu, a trava contra o laço:
  // se a página relida ainda vier sem formas, fica como hoje e não pede de novo). Só as formas que vieram do servidor contam (releituraDoCheckout,
  // src/lib/releitura-do-checkout.ts; achado CE-1 da varredura de 24/11, Pacote 26)
  const [jaReleu, setJaReleu] = useState(false);
  const [relendo, comecarReleitura] = useTransition();
  const formasDoServidor = pagamentoOnline?.formas.length ?? 0;
  const reler = releituraDoCheckout({
    pagamentoLigado,
    formasDoServidor,
    itens: itens.length,
    sessaoAberta: sessao !== null,
    jaReleu,
  });
  // enquanto a página não volta relida, o botão do WhatsApp fica desligado: com o pagamento online aberto, o servidor o
  // recusaria (400 'pagamento')
  const esperandoFormas = reler || relendo;
  useEffect(() => {
    if (!reler) return;
    setJaReleu(true);
    // sem rede, o refresh cairia na navegação do navegador (a página de "sem conexão") e o que o cliente digitou se
    // perderia: a página fica como hoje (o mesmo cuidado de src/components/pagamento/AoVoltarParaAAba.tsx)
    if (navigator.onLine === false) return;
    comecarReleitura(() => router.refresh());
  }, [reler, router]);
  // as formas da página relida entram no formulário quando a página de antes não tinha nenhuma (a lista, o motivo de o Pix
  // ficar de fora e a forma marcada). Uma página que já tinha as formas fica com as dela. A troca é feita aqui, na
  // renderização, quando as formas que vêm do servidor mudam: o React desenha de novo na hora, sem mostrar o quadro antigo
  const [formasDaPagina, setFormasDaPagina] = useState(pagamentoOnline?.formas);
  if (pagamentoOnline?.formas !== formasDaPagina) {
    setFormasDaPagina(pagamentoOnline?.formas);
    if (formasChegaram(formasDaPagina?.length ?? 0, formasDoServidor)) {
      const novas = pagamentoOnline?.formas ?? [];
      setFormas(novas);
      setSemPix(pagamentoOnline?.semPix);
      setForma(formaPadrao(novas, idioma));
    }
  }

  const temPasseio = itens.some((i) => i.tipo === 'passeio');
  // algum passeio com taxa paga no local (embarque ou prefeitura): a linha das taxas perto do total
  const comTaxaNoLocal = itens.some((i) => i.taxaNoLocal);
  const transfers = itens.filter((i) => i.transfer);
  const { totalCentavos, totalPixCentavos } = totaisDoCarrinho(itens);
  // passeio e transfer cobram o total; a casa (sinal) ainda não entra no carrinho
  const totais: TotaisDasFormas = { cartaoCentavos: totalCentavos, pixCentavos: totalPixCentavos };
  // no pagamento online sem o Pix (o prazo de 2 horas ou o limite de valor de um Pix), a tela inteira mostra só o valor
  // do cartão, como a página do pedido: os itens, as sugestões e o total. Um preço "no Pix" que não dá para pagar
  // confundia, ao lado do botão que cobra o do cartão. No caminho do WhatsApp, os dois valores, como sempre
  const soCartao = online && !formas.includes('pix');
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

  // o erro do envio recebe o foco: o botão ficou desligado durante o envio, e sem isso o próximo Tab recomeçaria do topo.
  // O foco também rola a tela até ele, quando nasce fora da vista. O "revise os campos" não: ali o foco vai para o campo
  useEffect(() => {
    if (erroGeral) erroRef.current?.focus();
  }, [erroGeral]);

  // a página que o navegador guardou inteira e devolveu pelo botão de voltar (a memória de voltar do Safari): o envio que
  // terminou com a página inteira indo para o pedido ("Registrar e finalizar pelo WhatsApp", ou o 409 "mudou" com o
  // pedido em aberto) deixaria o botão em "Processando…" e desligado. O botão volta, e o carrinho é relido no servidor (o
  // que virou pedido sai dele), como na primeira carga. A trava da releitura também solta: a página devolvida que tem
  // itens e nenhuma forma pede a página de novo ao servidor, uma vez por volta (o router.refresh não dispara o pageshow)
  useEffect(() => {
    const aoMostrar = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setEnviando(false);
      setJaReleu(false);
      recarregar();
    };
    window.addEventListener('pageshow', aoMostrar);
    return () => window.removeEventListener('pageshow', aoMostrar);
  }, [recarregar]);

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
    // a página está sendo relida para trazer as formas: o envio sem forma, o servidor recusaria
    if (esperandoFormas) return;
    setErroGeral('');
    setTentou(true);
    if (Object.keys(validar()).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setEnviando(true);
    try {
      const res = await envioProtegido('/api/pedido', {
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
        /** Com o erro 'forma': as formas que ainda valem para estes itens e, sem o Pix, o motivo. */
        formas?: unknown[];
        semPix?: unknown;
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
        // o carrinho já é um pedido que esperava o pagamento: o servidor recusou porque ele foi pago nesse meio-tempo (o
        // Pix confirmado enquanto o cliente voltava do banco) ou porque um item perdeu o prazo. A página do pedido diz o
        // estado de verdade ("Pedido confirmado!", ou o que ainda dá para pagar), com a página inteira carregando (nunca
        // router.push: ela leva o token no endereço e nasce sem as tags de anúncio). Recarregar o carrinho aqui deixava
        // "Seu carrinho está vazio." com o "Continuar o pagamento" de um pedido já pago (reteste de 16-17/11, R3)
        if (pedidoAberto) {
          window.location.assign(pedidoAberto.href);
          return;
        }
        await recarregar();
        setErroGeral(K.mudou);
      } else if (corpo.erro === 'forma') {
        // a forma deixou de valer enquanto o cliente preenchia (o prazo de 2 h passou): a lista encolhe para o que o servidor ainda aceita
        const restantes = (corpo.formas ?? []).filter((f): f is FormaPagamento => f === 'pix' || f === 'cartao');
        const motivo = restantes.includes('pix') ? undefined : motivoSemPix(corpo.semPix);
        setFormas(restantes);
        setSemPix(motivo);
        setForma(formaPadrao(restantes, idioma, forma ?? undefined));
        setErroGeral(
          forma === 'pix' && !restantes.includes('pix') && pagamentoOnline ? fraseSemPix(pagamentoOnline.textos, motivo) : C.erros.generico,
        );
      } else if (respostaDeRobo(res.status, corpo)) {
        // confundido com robô pela proteção: nada foi gravado, e a mensagem própria no lugar do erro de sempre
        setErroGeral(textos.robo);
      } else setErroGeral(C.erros.generico);
    } catch (e) {
      // a proteção contra robôs não respondeu (o desafio preso ou o script dele bloqueado, src/lib/envio-protegido.ts): o
      // mesmo que o 403 'robo' mostra, e o botão volta a funcionar
      setErroGeral(semRespostaDaProtecao(e) ? textos.robo : C.erros.generico);
    }
    setEnviando(false);
  }

  if (!itens.length && !sessao) {
    return (
      <div className="max-w-[44ch]">
        <p className="text-lead">{K.vazio}</p>
        {/* o envio voltou "mudou" e o carrinho relido ficou vazio (o único item perdeu o prazo enquanto o cliente
            preenchia, como o transfer que passou das 2 horas de antecedência): a frase diz por quê, com o foco. Só ela: um
            erro de antes, de um carrinho que o cliente esvaziou com as próprias mãos, não fica na tela */}
        {erroGeral === K.mudou && (
          <p ref={erroRef} tabIndex={-1} className="mt-4 bg-erro-claro px-4 py-3 font-semibold text-mar outline-none" role="alert">
            {erroGeral}
          </p>
        )}
        {pedidoAberto ? (
          // um botão que carrega a página inteira, nunca um link do site: a página do pedido leva o token no endereço e
          // nasce sem as tags de anúncio (src/lib/pixel.ts); sem pré-carga e sem o token num href desta página
          <button type="button" className="botao mt-6" onClick={() => window.location.assign(pedidoAberto.href)}>
            {K.continuarPagamento}
          </button>
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
          soCartao={soCartao}
          textos={{
            mudar: K.mudar,
            remover: K.remover,
            noPix: P.noPix,
            noCartao: P.noCartao,
            noPixComDesconto: P.noPixComDesconto,
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
      semPixLimite: O.semPixLimite,
      pixRecebedor: O.pixRecebedor,
      recusa: O.recusa,
      processando: C.processando,
      erroGenerico: C.erros.generico,
      semStripe: C.semStripe,
      tentarDeNovo: textos.tentarDeNovo,
      robo: textos.robo,
      roboWhatsapp: textos.roboWhatsapp,
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
          {/* quando o texto não cabe ao lado do preço (tela muito estreita ou letra grande), o preço desce para a linha de
              baixo, à direita, em vez de ficar por cima do texto: a coluna do texto não encolhe abaixo da sua maior parte
              que não quebra ("8 passageiros"). Sozinha na linha, ela pode encolher até a largura toda (max-w-full), e só
              então, com a letra grande, essa parte quebra por dentro (TextoDoItem; @container: a largura do item) */}
          {sessao.lista.map((i) => (
            <li key={i.id} className="@container flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
              <div className="max-w-full flex-1">
                <p className="font-[family-name:var(--font-semi)] font-semibold leading-snug">
                  <TextoDoItem texto={i.titulo} letra="nome" />
                </p>
                {i.detalhes.map((linha) => (
                  <p key={linha} className="text-small text-(--color-tinta-suave)">
                    <TextoDoItem texto={linha} letra="linha" />
                  </p>
                ))}
              </div>
              <span className="numeros ml-auto shrink-0 font-semibold">
                {brl(sessao.forma === 'pix' ? i.totalPixCentavos : i.totalCentavos)}
              </span>
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
              {/* o código nunca quebra no hífen de "ON-": quando não cabe ao lado do rótulo, desce inteiro */}
              <p className="text-small">
                {O.codigoPedido} <span className="numeros whitespace-nowrap font-semibold">{sessao.codigo}</span>
              </p>
              {/* o preço desce para a linha de baixo quando não cabe ao lado do rótulo, como no total do formulário */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="flex-1 font-semibold">
                  <ComDolar dolar={usd(valor)} className="text-small font-normal text-(--tinta-suave)">
                    <span className="whitespace-nowrap">
                      {C.total} <span className="text-(--color-d2)">{sessao.forma === 'pix' ? P.noPix : P.noCartao}</span>
                    </span>
                  </ComDolar>
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
              semPix={semPix}
              urlVolta={urlVolta}
              contato={contato}
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
        pixRecebedor: pagamentoOnline.textos.pixRecebedor,
        descontoPix: P.descontoPix,
        semPixPrazo: pagamentoOnline.textos.semPixPrazo,
        semPixLimite: pagamentoOnline.textos.semPixLimite,
        dolar: P.dolar,
      }
    : null;
  // no total em destaque, a forma escolhida (sem pagamento online, a do preço grande do site: o Pix em português, o cartão
  // em espanhol e inglês, src/lib/preco-destaque.ts); a outra embaixo, só se ela também vale para este pedido (sem o Pix,
  // o quadro mostra só o total no cartão)
  const destaque: FormaPagamento = online && forma ? forma : cartaoEmDestaque(locale) ? 'cartao' : 'pix';
  const outra = (['pix', 'cartao'] as const).find((f) => f !== destaque && (!online || formas.includes(f)));
  const rotuloDaForma = (f: FormaPagamento) => (f === 'pix' ? P.noPix : P.noCartao);
  // "Seus dados são tratados conforme a nossa {politica}.": o nome da política vira o link, com os espaços dentro do texto
  const [antesDaPolitica, depoisDaPolitica = ''] = C.privacidadeAviso.split('{politica}');

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
            {/* o mesmo botão que carrega a página inteira (o motivo está no carrinho vazio, mais acima); type="button"
                para não enviar o formulário */}
            <button type="button" className="botao botao-vazado w-full sm:w-auto" onClick={() => window.location.assign(pedidoAberto.href)}>
              {K.continuarPagamento}
            </button>
          </div>
        )}
        {/* no celular, o pedido vem antes dos dados; no computador, fica preso na coluna do lado */}
        <div className="lg:hidden">{seuPedido}</div>

        {/* DADOS DO TITULAR */}
        <fieldset className="min-w-0">
          <legend className="text-lead font-semibold">{C.seusDados}</legend>
          {/* grid-cols-1 nas grades do formulário: a coluna encolhe com a tela, como a do formulário inteiro (o motivo
              está lá em cima, no <form>); sem isto, com a letra grande, um rótulo ou o contador alargava a coluna */}
          <div className="mt-5 grid grid-cols-1 gap-5">
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
                aria-describedby={descricao('email', erros.email, lembretesLigados ? C.emailAjuda : undefined)}
                required
              />
              {/* para que serve o e-mail, ali onde ele é pedido (LGPD): ele fica guardado no carrinho assim que o cliente
                  sai do campo, para os lembretes de quem não terminou a compra. A política abre em outra aba, como os
                  links do aceite, para não perder o que já foi preenchido. Com o erro, o erro fica no lugar */}
              {!erros.email && lembretesLigados && (
                <span id="email-ajuda" className="ajuda">
                  {`${C.emailAjuda} `}
                  <Link href={links.privacidade} target="_blank" className="link">
                    {C.emailPrivacidade}
                  </Link>
                </span>
              )}
            </Campo>
            <div>
              <span className="rotulo" id="telefone-rotulo">
                {C.telefone}
              </span>
              {/* o país e o telefone lado a lado, como sempre, enquanto os dois cabem; quando não cabem (a letra grande em
                  tela estreita), o telefone desce para a linha de baixo e ocupa a linha inteira. O telefone cresce a partir
                  do zero (flex-1) e nunca fica com menos de 9rem, onde cabem os 13 caracteres de "21 99999-9999" (6,54rem
                  na letra do campo) com o respiro e a borda dele: a linha só quebra com menos de 17rem (7,5 do país, 0,5
                  do vão e 9 do telefone). Com a letra normal isso é 272 px, e a linha tem 288 em 320 px: nada muda. Até o
                  reteste de 22/11 a linha não quebrava, e em 320 px com a letra em 150% sobravam 80 px para o telefone (3
                  algarismos à vista por vez) */}
              <div className="flex flex-wrap gap-2">
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
                  className="campo min-w-[9rem] flex-1"
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
                  {numerosInteiros(C.telefoneAjuda)}
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
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
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
              <div className="mt-5 grid grid-cols-1 gap-5">
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
            semPix={semPix}
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
          {/* a Política de Privacidade sempre à mão, com ou sem os e-mails ligados: abre em outra aba, como os links do
              aceite, para não perder o que já foi preenchido */}
          <p className="mt-3 text-small text-(--tinta-suave)">
            {antesDaPolitica}
            <Link href={links.privacidade} target="_blank" className="link font-semibold">
              {C.emailPrivacidade}
            </Link>
            {depoisDaPolitica}
          </p>
        </div>
      </div>

      {/* RESUMO */}
      <aside className="lg:col-span-5">
        <div className="space-y-5 lg:sticky lg:top-24">
          <div className="hidden lg:block">{seuPedido}</div>
          <div className="tom-campo px-6 py-5">
            {/* quando o rótulo e o preço não cabem lado a lado (tela estreita, total alto), o preço desce para a linha de
                baixo, à direita, em vez de empurrar a página para o lado */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              {/* "Total no Pix" e "≈ US$ 12,46" ficam inteiros: o rótulo só quebra entre os dois pedaços */}
              <span className="flex-1 font-semibold">
                <ComDolar dolar={usd(valorDaForma(totais, destaque))} className="text-small font-normal text-(--tinta-suave)">
                  <span className="whitespace-nowrap">
                    {C.total} <span className="text-(--color-d2)">{rotuloDaForma(destaque)}</span>
                  </span>
                </ComDolar>
              </span>
              <span className="numeros titulo ml-auto leading-none" aria-live="polite">
                {brl(valorDaForma(totais, destaque))}
              </span>
            </div>
            {outra && (
              // como a linha de cima: o valor desce para a linha de baixo, à direita, só quando nem a maior parte do
              // rótulo cabe ao lado dele; com a letra normal, fica igual
              <p className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-small text-(--tinta-suave)">
                <span className="grow basis-0">
                  <ComDolar dolar={usd(valorDaForma(totais, outra))}>
                    <span className="whitespace-nowrap">
                      {C.total} {rotuloDaForma(outra)}
                    </span>
                  </ComDolar>
                </span>
                <span className="numeros ml-auto font-semibold">{brl(valorDaForma(totais, outra))}</span>
              </p>
            )}
            {/* a fonte e a data da cotação, só quando o ≈ US$ aparece (espanhol e inglês) */}
            {dolar && notaCambio && <p className="mt-2 text-caption text-(--tinta-suave)">{notaCambio}</p>}
          </div>
          <div className="space-y-3">
            {online && forma ? (
              <button type="submit" className="botao w-full" disabled={enviando} aria-busy={enviando}>
                {enviando ? C.processando : fmt(C.pagar, { valor: brl(valorDaForma(totais, forma)) })}
              </button>
            ) : (
              // desligado também enquanto a página é relida para trazer as formas (esperandoFormas), com o mesmo texto
              <button
                type="submit"
                className="botao botao-whats w-full"
                disabled={enviando || esperandoFormas}
                aria-busy={enviando || esperandoFormas}
              >
                <IconeWhatsApp className="size-5" />
                {enviando ? C.processando : C.finalizarWhatsapp}
              </button>
            )}
            {/* o erro nasce embaixo do botão, e não em cima dele: assim o botão não é empurrado para fora da tela */}
            {(erroGeral || (tentou && temErros)) && (
              <p ref={erroRef} tabIndex={-1} className="bg-erro-claro px-4 py-3 font-semibold text-mar outline-none" role="alert">
                {erroGeral || C.erros.revise}
              </p>
            )}
            {/* o WhatsApp da equipe só com a mensagem do robô (a exceção à regra de só depois do pagamento) */}
            {erroGeral === textos.robo && <BotaoWhatsAppDoRobo whatsapp={textos.roboWhatsapp} />}
            {/* as garantias do quadro do passeio, perto do botão (Pacote 27): só as que valem para este carrinho */}
            <ul className="grid gap-y-2 text-small">
              {garantiasDoCheckout(textos.garantias, { temPasseio, voucherNaHora: online && forma !== null }).map(([icone, frase]) => (
                <li key={icone} className="flex items-center gap-2.5">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5 shrink-0 text-(--color-turquesa-texto)"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={ICONES[icone]} />
                  </svg>
                  {frase}
                </li>
              ))}
            </ul>
            <p className="text-small">{K.umPagamento}</p>
            <p className="text-small">{C.avisoTotal}</p>
            {/* o total não inclui as taxas pagas no local dos passeios; o transfer já inclui pedágio e estacionamento */}
            {comTaxaNoLocal && <p className="text-small">{K.taxasNoLocal}</p>}
            {online && forma === 'cartao' && <p className="text-small text-(--tinta-suave)">{C.seguro}</p>}
          </div>
          {/* depois do botão de pagar (Pacote 27): as sugestões não ficam entre o cliente e o pagamento */}
          <SugestoesCarrinho
            className="rounded-cartao border border-(--color-borda) bg-(--color-papel) px-5 pb-2 pt-5 sm:px-6"
            locale={locale}
            dolar={dolar}
            soCartao={soCartao}
            textos={{
              ...K,
              noPix: P.noPix,
              noCartao: P.noCartao,
              dolar: P.dolar,
              dataPasseio: textos.dataPasseio,
              escolhaData: textos.escolhaData,
              opcao: C.opcao,
              aPartirDe: textos.aPartirDe,
            }}
          />
        </div>
      </aside>
    </form>
  );
}

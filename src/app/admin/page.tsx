import { cookies } from 'next/headers';
import { EMPRESA } from '@/config/empresa';
import { COOKIE_ADMIN, adminConfigurado, segredoDoPainelCriado, sessaoValida } from '@/lib/admin-auth';
import { CIENTE_DOS_SETE_DIAS, avisoDaDesistenciaNosSeteDias, planoDoCancelamento, travaDaDesistencia } from '@/lib/cancelar-sem-reembolso';
import { contarCotacoesNovas } from '@/lib/cotacoes';
import { avisoDasDesistencias, desistenciaParaResponder, rotuloDaDesistenciaRespondida } from '@/lib/desistencia';
import { modoPagamentoOnline } from '@/lib/formas-pagamento';
import { textoDaOrigem } from '@/lib/origem';
import { linkPainelStripe, modoStripe } from '@/lib/stripe';
import { obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { formatarHora } from '@/lib/horarios';
import { MAXIMO_NOME_DO_HOTEL } from '@/lib/hospedagem';
import { semFaixas } from '@/lib/passeio-view';
import {
  ACOES_DO_PAGAMENTO_RETIDO,
  ACOES_MANUAIS_DO_PAINEL,
  BOTAO_REATIVAR_RETIDO,
  BUSCA_DO_PAINEL_MAXIMO,
  EM_ABERTO,
  NAO_PAGO,
  NENHUM_VOUCHER,
  SEM_REEMBOLSO_DEPOIS_DA_FALHA,
  SEM_REEMBOLSO_NA_CONTESTACAO,
  acaoDoRetidoOferecida,
  acaoManualOferecida,
  agruparPedidos,
  avisoAberto,
  avisosDeContestacao,
  avisoDosPagamentosRetidos,
  avisosDeReembolso,
  botaoDevolverRetido,
  botaoDevolvidoPorFora,
  botaoVoucherDaStripe,
  botaoVoucherPorFora,
  buscaDoPainel,
  confirmacaoDaAcaoManual,
  contarPagamentosRetidos,
  contarReembolsosAResolver,
  contestacoesAbertas,
  devolucaoNoPainel,
  formaEProvedorNoPainel,
  fraseDoErro,
  fraseDoPagamentoRetido,
  fraseDoReembolsoSemVoucher,
  frasesDoReembolsoNoPainel,
  motivoNoPainel,
  naoPagoNoPainel,
  oQueFazerNaContestacao,
  pagamentoRetidoADecidir,
  reembolsoNoPainel,
  reembolsoParaResolver,
  seloDoPedidoNoPainel,
  statusDoSelo,
  statusDoVoucherNoPainel,
  valorDoVoucherPorFora,
  valorRecebido,
  voucherAtivo,
  type AcaoManualDoPainel,
  type PedidoPainel,
  type ReembolsoNoPainel,
} from '@/lib/pedidos-painel';
import type { ReembolsoSemVoucher } from '@/lib/reembolsos-a-resolver';
import { enderecoDoResumo } from '@/lib/resumo-do-painel';
import { pedidoCanceladoSemReembolso } from '@/lib/sem-reembolso';
import { AVISO_DA_SESSAO_VENCIDA } from '@/lib/sessao-do-painel';
import { textoPessoas } from '@/lib/pessoas';
import { formatarPreco } from '@/lib/precos';
import {
  ehCasa,
  ehPasseio,
  ehTransfer,
  listarReservas,
  ondeFicamAsReservas,
  type Reserva,
  type ReservaCasa,
  type ReservaPasseio,
  type ReservaTransfer,
  type StatusReserva,
} from '@/lib/reservas';
import { transferVisivel } from '@/lib/transfer-view';
import { NOME_CIDADE_HOSPEDAGEM, formatarDataIso } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

/** A cor do selo do pedido, pelo status do pedido inteiro (o texto do selo: seloDoPedidoNoPainel). */
const COR: Record<StatusReserva, string> = {
  pendente: 'bg-sol text-mar',
  pago: 'bg-[#d8f5e4] text-[#0f5132]',
  recusado: 'bg-erro-claro text-[#7a1f12]',
  cancelado: 'bg-[#e5e9ee] text-mar',
  expirado: 'bg-[#e5e9ee] text-mar',
  aguardando_whatsapp: 'bg-turquesa text-mar',
  reembolsado: 'bg-[#e5e9ee] text-mar',
  contestado: 'bg-erro-claro text-[#7a1f12]',
};

const DICIONARIO_PT = dicionario('pt');
const ROTULOS_PESSOAS = DICIONARIO_PT.comum.rotulos;

/**
 * Os filtros da barra. `status`: os status do pedido que entram; `ou`: mais os pedidos que esta regra aceita, em qualquer
 * status; `so`: só os pedidos que esta regra aceita.
 */
const FILTROS: {
  valor: string;
  rotulo: string;
  status?: StatusReserva[];
  ou?: (p: PedidoPainel) => boolean;
  so?: (p: PedidoPainel) => boolean;
}[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'pagas', rotulo: 'Pagos', status: ['pago'] },
  { valor: 'abertas', rotulo: 'Em aberto', status: ['pendente', 'aguardando_whatsapp'] },
  { valor: 'contestados', rotulo: 'Contestados', status: ['contestado'] },
  // os pedidos de desistência pelo site que ainda esperam a equipe (a faixa do topo leva para cá)
  { valor: 'desistencias', rotulo: 'Desistências', so: (p) => desistenciaParaResponder(p.itens) },
  // os reembolsos que pedem uma ação da equipe: o que falhou, o feito direto na Stripe sem voucher, o parado por uma
  // contestação (as três faixas do topo levam para cá)
  { valor: 'reembolsos', rotulo: 'Reembolsos a resolver', so: (p) => reembolsoParaResolver(p) },
  // Pacote 33: também o pedido pago que a equipe cancelou sem reembolso inteiro (continua pago, e conta como venda: P3)
  {
    valor: 'outras',
    rotulo: 'Recusados / cancelados',
    status: ['recusado', 'cancelado', 'expirado', 'reembolsado'],
    ou: (p) => pedidoCanceladoSemReembolso(p.itens),
  },
];

/**
 * Os filtros que só a faixa do topo abre, sem botão na barra (a barra de filtros não muda no celular): os pedidos
 * cancelados que receberam um pagamento ainda à espera da decisão da equipe (Pacote 22).
 */
const FILTROS_DAS_FAIXAS: typeof FILTROS = [
  {
    valor: 'pagamentos-a-decidir',
    rotulo: 'Pagamentos a decidir',
    so: (p) => p.itens[0] !== undefined && pagamentoRetidoADecidir(p.itens[0]),
  },
];

const dataHora = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
    : '—';

/** Quanto o cliente viu na moeda dele (Adaptive Pricing), que a Stripe guarda na menor unidade da moeda. */
function moedaApresentada(a: { moeda: string; valorCentavos: number }): string {
  try {
    const formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: a.moeda });
    const casas = formato.resolvedOptions().maximumFractionDigits ?? 2;
    return formato.format(a.valorCentavos / 10 ** casas);
  } catch {
    return `${a.moeda} ${a.valorCentavos}`;
  }
}

/** O que o cabeçalho diz do pagamento online: a Stripe (teste ou produção) e o interruptor, ou desligado. */
function textoPagamentoOnline(): string {
  const stripe = modoStripe();
  if (stripe === 'desligado') return 'desligado — pedidos finalizados pelo WhatsApp';
  const interruptor = modoPagamentoOnline();
  const quem =
    interruptor === 'publico'
      ? 'aberto ao público'
      : interruptor === 'admin'
        ? 'só para o admin'
        : 'interruptor PAGAMENTO_ONLINE desligado';
  return `Stripe (${stripe === 'producao' ? 'produção' : 'teste'}), ${quem}`;
}

function Login({ erro }: { erro?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/orla-nativa-horizontal.svg" alt={EMPRESA.marca} width={711} height={172} className="h-14 w-auto self-start" />
      <h1 className="mt-8 text-2xl font-bold text-mar">Área administrativa</h1>
      {/* Pacote 33, D3: o botão de um formulário do painel com a sessão vencida volta para cá (pedidoRecusado) */}
      {erro === 'sessao' && (
        <p role="status" className="mt-4 bg-sol px-4 py-3 text-small font-semibold">
          {AVISO_DA_SESSAO_VENCIDA}
        </p>
      )}
      {!adminConfigurado() && (
        <p className="mt-4 bg-sol px-4 py-3 text-small">
          Defina a variável de ambiente <strong>ADMIN_PASSWORD</strong> na Vercel para liberar o acesso.
        </p>
      )}
      <form method="post" action="/api/admin/login" className="mt-6 space-y-4">
        <div>
          <label htmlFor="senha" className="rotulo">
            Senha
          </label>
          <input id="senha" name="senha" type="password" autoComplete="current-password" className="campo" required autoFocus />
        </div>
        {erro === 'senha' && (
          <p className="erro-campo" role="alert">
            Senha incorreta.
          </p>
        )}
        {erro === 'limite' && (
          <p className="erro-campo" role="alert">
            Muitas tentativas. Espere 15 minutos e tente de novo.
          </p>
        )}
        <button type="submit" className="botao w-full">
          Entrar
        </button>
      </form>
    </main>
  );
}

/** O passeio, a data, a hora, as pessoas e a hospedagem. */
function DetalhesPasseio({
  r,
  gravarHotel,
}: {
  r: ReservaPasseio;
  /** Pacote 29: o campo para gravar o hotel a informar, com o filtro e a busca em que a equipe estava (uma vez por pedido). */
  gravarHotel?: { filtro: string; busca: string };
}) {
  const p = obterPasseio(r.passeio.slug);
  return (
    <>
      <p className="font-bold">
        {r.passeio.nome}
        {r.passeio.opcao ? ` — ${r.passeio.opcao.nome}` : ''}
      </p>
      <p>
        {formatarDataIso(r.data, 'pt-BR')} ·{' '}
        {r.horario && (
          <>
            <strong>
              {r.horario.busca ? 'Busca na hospedagem' : 'Saída'} às {formatarHora(r.horario.hora, 'pt')}
            </strong>{' '}
            ·{' '}
          </>
        )}
        {textoPessoas(r, ROTULOS_PESSOAS, p ? semFaixas(p) : false)}
        {r.passeio.unidade !== 'pessoa' ? ` · ${r.unidades} ${r.passeio.unidade === 'veiculo' ? 'veículo(s)' : 'embarcação(ões)'}` : ''}
      </p>
      {r.hospedagem.aInformar ? (
        // o cliente marcou "Ainda não sei" no checkout: a equipe pede o hotel pelo WhatsApp antes do passeio
        <>
          <p>
            Hotel: <strong className="bg-(--color-acao) px-1">a informar</strong> ({NOME_CIDADE_HOSPEDAGEM[r.hospedagem.cidade]}) — o
            cliente ainda não sabe; pedir pelo WhatsApp antes do passeio
          </p>
          {/* Pacote 29: quando o cliente responder, a equipe grava o hotel aqui; vale para todos os passeios do pedido */}
          {gravarHotel && (
            <form method="post" action={`/api/admin/reservas/${r.codigo}`} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="acao" value="hotel" />
              <input type="hidden" name="filtro" value={gravarHotel.filtro} />
              {gravarHotel.busca && <input type="hidden" name="q" value={gravarHotel.busca} />}
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-small">
                <span>Nome do hotel ou pousada</span>
                <input
                  name="hotel"
                  required
                  maxLength={MAXIMO_NOME_DO_HOTEL}
                  autoComplete="off"
                  className="min-h-10 w-full min-w-0 border border-borda bg-white px-3"
                />
              </label>
              <button type="submit" className="min-h-10 bg-superficie px-4 text-small font-semibold text-mar hover:bg-borda">
                Gravar o hotel
              </button>
            </form>
          )}
        </>
      ) : (
        <p>
          Hotel: <strong>{r.hospedagem.hotel}</strong> ({NOME_CIDADE_HOSPEDAGEM[r.hospedagem.cidade]})
        </p>
      )}
    </>
  );
}

/** O transfer: o veículo, a ida e a volta (com voo), os passageiros, as malas e as cadeirinhas. */
function DetalhesTransfer({ r }: { r: ReservaTransfer }) {
  const v = transferVisivel(r, 'pt', DICIONARIO_PT);
  const trechos = [
    ['Ida', v.ida],
    ['Volta', v.volta],
  ] as const;
  return (
    <>
      <p className="font-bold">Transfer privado — {v.veiculo}</p>
      {trechos.map(
        ([rotulo, t]) =>
          t && (
            <p key={rotulo}>
              {rotulo}:{' '}
              <strong>
                {formatarDataIso(t.data, 'pt-BR')} às {t.hora}
              </strong>{' '}
              · {t.saida} → {t.destino}
              {t.voo ? ` · voo ${t.voo}` : ''}
            </p>
          ),
      )}
      <p>
        {v.passageiros} · {v.malas}
      </p>
      {v.cadeirinhas && <p>Cadeirinhas: {v.cadeirinhas}</p>}
    </>
  );
}

/**
 * A casa de temporada no pedido (Etapa 7), o mínimo para a equipe: a casa, a entrada às 15h e a saída às 12h, as diárias,
 * os hóspedes e o que foi pago no site (o sinal) e o que fica para a chegada, na forma do pedido. Sem endereço: a equipe
 * manda a localização pelo WhatsApp depois do pagamento. O bloco completo do painel fica para a parte 2 do pacote 1.
 */
function DetalhesCasa({ r, metodo }: { r: ReservaCasa; metodo: string }) {
  const pix = metodo === 'pix';
  const total = pix ? (r.totalPixCentavos ?? r.totalCentavos) : r.totalCentavos;
  const sinal = pix ? r.sinalPixCentavos : r.sinalCentavos;
  const noites = r.linhas.reduce((s, l) => s + l.noites, 0);
  return (
    <>
      <p className="font-bold">{r.casa.nome}</p>
      <p>
        Entrada <strong>{formatarDataIso(r.data, 'pt-BR')} às 15h</strong> · saída{' '}
        <strong>{formatarDataIso(r.saida, 'pt-BR')} às 12h</strong>
      </p>
      <p>
        {noites} {noites === 1 ? 'diária' : 'diárias'} · {r.hospedes} {r.hospedes === 1 ? 'hóspede' : 'hóspedes'}
      </p>
      <p>
        Sinal{pix ? ' no Pix' : metodo === 'cartao' ? ' no cartão' : ''}: {formatarPreco(sinal)} · na chegada:{' '}
        {formatarPreco(total - sinal)} · total {formatarPreco(total)}
      </p>
    </>
  );
}

/** O que a busca do painel procura além do código e do contato: o passeio e o hotel, a casa, ou os endereços do transfer. */
function textosDaBusca(r: Reserva): string[] {
  if (ehCasa(r)) return [r.casa.nome];
  // "a informar" acha os pedidos em que o cliente ainda não sabia o hotel
  if (!ehTransfer(r)) return [r.hospedagem.aInformar ? 'hotel a informar' : r.hospedagem.hotel, r.passeio.nome];
  const t = r.transfer;
  return ['transfer', t.ida.saida.endereco, t.ida.destino.endereco, t.volta?.saida.endereco, t.volta?.destino.endereco].filter(
    (x): x is string => Boolean(x),
  );
}

/**
 * Um botão de ação do pedido: um form POST para a rota do painel, com o código do voucher no endereço. No
 * reembolso de um item só, o voucher a reembolsar vai também no campo `voucher` (é dele que a rota lê); nas ações
 * sobre um reembolso que a Stripe fez ou não conseguiu fazer, o id dele vai no campo `reembolso`. Com `confirmacao`, o
 * formulário ganha a caixa de marcar obrigatória: o navegador não envia sem ela marcada, e a rota confere de novo. É o
 * gesto de propósito antes de devolver dinheiro ou tirar a validade de um voucher (decisão do dono de 16/11), sem
 * JavaScript, igual no celular e no computador; tocar no texto também marca a caixa. O filtro de status e a busca em que
 * a equipe estava vão em campos escondidos (`filtro` e `q`): a rota volta para o painel com os dois (voltaAoPainel,
 * src/lib/pedidos-painel.ts), e o pedido continua na tela depois da ação (reteste de 22/11: a volta perdia a busca).
 */
function BotaoAcao({
  voucher,
  acao,
  rotulo,
  filtro,
  busca,
  cor = 'bg-superficie',
  item,
  reembolso,
  confirmacao,
  aviso,
  ciente,
}: {
  voucher: string;
  acao: string;
  rotulo: string;
  filtro: string;
  /** A busca em que a equipe estava: volta com o painel depois da ação, junto do filtro. */
  busca: string;
  cor?: string;
  item?: string;
  reembolso?: string;
  confirmacao?: string;
  /** Pacote 33: a frase vermelha da trava dos 7 dias, em cima das caixas. */
  aviso?: string;
  /** Pacote 33: a segunda caixa obrigatória, "Estou ciente" (o campo `ciente`), da trava dos 7 dias. */
  ciente?: string;
}) {
  return (
    // com uma caixa (ou o aviso da trava), o formulário ocupa uma linha inteira só dele (w-full; o texto fica em até
    // max-w-xl): a caixa fica junto do botão dela, e os botões de antes e de depois ficam nas linhas de cima e de baixo,
    // em vez de ficar ao lado do texto da caixa (Pacote 33)
    <form method="post" action={`/api/admin/reservas/${voucher}`} className={confirmacao || ciente || aviso ? 'w-full' : undefined}>
      <input type="hidden" name="acao" value={acao} />
      <input type="hidden" name="filtro" value={filtro} />
      {busca && <input type="hidden" name="q" value={busca} />}
      {item && <input type="hidden" name="voucher" value={item} />}
      {reembolso && <input type="hidden" name="reembolso" value={reembolso} />}
      {aviso && <p className="mb-2 max-w-xl bg-erro-claro px-3 py-2 text-small font-semibold text-[#7a1f12]">{aviso}</p>}
      {confirmacao && (
        <label className="mb-2 flex max-w-xl cursor-pointer items-start gap-3 text-small">
          <input type="checkbox" name="confirmo" value="sim" required className="size-6 shrink-0 accent-[var(--color-mar)]" />
          <span>{confirmacao}</span>
        </label>
      )}
      {ciente && (
        <label className="mb-2 flex max-w-xl cursor-pointer items-start gap-3 text-small">
          <input type="checkbox" name="ciente" value="sim" required className="size-6 shrink-0 accent-[var(--color-mar)]" />
          <span>{ciente}</span>
        </label>
      )}
      <button type="submit" className={`min-h-10 px-4 text-small font-semibold text-mar hover:bg-borda ${cor}`}>
        {rotulo}
      </button>
    </form>
  );
}

/**
 * Devolver o dinheiro pela Stripe: tudo, ou um voucher só (a chuva num passeio de um pedido de três). Desde o Pacote 33
 * (FASE-5, Etapa 2: o resumo e o segundo toque), o botão leva à tela de resumo (/admin/resumo/<pedido>,
 * src/app/admin/resumo/[codigo]/page.tsx), que mostra o que volta, os vouchers que deixam de valer, a forma de
 * pagamento, o prazo da Stripe, o e-mail que o cliente recebe e o saldo da Stripe lido na hora, e só então pede a caixa
 * "Confirmo" e o botão, que mandam para as mesmas ações de antes ('reembolsar' e 'reembolsar_item', com as mesmas
 * frases). O que a tela oferece sai das regras de sempre (reembolsoNoPainel e botaoReembolsoDoVoucher): o voucher que
 * vale mais do que resta continua sem a opção dele. O filtro e a busca vão junto e voltam ao painel depois da ação.
 */
function ReembolsoStripe({ p, filtro, busca }: { p: PedidoPainel; filtro: string; busca: string }) {
  return (
    <a
      href={enderecoDoResumo(p.codigo, { acao: 'reembolsar' }, { filtro, busca })}
      className="inline-flex min-h-10 items-center bg-superficie px-4 text-small font-semibold text-mar hover:bg-borda"
    >
      Reembolsar na Stripe…
    </a>
  );
}

/**
 * Cancelar SEM reembolso (Pacote 33; FASE-5, Etapa 2, passos 2 e 3): no pedido pago pela Stripe, sem contestação e sem
 * reembolso a resolver ou a caminho (planoDoCancelamento, src/lib/cancelar-sem-reembolso.ts), o link para a tela de resumo
 * (/admin/resumo/<pedido>?acao=cancelar_sem_reembolso): os vouchers que deixam de valer, "nada é devolvido", o motivo, a
 * trava dos 7 dias, o idioma da compra e o e-mail que o cliente recebe; no pedido com vários itens, também um voucher só.
 * O pedido do WhatsApp continua com o "Cancelar" de sempre.
 */
function CancelarSemReembolso({ p, filtro, busca }: { p: PedidoPainel; filtro: string; busca: string }) {
  return (
    <a
      href={enderecoDoResumo(p.codigo, { acao: 'cancelar_sem_reembolso' }, { filtro, busca })}
      className="inline-flex min-h-10 items-center bg-superficie px-4 text-small font-semibold text-mar hover:bg-borda"
    >
      Cancelar sem reembolso…
    </a>
  );
}

/**
 * Depois de um reembolso que falhou na Stripe, nenhum botão da Stripe: um "Registrar" por reembolso ainda por devolver
 * (a equipe já devolveu por outro meio; grava a linha que fecha o aviso) e, com o pedido ainda pago, um "voucher
 * devolvido por outro meio" por voucher ainda pago. Cada um pede a caixa "Confirmo". Nenhum chama a Stripe.
 */
function ReembolsoQueFalhou({
  p,
  filtro,
  busca,
  reembolso,
}: {
  p: PedidoPainel;
  filtro: string;
  busca: string;
  reembolso: Extract<ReembolsoNoPainel, { tipo: 'falhou' }>;
}) {
  const r = p.itens[0];
  // o pedido reembolsado com a falha já devolvida por outro meio: nada mais a fazer aqui
  if (!reembolso.pendentes.length && p.status !== 'pago') return null;
  return (
    <div className="max-w-xl space-y-3">
      {reembolso.pendentes.map((f) => {
        const botao = botaoDevolvidoPorFora(f.centavos);
        return (
          <BotaoAcao
            key={f.id}
            voucher={r.codigo}
            acao="devolvido_por_fora"
            reembolso={f.id}
            rotulo={botao.rotulo}
            confirmacao={botao.confirmacao}
            filtro={filtro}
            busca={busca}
            cor="bg-erro-claro"
          />
        );
      })}
      {p.status === 'pago' && <p className="text-small text-tinta-suave">{SEM_REEMBOLSO_DEPOIS_DA_FALHA}</p>}
      {reembolso.vouchersPagos.map((i) => {
        const botao = botaoVoucherPorFora(i.codigo, valorDoVoucherPorFora(valorRecebido(i), reembolso.restanteCentavos));
        return (
          <BotaoAcao
            key={i.codigo}
            voucher={r.codigo}
            acao="voucher_por_fora"
            item={i.codigo}
            rotulo={botao.rotulo}
            confirmacao={botao.confirmacao}
            filtro={filtro}
            busca={busca}
          />
        );
      })}
    </div>
  );
}

/**
 * O reembolso de parte feito direto na Stripe, sem dizer de qual voucher: para cada um, um botão por voucher ativo
 * ("Foi o voucher …", com a caixa "Confirmo": o voucher deixa de valer, sem novo reembolso) e "Nenhum voucher: foi só um
 * desconto". Nenhum chama a Stripe. Com mais de um reembolso assim, cada grupo vem com a frase do seu valor.
 */
function ReembolsoSemVoucherNoPainel({
  p,
  filtro,
  busca,
  semVoucher,
}: {
  p: PedidoPainel;
  filtro: string;
  busca: string;
  semVoucher: ReembolsoSemVoucher[];
}) {
  const r = p.itens[0];
  const ativos = p.itens.filter(voucherAtivo);
  return (
    <div className="max-w-xl space-y-3">
      {semVoucher.map((s) => (
        <div key={s.id} className="space-y-3">
          {semVoucher.length > 1 && <p className="text-small text-tinta-suave">{fraseDoReembolsoSemVoucher(s.centavos)}</p>}
          {ativos.map((i) => {
            const botao = botaoVoucherDaStripe(i.codigo, valorRecebido(i));
            return (
              <BotaoAcao
                key={i.codigo}
                voucher={r.codigo}
                acao="voucher_da_stripe"
                reembolso={s.id}
                item={i.codigo}
                rotulo={botao.rotulo}
                confirmacao={botao.confirmacao}
                filtro={filtro}
                busca={busca}
              />
            );
          })}
          <BotaoAcao
            voucher={r.codigo}
            acao="reembolso_sem_voucher"
            reembolso={s.id}
            rotulo={NENHUM_VOUCHER}
            filtro={filtro}
            busca={busca}
          />
        </div>
      ))}
    </div>
  );
}

/** Um botão das ações do cartão: a ação, o rótulo e, quando pedem, a caixa "Confirmo", o aviso vermelho e a caixa "Estou ciente". */
type AcaoDoCartao = { acao: string; rotulo: string; confirmacao?: string; aviso?: string; ciente?: string };

/**
 * O status é do pedido inteiro, com todos os vouchers: um pagamento só. O que o pedido mostra sobre reembolso vem de
 * reembolsoNoPainel (src/lib/pedidos-painel.ts): os botões da Stripe de sempre, nenhum no pedido contestado (a frase no
 * lugar), os de registrar depois de um reembolso que falhou e os de dizer de qual voucher foi o reembolso feito direto
 * na Stripe. As ações manuais ("Pago no Pix", "Pago no cartão", "Marcar como pago", os dois "Corrigir", "Cancelar" e
 * "Marcar reembolsado") aparecem pela regra única acaoManualOferecida (src/lib/pedidos-painel.ts), com o voucher que
 * representa o pedido: é a mesma que a rota do painel confere de novo antes de gravar, e a aba antiga do painel não faz
 * o que esta tela não oferece mais (reteste de 22/11). Desde o Pacote 33, o "Cancelar sem reembolso…" do pedido pago pela
 * Stripe (planoDoCancelamento) fica ao lado do "Reembolsar na Stripe…".
 */
function Acoes({ p, filtro, busca }: { p: PedidoPainel; filtro: string; busca: string }) {
  const r = p.itens[0];
  const reembolso = reembolsoNoPainel(p);
  // o que cada botão diz. No pedido em aberto do WhatsApp a forma de pagamento define quanto entrou; no pago, os dois
  // botões da forma são para corrigir o que foi marcado errado (a regra só oferece o da outra forma)
  const corrigir = p.status === 'pago';
  const rotulos: Record<AcaoManualDoPainel, string> = {
    pago_pix: corrigir ? 'Corrigir: foi no Pix' : `Pago no Pix (${formatarPreco(p.totalPixCentavos ?? p.totalCentavos)})`,
    pago_cartao: corrigir ? 'Corrigir: foi no cartão' : `Pago no cartão (${formatarPreco(p.totalCentavos)})`,
    marcar_pago: 'Marcar como pago',
    cancelar: 'Cancelar',
    reembolsado: 'Marcar reembolsado',
  };
  // Pacote 33 (D2; decisão do dono de 16/11): "Cancelar" no pedido que já foi pago e "Marcar reembolsado" ganham a caixa
  // "Confirmo" (confirmacaoDaAcaoManual, a mesma regra que a rota confere); o "Cancelar" de quem nunca pagou fica com um toque
  const acoes: AcaoDoCartao[] = ACOES_MANUAIS_DO_PAINEL.filter((acao) => acaoManualOferecida(r, acao)).map((acao) => {
    const confirmacao = confirmacaoDaAcaoManual(r, acao);
    return { acao, rotulo: rotulos[acao], ...(confirmacao ? { confirmacao } : {}) };
  });
  // o pedido de desistência respondido pela equipe, sem reembolso (a política não devolve) ou com o resto do pedido
  // seguindo pago depois do reembolso de uma parte: sai da faixa do topo. Só o reembolso do pedido inteiro tira o pedido
  // de lá sozinho (o status deixa de ser pago). Pacote 33: a desistência que chegou dentro dos 7 dias do arrependimento,
  // respondida sem reembolso, ganha o aviso vermelho e a caixa "Estou ciente" (travaDaDesistencia; a rota confere de novo)
  if (desistenciaParaResponder(p.itens)) {
    const trava = travaDaDesistencia(r);
    acoes.push({
      acao: 'desistencia_respondida',
      rotulo: rotuloDaDesistenciaRespondida(p.reembolsoCentavos),
      ...(trava ? { aviso: avisoDaDesistenciaNosSeteDias(trava), ciente: CIENTE_DOS_SETE_DIAS } : {}),
    });
  }
  // Pacote 33: o "Cancelar sem reembolso…" do pedido pago pela Stripe, pela regra da tela de resumo e da rota, só com
  // o segredo do painel criado na Vercel (segredoDoPainelCriado, decisão P14 do dono)
  const semReembolso = segredoDoPainelCriado() && planoDoCancelamento(p.itens, { acao: 'cancelar_sem_reembolso' }, new Date()).ok;
  // o pagamento que chegou para o pedido cancelado e ficou parado na Stripe (Pacote 22): devolver ou reativar, cada um
  // com a sua caixa "Confirmo", pela mesma regra que a rota confere de novo dentro da trava (acaoDoRetidoOferecida)
  const retido = r.pagamento.retido;
  const botoesDoRetido = retido
    ? ACOES_DO_PAGAMENTO_RETIDO.filter((acao) => acaoDoRetidoOferecida(r, acao)).map((acao) =>
        acao === 'devolver_retido'
          ? { acao, ...botaoDevolverRetido(retido.valorCentavos), cor: 'bg-erro-claro' }
          : { acao, ...BOTAO_REATIVAR_RETIDO, cor: 'bg-superficie' },
      )
    : [];
  return (
    <div className="flex min-w-0 flex-col items-start gap-3">
      {botoesDoRetido.length > 0 && (
        <div className="max-w-xl space-y-3">
          {botoesDoRetido.map((b) => (
            <BotaoAcao
              key={b.acao}
              voucher={r.codigo}
              acao={b.acao}
              rotulo={b.rotulo}
              confirmacao={b.confirmacao}
              filtro={filtro}
              busca={busca}
              cor={b.cor}
            />
          ))}
        </div>
      )}
      {(acoes.length > 0 || reembolso.tipo === 'stripe' || semReembolso) && (
        <div className="flex flex-wrap items-start gap-2">
          {acoes.map((a) => (
            <BotaoAcao
              key={a.acao}
              voucher={r.codigo}
              acao={a.acao}
              rotulo={a.rotulo}
              confirmacao={a.confirmacao}
              aviso={a.aviso}
              ciente={a.ciente}
              filtro={filtro}
              busca={busca}
            />
          ))}
          {reembolso.tipo === 'stripe' && <ReembolsoStripe p={p} filtro={filtro} busca={busca} />}
          {semReembolso && <CancelarSemReembolso p={p} filtro={filtro} busca={busca} />}
        </div>
      )}
      {/* no contestado, a frase no lugar da caixa "Reembolsar na Stripe…" (o que fazer fica na frase vermelha de cima) */}
      {reembolso.tipo === 'contestado' && <p className="max-w-xl text-small text-tinta-suave">{SEM_REEMBOLSO_NA_CONTESTACAO}</p>}
      {reembolso.tipo === 'falhou' && <ReembolsoQueFalhou p={p} filtro={filtro} busca={busca} reembolso={reembolso} />}
      {(reembolso.tipo === 'falhou' || reembolso.tipo === 'stripe') && reembolso.semVoucher.length > 0 && (
        <ReembolsoSemVoucherNoPainel p={p} filtro={filtro} busca={busca} semVoucher={reembolso.semVoucher} />
      )}
    </div>
  );
}

/** O id na Stripe, com o link para o painel dela (em modo teste, com /test/ no caminho). */
function LinkStripe({ id }: { id: string }) {
  return (
    <a
      href={linkPainelStripe(id)}
      target="_blank"
      rel="noopener noreferrer"
      className="block break-all text-small underline underline-offset-4"
    >
      {id}
    </a>
  );
}

/** A forma de pagamento e o valor: em aberto, os dois preços; depois de pago, o que entrou, com os dados do pagamento. */
function ValorDoPedido({ p }: { p: PedidoPainel }) {
  const r = p.itens[0];
  const g = r.pagamento;
  if (EM_ABERTO.includes(p.status) && p.totalPixCentavos !== undefined) {
    return (
      <>
        <p className="text-xl font-bold">{formatarPreco(p.totalPixCentavos)}</p>
        <p className="text-small text-tinta-suave">no Pix</p>
        <p className="mt-1 font-semibold">{formatarPreco(p.totalCentavos)}</p>
        <p className="text-small text-tinta-suave">no cartão</p>
        {p.provedor === 'stripe' && (
          <p className="mt-1 text-small text-tinta-suave">
            Stripe · escolheu {p.metodo === 'pix' ? 'Pix' : 'cartão'}
            {g.motivoCodigo ? ` · ${motivoNoPainel(g.motivoCodigo, p.metodo).resumo}` : ''}
          </p>
        )}
        {p.provedor === 'stripe' && r.pagamentoExternoId && <LinkStripe id={r.pagamentoExternoId} />}
      </>
    );
  }
  // o que chegou ao cliente (com a parte por outro meio) e o que falta devolver porque o reembolso falhou na Stripe
  const devolucao = devolucaoNoPainel(p);
  // a forma e, embaixo, quem cobrou; sem a segunda linha quando ela repetiria a primeira (o pedido do WhatsApp cancelado
  // antes de pagar: "WhatsApp" uma vez só)
  const { forma, provedor } = formaEProvedorNoPainel(p);
  // o pedido fora da Stripe que nunca foi pago (o do WhatsApp cancelado antes de pagar): "não pago" junto do valor, que em
  // letra grande parecia dinheiro recebido (reteste de 17-18/11, pergunta 11). Num pedaço que não se parte: na coluna
  // estreita do computador, desce para a linha de baixo quando não cabe ao lado do valor
  const naoPago = naoPagoNoPainel(p);
  return (
    <>
      <p className="text-xl font-bold">
        {formatarPreco(p.recebidoCentavos)}
        {naoPago && (
          <>
            {' '}
            <span className="whitespace-nowrap text-small font-semibold">{NAO_PAGO}</span>
          </>
        )}
      </p>
      <p className="text-small text-tinta-suave">
        {forma}
        {g.cartaoPais ? ` · cartão ${g.cartaoPais}` : ''}
      </p>
      {provedor && <p className="text-small text-tinta-suave">{provedor}</p>}
      {g.apresentado && <p className="text-small text-tinta-suave">Cliente viu {moedaApresentada(g.apresentado)}</p>}
      {devolucao.reembolsado && <p className="mt-1 text-small font-semibold">{devolucao.reembolsado}</p>}
      {devolucao.falta && <p className="mt-1 text-small font-semibold text-[#7a1f12]">{devolucao.falta}</p>}
      {p.provedor === 'stripe' ? (
        <>
          {r.paymentIntentId && <LinkStripe id={r.paymentIntentId} />}
          {r.pagamentoExternoId && <LinkStripe id={r.pagamentoExternoId} />}
        </>
      ) : (
        g.pedidoId && <p className="break-all text-small text-tinta-suave">{g.pedidoId}</p>
      )}
    </>
  );
}

/** A última recusa do cartão, ou o Pix que venceu, em português. O código da Stripe vai depois, para a busca. */
function MotivoDoPagamento({ codigo, metodo }: { codigo: string; metodo: PedidoPainel['metodo'] }) {
  const m = motivoNoPainel(codigo, metodo);
  return (
    <li>
      {m.rotulo}: {m.frase}
      {m.codigo && <span className="text-tinta-suave"> · código na Stripe: {m.codigo}</span>}
    </li>
  );
}

/**
 * Um pedido: o cliente uma vez só, um bloco para cada voucher, o total e as ações. No celular, uma coluna que encolhe com a
 * tela (grid-cols-1, como as páginas do cliente desde o Pacote 9): sem ela, a coluna "auto" crescia até a linha mais larga
 * (os códigos da Stripe do histórico), e o cartão, com a caixa "Confirmo" do reembolso, passava da tela (reteste de
 * 16-17/11, R1). Do lg para cima, as 12 colunas de sempre.
 */
function CartaoPedido({ p, filtro, busca }: { p: PedidoPainel; filtro: string; busca: string }) {
  const r = p.itens[0];
  const varios = p.itens.length > 1;
  const whats = `https://wa.me/${r.cliente.telefone.replace(/\D/g, '')}`;
  const documento = p.itens.find((i): i is ReservaPasseio => ehPasseio(i) && Boolean(i.cliente.documento));
  // Pacote 29: o campo "Gravar o hotel" aparece uma vez por pedido, no primeiro passeio com o hotel a informar (a rota
  // grava o mesmo hotel em todos os passeios do pedido que estão a informar)
  const primeiroAInformar = p.itens.find((i) => ehPasseio(i) && i.hospedagem.aInformar)?.codigo;
  return (
    <li className="grid grid-cols-1 gap-4 bg-white p-5 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <p className="text-xl font-bold tracking-tight">{p.codigo}</p>
        {/* o status do pedido inteiro; no reembolsado cujo reembolso falhou na Stripe e ainda não voltou ao cliente,
            "Reembolso pendente", como as linhas dos vouchers e a página do cliente (seloDoPedidoNoPainel) */}
        <span className={`mt-1 inline-block px-3 py-1 text-small font-semibold ${COR[statusDoSelo(p)]}`}>{seloDoPedidoNoPainel(p)}</span>
        {p.status === 'contestado' && <p className="mt-2 text-small font-semibold text-[#7a1f12]">{oQueFazerNaContestacao(p.metodo)}</p>}
        {/* o pagamento que chegou com o pedido cancelado, à espera da decisão (Pacote 22) */}
        {r.pagamento.retido && pagamentoRetidoADecidir(r) && (
          <p className="mt-2 text-small font-semibold text-[#7a1f12]">{fraseDoPagamentoRetido(r.pagamento.retido.valorCentavos)}</p>
        )}
        {desistenciaParaResponder(p.itens) && (
          <p className="mt-2 text-small font-semibold text-[#7a1f12]">
            Pedido de desistência pelo site: responder em até 1 dia útil. Antes de estornar, confirme com o titular pelo e-mail ou WhatsApp
            do pedido; o estorno é só pela forma original (Reembolsar na Stripe), nunca para dados escritos no motivo.
          </p>
        )}
        {/* o reembolso que falhou, o feito direto na Stripe sem voucher e o parado por uma contestação: o que fazer */}
        {frasesDoReembolsoNoPainel(p).map((frase, n) => (
          <p key={n} className="mt-2 text-small font-semibold text-[#7a1f12]">
            {frase}
          </p>
        ))}
        {varios && <p className="mt-2 text-small font-semibold">{p.itens.length} itens</p>}
        <p className="mt-2 text-small text-tinta-suave">Criado {dataHora(p.criadoEm)}</p>
        {p.pagoEm && <p className="text-small text-tinta-suave">Pago {dataHora(p.pagoEm)}</p>}
      </div>
      <ul className="divide-y divide-borda lg:col-span-4">
        {p.itens.map((i) => {
          // o status de verdade do voucher, como a página do cliente: o próprio ou o do pedido reembolsado ou cancelado inteiro,
          // e "Reembolso pendente" no reembolsado cujo reembolso falhou na Stripe e ainda não voltou ao cliente
          const statusDoVoucher = statusDoVoucherNoPainel(i);
          return (
            <li key={i.codigo} className="py-3 first:pt-0 last:pb-0">
              {varios && (
                <p className="mb-1 text-small font-semibold">
                  Voucher {i.codigo} · {formatarPreco(valorRecebido(i))}
                  {p.metodo === 'whatsapp' && i.totalPixCentavos !== undefined ? ` (${formatarPreco(i.totalPixCentavos)} no Pix)` : ''}
                  {statusDoVoucher ? ` · ${statusDoVoucher}` : ''}
                </p>
              )}
              {ehTransfer(i) ? (
                <DetalhesTransfer r={i} />
              ) : ehCasa(i) ? (
                <DetalhesCasa r={i} metodo={p.metodo} />
              ) : (
                <DetalhesPasseio r={i} gravarHotel={i.codigo === primeiroAInformar ? { filtro, busca } : undefined} />
              )}
              {ehPasseio(i) && i.sugestao && (
                <p className="mt-1 text-small font-semibold text-turquesa-texto">Pegou pela sugestão do carrinho</p>
              )}
            </li>
          );
        })}
        {/* o texto do cliente e o nome da campanha podem vir sem espaço: quebram em qualquer ponto para não alargar o
            cartão no celular (revisor do Pacote 12) */}
        {r.observacoes && <li className="py-3 text-small [overflow-wrap:anywhere] last:pb-0">Obs.: {r.observacoes}</li>}
      </ul>
      <div className="lg:col-span-3">
        <p className="font-semibold">{r.cliente.nome}</p>
        {documento && (
          <p className="text-small">
            {documento.cliente.documentoTipo === 'cpf' ? 'CPF' : 'Passaporte'} {documento.cliente.documento}
          </p>
        )}
        <p>
          <a href={whats} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            {r.cliente.telefone}
          </a>
        </p>
        <p className="break-all">
          <a href={`mailto:${r.cliente.email}`} className="underline underline-offset-4">
            {r.cliente.email}
          </a>
        </p>
        <p className="text-small text-tinta-suave">
          Idioma: {r.idioma.toUpperCase()}
          {r.cliente.pais ? ` · País: ${r.cliente.pais}` : ''}
        </p>
        {textoDaOrigem(r.origem) && (
          <p className="text-small text-tinta-suave [overflow-wrap:anywhere]">Veio de: {textoDaOrigem(r.origem)}</p>
        )}
      </div>
      <div className="lg:col-span-2 lg:text-right">
        <ValorDoPedido p={p} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 lg:col-span-12">
        <Acoes p={p} filtro={filtro} busca={busca} />
        {/* com algum aviso aberto (a Stripe não devolveu, valor diferente, pago depois do horário, o e-mail com os
            vouchers que não saiu, o pedido de desistência), o histórico já vem aberto. Os códigos da Stripe das linhas
            (cs_test_…, pi_…, re_…) não têm onde quebrar: no celular, quebram em qualquer ponto em vez de alargar o cartão */}
        <details className="text-small" open={r.historico.some((_, n) => avisoAberto(r.historico, n))}>
          <summary className="cursor-pointer font-semibold">Histórico</summary>
          <ul className="mt-2 space-y-1 [overflow-wrap:anywhere]">
            {r.historico.map((h, n) => (
              // o aviso leva as cores do rótulo "Contestado": a equipe precisa agir
              <li key={n} className={avisoAberto(r.historico, n) ? 'bg-erro-claro px-2 py-1 font-semibold text-[#7a1f12]' : undefined}>
                {dataHora(h.em)} — {h.evento}
              </li>
            ))}
            {r.pagamento.motivo && <li>Motivo: {r.pagamento.motivo}</li>}
            {r.pagamento.motivoCodigo && <MotivoDoPagamento codigo={r.pagamento.motivoCodigo} metodo={p.metodo} />}
          </ul>
        </details>
      </div>
    </li>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) {
    return <Login erro={typeof q.erro === 'string' ? q.erro : undefined} />;
  }

  const filtroAtual = typeof q.status === 'string' ? q.status : '';
  // a busca: sem os espaços das pontas e no máximo o que a caixa aceita (buscaDoPainel, a mesma regra com que a rota das
  // ações a devolve no endereço depois de cada ação)
  const busca = buscaDoPainel(q.q).toLowerCase();
  // a rota das ações volta com ?erro=<código> quando recusa uma ação; a faixa vermelha mostra a frase fixa desse
  // código (ERROS_DO_PAINEL), nunca o texto que veio no endereço
  const erroAcao = fraseDoErro(typeof q.erro === 'string' ? q.erro : undefined);
  let todas: Reserva[] = [];
  let erroBanco = '';
  try {
    todas = await listarReservas();
  } catch (e) {
    erroBanco = String(e instanceof Error ? e.message : e);
  }
  const filtro = [...FILTROS, ...FILTROS_DAS_FAIXAS].find((f) => f.valor === filtroAtual) ?? FILTROS[0];
  const pedidos = agruparPedidos(todas);
  const lista = pedidos.filter(
    (p) =>
      (!filtro.status || filtro.status.includes(p.status) || Boolean(filtro.ou?.(p))) &&
      (!filtro.so || filtro.so(p)) &&
      (!busca ||
        p.itens.some((r) =>
          [p.codigo, r.codigo, r.cliente.nome, r.cliente.email, r.cliente.telefone, ...textosDaBusca(r)].some((c) =>
            c.toLowerCase().includes(busca),
          ),
        )),
  );
  const cotacoesNovas = await contarCotacoesNovas().catch(() => 0);
  const pagos = pedidos.filter((p) => p.status === 'pago');
  // o que entrou, menos o que já voltou para o cliente
  const receita = pagos.reduce((s, p) => s + p.recebidoCentavos - p.reembolsoCentavos, 0);
  const contestacoes = avisosDeContestacao(contestacoesAbertas(pedidos));
  // pagos, com o pedido de desistência pelo site, pelo menos um voucher pago e sem a marca de respondido (o reembolso de
  // uma parte não tira da faixa): a faixa vale mesmo sem os e-mails
  const desistencias = pedidos.filter((p) => desistenciaParaResponder(p.itens)).length;
  // os reembolsos que pedem uma ação da equipe (as contas são por pedido): também valem sem os e-mails
  const reembolsos = avisosDeReembolso(contarReembolsosAResolver(pedidos));
  // os pedidos cancelados que receberam um pagamento ainda à espera da decisão (Pacote 22): também valem sem os e-mails
  const pagamentosRetidos = avisoDosPagamentosRetidos(contarPagamentosRetidos(pedidos));

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/orla-nativa-emblema.svg" alt="" width={48} height={48} className="size-12" />
          {/* o bloco do título pode encolher (min-w-0) e a linha quebra em qualquer ponto: com a chave da Stripe posta e o
              interruptor desligado, a palavra "PAGAMENTO_ONLINE" não tinha onde quebrar e a página rolava 19 px de lado em
              320 px com a letra em 150% (reteste de 22/11) */}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Pedidos</h1>
            <p className="text-small text-tinta-suave [overflow-wrap:anywhere]">
              Pagamento online: {textoPagamentoOnline()} · Pedidos em: {ondeFicamAsReservas()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/admin/estatisticas" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Estatísticas
          </a>
          <a href="/admin/casas" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Casas
          </a>
          <a href="/admin/cotacoes" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Cotações
          </a>
          <a href="/admin/avaliacoes" className="min-h-10 bg-white px-4 py-2 font-semibold">
            Avaliações
          </a>
          <form method="post" action="/api/admin/logout">
            <button type="submit" className="min-h-10 bg-white px-4 font-semibold">
              Sair
            </button>
          </form>
        </div>
      </header>

      {cotacoesNovas > 0 && (
        <a href="/admin/cotacoes?status=nova" className="mt-6 block bg-sol px-5 py-3 font-semibold text-mar">
          {cotacoesNovas === 1 ? '1 cotação nova' : `${cotacoesNovas} cotações novas`} para responder →
        </a>
      )}
      {contestacoes.map((aviso) => (
        <a key={aviso} href="/admin?status=contestados" className="mt-3 block bg-erro-claro px-5 py-3 font-semibold text-mar">
          {aviso} →
        </a>
      ))}
      {desistencias > 0 && (
        <a href="/admin?status=desistencias" className="mt-3 block bg-erro-claro px-5 py-3 font-semibold text-mar">
          {avisoDasDesistencias(desistencias)}: responder em até 1 dia útil →
        </a>
      )}
      {reembolsos.map((aviso) => (
        <a key={aviso} href="/admin?status=reembolsos" className="mt-3 block bg-erro-claro px-5 py-3 font-semibold text-mar">
          {aviso} →
        </a>
      ))}
      {pagamentosRetidos && (
        <a href="/admin?status=pagamentos-a-decidir" className="mt-3 block bg-erro-claro px-5 py-3 font-semibold text-mar">
          {pagamentosRetidos} →
        </a>
      )}
      {erroAcao && (
        <p role="alert" className="mt-3 bg-erro-claro px-5 py-3 font-semibold text-mar">
          {erroAcao}
        </p>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Resumo">
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Pedidos pagos</p>
          <p className="text-2xl font-bold">{pagos.length}</p>
        </div>
        <div className="bg-white px-5 py-4">
          <p className="text-small text-tinta-suave">Vendido (pagos, menos reembolsos)</p>
          <p className="text-2xl font-bold">{formatarPreco(receita)}</p>
        </div>
      </section>

      {/* No celular (reteste de 16-17/11, R1): o filtro mais comprido ("Recusados / cancelados") quebra dentro dele só
          quando sozinho não cabe na linha (em 320 px com a letra em 150%), e a busca ocupa a linha dela, com a caixa
          encolhendo ao lado do botão. Do sm para cima, como sempre: a busca à direita, com 16rem */}
      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
          {FILTROS.map((f) => (
            <a
              key={f.valor}
              href={f.valor ? `/admin?status=${f.valor}` : '/admin'}
              aria-current={f.valor === filtro.valor ? 'page' : undefined}
              className={`filtro whitespace-normal ${f.valor === filtro.valor ? '!bg-mar !text-sol' : '!bg-white'}`}
            >
              {f.rotulo}
            </a>
          ))}
        </div>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          {filtro.valor && <input type="hidden" name="status" value={filtro.valor} />}
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={busca}
            maxLength={BUSCA_DO_PAINEL_MAXIMO}
            placeholder="Buscar pedido, voucher, nome, hotel…"
            className="campo min-h-11 min-w-0 flex-1 py-2 sm:w-64 sm:flex-none"
          />
          <button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white">
            Buscar
          </button>
        </div>
      </form>

      {erroBanco && <p className="mt-6 bg-erro-claro px-4 py-3 font-semibold">Erro ao ler o banco: {erroBanco}</p>}

      <p className="mt-6 text-small text-tinta-suave">
        {lista.length} pedido{lista.length === 1 ? '' : 's'}
      </p>
      <ul className="mt-3 space-y-3">
        {lista.map((p) => (
          <CartaoPedido key={p.codigo} p={p} filtro={filtro.valor} busca={busca} />
        ))}
      </ul>
    </main>
  );
}

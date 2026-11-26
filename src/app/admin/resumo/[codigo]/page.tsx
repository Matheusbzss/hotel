import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { vouchersDoPedido } from '@/app/api/pedido/pedido-stripe';
import { dicionario } from '@/i18n';
import { COOKIE_ADMIN, ESPERA_O_SEGREDO_DO_PAINEL, segredoDoPainelCriado, sessaoValida } from '@/lib/admin-auth';
import { emailLigado } from '@/lib/email/enviar';
import { agruparPedidos, buscaDoPainel, type PedidoPainel } from '@/lib/pedidos-painel';
import { ehCasa, ehTransfer, type Reserva } from '@/lib/reservas';
import {
  RESUMO_NAO_VALE,
  RESUMO_SEM_BANCO,
  RESUMO_SEM_PEDIDO,
  TITULO_DO_CANCELAMENTO,
  devolucaoPelaStripe,
  ehCancelamento,
  enderecoDoPainel,
  filtroDoPainel,
  lerEscolhaDoResumo,
  opcaoEscolhida,
  telaDoCancelamento,
  telaDoReembolso,
  type CampoDoResumo,
  type FormularioDoResumo,
  type TelaDoResumo,
  type TomDoAviso,
  type VoltaDoPainel,
} from '@/lib/resumo-do-painel';
import { lerSaldoDaStripe } from '@/lib/saldo-stripe';
import { ENDERECO_DA_SESSAO_VENCIDA } from '@/lib/sessao-do-painel';
import { transferVisivel } from '@/lib/transfer-view';
import { formatarDataIso } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

/**
 * A tela de resumo antes de devolver dinheiro (Pacote 33, item 1), aberta pelo "Reembolsar na Stripe…" do cartão do
 * pedido: o que volta e o valor, os vouchers que deixam de valer, a forma de pagamento, o prazo da Stripe, o e-mail que
 * o cliente recebe e o saldo da Stripe lido agora. Toda montada no servidor, sem JavaScript, como o resto do painel: as
 * opções são links e o segundo toque é um formulário simples (a caixa "Confirmo" e o botão), que manda para as MESMAS
 * ações de antes da rota do painel ('reembolsar' e 'reembolsar_item'). Quem decide o que a tela mostra é
 * src/lib/resumo-do-painel.ts (testado em node); o saldo vem de src/lib/saldo-stripe.ts, a única que lê a chave dele, e
 * aqui chegam só os valores. Celular primeiro: uma coluna, e do sm para cima o rótulo de cada linha ao lado do valor.
 *
 * A mesma tela, sem a Stripe e sem o saldo, serve ao "Cancelar sem reembolso…" (Pacote 33, passos 2 e 3): os vouchers que
 * deixam de valer, que nada é devolvido, o idioma da compra, o e-mail que o cliente recebe, o motivo, a caixa "Confirmo" e,
 * dentro dos 7 dias do arrependimento, o aviso vermelho e a caixa "Estou ciente" (telaDoCancelamento).
 */

const DICIONARIO_PT = dicionario('pt');

/** O voucher numa linha: o passeio (com a opção), o transfer ou a casa, e a data, como o cartão do pedido escreve. */
function descrever(r: Reserva): string {
  const data = formatarDataIso(r.data, 'pt-BR');
  if (ehTransfer(r)) return `Transfer privado — ${transferVisivel(r, 'pt', DICIONARIO_PT).veiculo} · ${data}`;
  // a casa: o nome e a entrada e a saída (o bloco completo do resumo fica para a parte 2 do pacote 1 das casas)
  if (ehCasa(r)) return `${r.casa.nome} · ${data} a ${formatarDataIso(r.saida, 'pt-BR')}`;
  return `${r.passeio.nome}${r.passeio.opcao ? ` — ${r.passeio.opcao.nome}` : ''} · ${data}`;
}

/** As cores dos avisos: as das frases vermelhas do painel, o amarelo dos avisos e o cinza das notas. */
const COR_DO_AVISO: Record<TomDoAviso, string> = {
  perigo: 'bg-erro-claro font-semibold text-[#7a1f12]',
  atencao: 'bg-sol text-mar',
  info: 'bg-superficie text-mar',
};

/**
 * Um campo além das caixas (o motivo do "sem reembolso"): uma escolha entre opções, obrigatória, ou um texto curto, com o
 * máximo de letras (a rota confere de novo, e só exige o texto com "Outro motivo"). Tocar no texto da opção também marca.
 */
function Campo({ campo }: { campo: CampoDoResumo }) {
  if (campo.tipo === 'escolha') {
    return (
      <fieldset className="space-y-2">
        <legend className="rotulo">{campo.rotulo}</legend>
        {campo.opcoes.map((o) => (
          <label key={o.valor} className="flex cursor-pointer items-start gap-3 text-small">
            <input type="radio" name={campo.nome} value={o.valor} required className="size-6 shrink-0 accent-[var(--color-mar)]" />
            <span>{o.rotulo}</span>
          </label>
        ))}
        {/* por que algum motivo não aparece (a data do serviço não deixa: motivosQueCombinam) */}
        {campo.ajuda && <p className="ajuda">{campo.ajuda}</p>}
      </fieldset>
    );
  }
  return (
    <div>
      <label htmlFor={`campo-${campo.nome}`} className="rotulo">
        {campo.rotulo}
      </label>
      <textarea id={`campo-${campo.nome}`} name={campo.nome} maxLength={campo.maximo} rows={3} autoComplete="off" className="campo" />
      {campo.ajuda && <p className="ajuda">{campo.ajuda}</p>}
    </div>
  );
}

/**
 * Um formulário da tela: o POST para a rota do painel, com a ação, o filtro e a busca do painel (a rota volta para ele
 * com os dois, voltaAoPainel), o voucher quando a ação é sobre um voucher só, e as caixas obrigatórias: o navegador não
 * envia sem elas marcadas, e a rota confere de novo. Tocar no texto também marca a caixa.
 */
function Formulario({ f, volta }: { f: FormularioDoResumo; volta: VoltaDoPainel }) {
  return (
    <form method="post" action={`/api/admin/reservas/${f.codigoNaRota}`} className="space-y-4">
      <input type="hidden" name="acao" value={f.acao} />
      <input type="hidden" name="filtro" value={volta.filtro ?? ''} />
      {volta.busca && <input type="hidden" name="q" value={volta.busca} />}
      {f.voucher && <input type="hidden" name="voucher" value={f.voucher} />}
      {f.campos.map((campo) => (
        <Campo key={campo.nome} campo={campo} />
      ))}
      {f.confirmacoes.map((c) => (
        <label key={c.nome} className="flex cursor-pointer items-start gap-3 text-small">
          <input type="checkbox" name={c.nome} value="sim" required className="size-6 shrink-0 accent-[var(--color-mar)]" />
          <span>{c.texto}</span>
        </label>
      ))}
      <button
        type="submit"
        className={`min-h-11 w-full px-4 py-2 font-semibold text-mar hover:bg-borda sm:w-auto ${f.perigo ? 'bg-erro-claro' : 'bg-superficie'}`}
      >
        {f.botao}
      </button>
      {f.nota && <p className="text-small text-tinta-suave">{f.nota}</p>}
    </form>
  );
}

/** A tela sem o que confirmar (o pedido não existe, a opção não vale mais, o banco não respondeu): só a frase e a volta. */
function SemResumo({ frase, painel, titulo = 'Reembolsar na Stripe' }: { frase: string; painel: string; titulo?: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 text-mar md:px-8">
      <a href={painel} className="text-small font-semibold underline underline-offset-4">
        ← Voltar ao painel
      </a>
      <h1 className="mt-4 text-2xl font-bold">{titulo}</h1>
      <p role="alert" className="mt-4 bg-erro-claro px-5 py-3 font-semibold text-mar">
        {frase}
      </p>
    </main>
  );
}

/** A tela de resumo: as opções do alto, as linhas, os avisos, o segundo toque e a devolução por transferência. */
function Tela({ tela, volta, painel }: { tela: TelaDoResumo; volta: VoltaDoPainel; painel: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 text-mar md:px-8">
      <a href={painel} className="text-small font-semibold underline underline-offset-4">
        ← Voltar ao painel
      </a>
      <h1 className="mt-4 text-2xl font-bold">{tela.titulo}</h1>
      <p className="mt-1 text-small text-tinta-suave [overflow-wrap:anywhere]">{tela.subtitulo}</p>

      {tela.opcoes.length > 0 && (
        <nav aria-label={tela.tituloDasOpcoes} className="mt-5">
          <p className="text-small font-semibold">{tela.tituloDasOpcoes}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tela.opcoes.map((o) => (
              <a
                key={o.href}
                href={o.href}
                aria-current={o.atual ? 'page' : undefined}
                className={`filtro whitespace-normal ${o.atual ? '!bg-mar !text-sol' : '!bg-white'}`}
              >
                {o.rotulo}
              </a>
            ))}
          </div>
        </nav>
      )}

      <section aria-label="Resumo" className="mt-5 bg-white px-5 py-2">
        <dl className="divide-y divide-borda">
          {tela.linhas.map((l) => (
            <div key={l.rotulo} className="py-3 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-small font-semibold text-tinta-suave">{l.rotulo}</dt>
              <dd className="mt-1 space-y-1 [overflow-wrap:anywhere] sm:mt-0">
                {l.valor.map((v, n) => (
                  <p key={n}>{v}</p>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {tela.avisos.map((a, n) => (
        <p key={n} role={a.tom === 'perigo' ? 'alert' : undefined} className={`mt-3 px-5 py-3 text-small ${COR_DO_AVISO[a.tom]}`}>
          {a.texto}
        </p>
      ))}

      <section aria-label="Confirmar" className="mt-5 bg-white p-5">
        {tela.formulario ? (
          <Formulario f={tela.formulario} volta={volta} />
        ) : (
          <p className="text-small font-semibold">{tela.semFormulario}</p>
        )}
      </section>

      {tela.transferencia && (
        <section aria-labelledby="transferencia" className="mt-5 bg-white p-5">
          <h2 id="transferencia" className="text-xl font-bold">
            {tela.transferencia.titulo}
          </h2>
          {tela.transferencia.texto.map((t, n) => (
            <p key={n} className="mt-2 text-small">
              {t}
            </p>
          ))}
          <div className="mt-4 space-y-6">
            {tela.transferencia.formularios.map((f) => (
              <Formulario key={`${f.acao}-${f.voucher ?? ''}`} f={f} volta={volta} />
            ))}
          </div>
        </section>
      )}

      <a href={painel} className="mt-6 inline-flex min-h-11 items-center bg-white px-5 font-semibold">
        Voltar ao painel sem fazer nada
      </a>
    </main>
  );
}

export default async function ResumoDoPainel({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) redirect(ENDERECO_DA_SESSAO_VENCIDA);

  const { codigo } = await params;
  const q = await searchParams;
  const volta: VoltaDoPainel = { filtro: filtroDoPainel(q.status), busca: buscaDoPainel(q.q) };
  const painel = enderecoDoPainel(volta);
  const escolha = lerEscolhaDoResumo(q);
  // o título da tela sem o que confirmar: o da família da escolha (o "sem reembolso" ou o "com reembolso")
  const titulo = escolha && ehCancelamento(escolha) ? TITULO_DO_CANCELAMENTO : undefined;

  let p: PedidoPainel | undefined;
  try {
    [p] = agruparPedidos(await vouchersDoPedido(codigo.trim().toUpperCase()));
  } catch (e) {
    console.error(`[admin] a tela de resumo não leu o pedido ${codigo.slice(0, 12)}: ${e instanceof Error ? e.name : 'erro'}`);
    return <SemResumo frase={RESUMO_SEM_BANCO} painel={painel} titulo={titulo} />;
  }
  if (!p) return <SemResumo frase={RESUMO_SEM_PEDIDO} painel={painel} titulo={titulo} />;
  // Pacote 33 (passos 2 e 3): o "Cancelar sem reembolso…", pela regra de src/lib/cancelar-sem-reembolso.ts (que a rota
  // confere de novo). Sem a Stripe: nem o saldo é lido
  if (escolha && ehCancelamento(escolha)) {
    // só com o segredo do painel criado na Vercel (decisão P14 do dono); a rota recusa do mesmo jeito
    if (!segredoDoPainelCriado()) return <SemResumo frase={ESPERA_O_SEGREDO_DO_PAINEL} painel={painel} titulo={TITULO_DO_CANCELAMENTO} />;
    const cancelamento = telaDoCancelamento(p, escolha, { agora: new Date(), saldo: null, emailLigado: emailLigado(), descrever, volta });
    if (!cancelamento) return <SemResumo frase={RESUMO_NAO_VALE} painel={painel} titulo={TITULO_DO_CANCELAMENTO} />;
    return <Tela tela={cancelamento} volta={volta} painel={painel} />;
  }
  // a opção escolhida, se ainda vale para o pedido como ele está agora; só então o saldo é lido (o limite curto dele), e
  // só quando a Stripe entra (depois de uma devolução por outro meio, não entra mais)
  if (!escolha || !opcaoEscolhida(p, escolha)) return <SemResumo frase={RESUMO_NAO_VALE} painel={painel} />;
  const tela = telaDoReembolso(p, escolha, {
    agora: new Date(),
    saldo: devolucaoPelaStripe(p) ? await lerSaldoDaStripe() : null,
    emailLigado: emailLigado(),
    descrever,
    volta,
  });
  if (!tela) return <SemResumo frase={RESUMO_NAO_VALE} painel={painel} />;
  return <Tela tela={tela} volta={volta} painel={painel} />;
}

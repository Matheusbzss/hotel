import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BotaoCopiar } from '@/components/admin/BotaoCopiar';
import { CORES_ETAPAS, COR_SERIE } from '@/components/admin/cores-graficos';
import { GraficoColunas, type Coluna } from '@/components/admin/GraficoColunas';
import { CIDADES } from '@/data/passeios';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { carrinhosDoFunil } from '@/lib/carrinho-servidor';
import { ARQUIVO_GOOGLE_COM_SENHA, USUARIO_DO_ARQUIVO_GOOGLE } from '@/lib/conversoes';
import { emailLigado, remetente, responderPara } from '@/lib/email/enviar';
import { fraseDosEmails } from '@/lib/email/lista-dos-emails';
import {
  PERIODOS,
  calcularEstatisticas,
  escolherPeriodo,
  marcasDoEixo,
  parteDoFaturamento,
  variacao,
  verPorSemana,
  type CarrinhoNoFunil,
  type Fatia,
  type Funil,
  type Lembretes,
  type Ponto,
} from '@/lib/estatisticas';
import { LEMBRETES_POR_DIA } from '@/lib/lembretes';
import { formatarPreco } from '@/lib/precos';
import { listarReservas, type Reserva } from '@/lib/reservas';
import { urlDoSite } from '@/lib/site';
import { formatarDataIso, hojeEmBuzios } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const dataCurta = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const dataLonga = (d: string) => `${dataCurta(d)}/${d.slice(0, 4)}`;
const contagem = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const decimal = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const parte = (de: number, total: number) => (total ? (de / total) * 100 : 0);
const porcento = (de: number, total: number) => `${decimal(parte(de, total))}%`;
/**
 * A parte do faturamento (menos reembolsos), de 0 a 100%: o número das sugestões vem na mesma base do faturamento e
 * a conta nunca passa de 100% (parteDoFaturamento, src/lib/estatisticas.ts).
 */
const doFaturamento = (centavos: number, faturamento: number) => `${decimal(parteDoFaturamento(centavos, faturamento))}% do faturamento`;

const SEM_VENDAS = 'Nenhuma venda neste período.';
/** O ranking mostra estas linhas; as outras ficam em "Ver mais". */
const LINHAS_VISIVEIS = 8;

/** Reais no eixo, em números redondos: por extenso até R$ 10 mil e abreviado a partir daí, igual em todo o eixo. */
function eixoEmReais(centavos: number, topoCentavos: number) {
  const reais = centavos / 100;
  if (!reais) return 'R$ 0';
  if (topoCentavos >= 100_000_000) return `R$ ${decimal(reais / 1_000_000)} mi`;
  if (topoCentavos >= 1_000_000) return `R$ ${decimal(reais / 1_000)} mil`;
  return `R$ ${reais.toLocaleString('pt-BR')}`;
}

/**
 * Quais colunas ganham texto embaixo: todas, se couberem; senão, umas quatro, com a primeira e a última. Aqui no servidor
 * não se sabe a largura da tela: abaixo do sm, o gráfico só mostra a primeira e a última (GraficoColunas).
 */
function colunasComTexto(total: number): Set<number> {
  const passo = total <= 6 ? 1 : Math.ceil((total - 1) / 3);
  const marcadas = new Set<number>();
  for (let i = 0; i < total; i += passo) marcadas.add(i);
  const anterior = Math.floor((total - 1) / passo) * passo;
  if (total - 1 - anterior < passo / 2) marcadas.delete(anterior);
  marcadas.add(total - 1);
  return marcadas;
}

function Comparacao({ atual, anterior }: { atual: number; anterior?: number }) {
  const v = variacao(atual, anterior);
  if (v === null) return null;
  if (v === 0) return <p className="mt-1 text-small text-tinta-suave">igual ao período anterior</p>;
  return (
    <p className={`mt-1 text-small font-semibold ${v > 0 ? 'text-sucesso' : 'text-erro'}`}>
      {v > 0 ? '▲' : '▼'} {Math.abs(v)}% vs. anterior
    </p>
  );
}

function Numero({
  rotulo,
  valor,
  nota,
  atual,
  anterior,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  atual: number;
  anterior?: number;
}) {
  // o mínimo da letra também segue a tela (min com 5.8vw): com a letra do celular em 125 ou 150%, o 1.125rem crescia e o
  // valor sem quebra passava do cartão de meia tela (e da tela, num valor alto) em 320 e 360 px (reteste de 16-17/11, R1);
  // com a letra normal (a partir de 320 px), em 390 px com 125% e no computador, nada muda.
  // A nota quebra dentro da palavra quando ela não cabe sozinha na linha: em 320 px com a letra em 150%, o cartão de meia
  // tela deixa 79 px ao texto, e "faturamento" (de "0% do faturamento") saía 19,8 px do cartão branco (reteste de 17/11).
  // O cartão não alarga com o texto (as colunas da grade são minmax(0, 1fr)): era só a palavra
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <p className="text-small text-tinta-suave">{rotulo}</p>
      <p className="mt-1 whitespace-nowrap text-[clamp(min(1.125rem,5.8vw),5.2vw,1.5rem)] font-bold">{valor}</p>
      {nota && <p className="text-small text-tinta-suave [overflow-wrap:anywhere]">{nota}</p>}
      <Comparacao atual={atual} anterior={anterior} />
    </div>
  );
}

function Cartao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 bg-white p-5">
      <h2 className="text-xl font-bold">{titulo}</h2>
      {nota && <p className="mt-1 text-small text-tinta-suave">{nota}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Uma linha: o nome, o número e a barra, todas saindo da mesma base. */
function Linha({ nome, valor, nota, largura, cor }: { nome: string; valor: string; nota: string; largura: number; cor: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">{nome}</span>
        <span className="shrink-0 font-semibold tabular-nums">{valor}</span>
      </div>
      <div className="mt-1 h-2" aria-hidden>
        {largura > 0 && <div className="h-full min-w-1 rounded-r-[4px]" style={{ width: `${largura}%`, background: cor }} />}
      </div>
      <p className="mt-0.5 text-small tabular-nums text-tinta-suave">{nota}</p>
    </li>
  );
}

function Ranking({ fatias, um, varios }: { fatias: Fatia[]; um: string; varios: string }) {
  if (!fatias.length) return <p className="text-tinta-suave">{SEM_VENDAS}</p>;
  const total = fatias.reduce((soma, f) => soma + f.centavos, 0);
  const linhas = (lista: Fatia[]) =>
    lista.map((f) => (
      <Linha
        key={f.chave}
        nome={f.rotulo}
        valor={formatarPreco(f.centavos)}
        nota={`${contagem(f.quantidade, um, varios)} · ${porcento(f.centavos, total)} do total`}
        largura={parte(f.centavos, fatias[0].centavos)}
        cor={COR_SERIE}
      />
    ));
  const resto = fatias.slice(LINHAS_VISIVEIS);
  return (
    <>
      <ul className="space-y-3">{linhas(fatias.slice(0, LINHAS_VISIVEIS))}</ul>
      {resto.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-small font-semibold">Ver mais {resto.length}</summary>
          <ul className="mt-3 space-y-3">{linhas(resto)}</ul>
        </details>
      )}
    </>
  );
}

function BlocoFunil({ f, anterior }: { f: Funil; anterior?: Funil }) {
  if (!f.carrinhos) return <p className="text-tinta-suave">Nenhum carrinho criado neste período.</p>;
  const etapas = [
    { nome: 'Carrinhos criados', n: f.carrinhos, nota: 'quem pôs ao menos um item no carrinho' },
    { nome: 'Chegaram ao checkout', n: f.checkout, nota: `${porcento(f.checkout, f.carrinhos)} dos carrinhos` },
    { nome: 'Fizeram o pedido', n: f.pedidos, nota: `${porcento(f.pedidos, f.checkout)} de quem chegou ao checkout` },
    { nome: 'Pagaram', n: f.pagos, nota: `${porcento(f.pagos, f.pedidos)} dos pedidos` },
  ];
  return (
    <>
      <p className="text-small text-tinta-suave">Carrinho que virou venda paga</p>
      <p className="text-2xl font-bold">{porcento(f.pagos, f.carrinhos)}</p>
      <Comparacao atual={parte(f.pagos, f.carrinhos)} anterior={anterior && parte(anterior.pagos, anterior.carrinhos)} />
      <ul className="mt-4 space-y-3">
        {etapas.map((e, i) => (
          <Linha key={e.nome} nome={e.nome} valor={String(e.n)} nota={e.nota} largura={parte(e.n, f.carrinhos)} cor={CORES_ETAPAS[i]} />
        ))}
      </ul>
    </>
  );
}

/** O que os lembretes do carrinho abandonado trouxeram de volta: carrinhos lembrados, quem voltou pelo link e quem comprou. */
function BlocoLembretes({ l, anterior }: { l: Lembretes; anterior?: Lembretes }) {
  if (!l.carrinhos) {
    return (
      <p className="text-tinta-suave">
        {emailLigado() ? 'Nenhum lembrete enviado neste período.' : 'Nenhum lembrete enviado: os e-mails estão desligados.'}
      </p>
    );
  }
  const etapas = [
    { nome: 'Carrinhos lembrados', n: l.carrinhos, nota: contagem(l.enviados, 'e-mail enviado no período', 'e-mails enviados no período') },
    { nome: 'Voltaram pelo link do e-mail', n: l.voltaram, nota: `${porcento(l.voltaram, l.carrinhos)} dos carrinhos lembrados` },
    { nome: 'Fizeram o pedido', n: l.pedidos, nota: `${porcento(l.pedidos, l.voltaram)} de quem voltou` },
    { nome: 'Pagaram', n: l.pagos, nota: `${porcento(l.pagos, l.pedidos)} dos pedidos` },
  ];
  return (
    <>
      <p className="text-small text-tinta-suave">Carrinhos que voltaram pelo e-mail e viraram pedido</p>
      <p className="text-2xl font-bold">{l.pedidos}</p>
      <Comparacao atual={l.pedidos} anterior={anterior?.pedidos} />
      <ul className="mt-4 space-y-3">
        {etapas.map((e, i) => (
          <Linha key={e.nome} nome={e.nome} valor={String(e.n)} nota={e.nota} largura={parte(e.n, l.carrinhos)} cor={CORES_ETAPAS[i]} />
        ))}
      </ul>
    </>
  );
}

/**
 * A linha "nome · ● Ligado/○ Desligado" das listas de Emails e Medicao. O status desce para baixo do nome só quando os
 * dois não cabem juntos (o nome guarda pelo menos 5rem e nunca menos que a palavra mais longa): com a letra em 150%, o
 * "○ Desligado" passava 9 px da tela em 320 px e ficava espremido na borda do cartão em 360 (reteste de 16-17/11, R1).
 * Cabendo, como sempre: o nome à esquerda, quebrando dentro da linha, e o status à direita.
 */
const LINHA_DE_STATUS = 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2';
const NOME_DA_LINHA = 'grow basis-20';

/** Os e-mails automáticos (Etapa 6): ligados só com a chave do Resend na Vercel. */
function Emails() {
  const ligado = emailLigado();
  const itens: [string, boolean][] = [
    ['Envio de e-mails (Resend)', ligado],
    ['Lembretes do carrinho (a cada 15 minutos)', ligado && Boolean(process.env.CRON_SECRET)],
  ];
  return (
    <>
      <ul className="divide-y divide-superficie">
        {itens.map(([nome, ok]) => (
          <li key={nome} className={LINHA_DE_STATUS}>
            <span className={NOME_DA_LINHA}>{nome}</span>
            <span className={`shrink-0 text-small font-semibold ${ok ? 'text-sucesso' : 'text-tinta-suave'}`}>
              {ok ? '● Ligado' : '○ Desligado'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-small text-tinta-suave">
        {ligado
          ? `Saem de ${remetente()}. As respostas dos clientes vão para ${responderPara()}.`
          : 'Falta a chave RESEND_API_KEY na Vercel. Sem ela, nenhum e-mail sai e o site segue normal.'}
      </p>
      {/* Pacote 33, D4: todos os e-mails automáticos, pela lista de src/lib/email/lista-dos-emails.ts (um tipo de e-mail
          novo não passa no tsc sem entrar nela) */}
      <p className="mt-1 text-small text-tinta-suave">Ao cliente, no idioma da compra: {fraseDosEmails('cliente', LEMBRETES_POR_DIA)}.</p>
      <p className="mt-1 text-small text-tinta-suave">
        À equipe, em português, no e-mail das respostas: {fraseDosEmails('equipe', LEMBRETES_POR_DIA)}.
      </p>
    </>
  );
}

/** O que já está ligado para a Meta e o Google aprenderem com as vendas. Cada item liga com uma variável na Vercel. */
function Medicao() {
  const segredo = process.env.GOOGLE_ARQUIVO_SEGREDO;
  const itens: [string, boolean][] = [
    ['Pixel da Meta', Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID)],
    ['API de Conversões da Meta', Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_TOKEN)],
    ['Tag do Google Ads', Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID)],
    ['Arquivo de vendas para o Google', Boolean(segredo)],
  ];
  return (
    <>
      <ul className="divide-y divide-superficie">
        {itens.map(([nome, ligado]) => (
          <li key={nome} className={LINHA_DE_STATUS}>
            <span className={NOME_DA_LINHA}>{nome}</span>
            <span className={`shrink-0 text-small font-semibold ${ligado ? 'text-sucesso' : 'text-tinta-suave'}`}>
              {ligado ? '● Ligado' : '○ Desligado'}
            </span>
          </li>
        ))}
      </ul>
      {segredo && (
        <div className="mt-3 space-y-2">
          {/* o Data Manager do Google Ads pede endereço, usuário e senha (src/app/api/anuncios/compras-google/[arquivo]) */}
          <p className="text-small text-tinta-suave">Para colar no Google Ads (Data Manager, origem HTTPS):</p>
          {(
            [
              ['Endereço do arquivo', `${urlDoSite()}/api/anuncios/compras-google/${ARQUIVO_GOOGLE_COM_SENHA}`],
              ['Usuário', USUARIO_DO_ARQUIVO_GOOGLE],
              ['Senha', segredo],
            ] as const
          ).map(([rotulo, valor]) => (
            <div key={rotulo}>
              <p className="text-small font-semibold">{rotulo}</p>
              <div className="mt-1 flex gap-2">
                <input readOnly aria-label={rotulo} value={valor} className="campo min-w-0 flex-1" />
                <BotaoCopiar texto={valor} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default async function Estatisticas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) redirect('/admin');

  const q = await searchParams;
  const pedido = { periodo: texto(q.periodo), de: texto(q.de), ate: texto(q.ate) };
  const hoje = hojeEmBuzios();

  let reservas: Reserva[] = [];
  let carrinhos: CarrinhoNoFunil[] = [];
  let erroBanco = '';
  try {
    const { chave, periodo, anterior } = escolherPeriodo(pedido, hoje);
    const desde = chave === 'tudo' ? undefined : `${(anterior ?? periodo).de}T00:00:00-03:00`;
    [reservas, carrinhos] = await Promise.all([listarReservas(), carrinhosDoFunil(desde)]);
  } catch (e) {
    erroBanco = String(e instanceof Error ? e.message : e);
  }

  const inicios = [...reservas.map((r) => r.pagamento.pagoEm ?? r.criadaEm), ...carrinhos.map((c) => c.criadoEm)].map((d) =>
    hojeEmBuzios(new Date(d)),
  );
  const escolhido = escolherPeriodo(
    pedido,
    hoje,
    inicios.reduce((a, b) => (a < b ? a : b), hoje),
  );
  const { chave, periodo, anterior } = escolhido;
  const e = calcularEstatisticas(reservas, carrinhos, escolhido);
  const { resumo: r, resumoAnterior: antes } = e;

  const ver = texto(q.ver);
  const porSemana = ver === 'semana' || (ver !== 'dia' && verPorSemana(periodo));
  const pontos = porSemana ? e.porSemana : e.porDia;

  /** O endereço da página com o período e a visão de agora, mudando só o que veio. */
  function endereco(mudanca: Record<string, string | undefined>) {
    const busca = new URLSearchParams();
    const tudo = {
      periodo: chave === 'outro' ? undefined : chave,
      de: chave === 'outro' ? periodo.de : undefined,
      ate: chave === 'outro' ? periodo.ate : undefined,
      ver,
      ...mudanca,
    };
    for (const [nome, valor] of Object.entries(tudo)) if (valor) busca.set(nome, valor);
    return `/admin/estatisticas?${busca}`;
  }

  const rotuloDoPonto = (p: Ponto) => (porSemana ? `Semana de ${dataCurta(p.de)} a ${dataCurta(p.ate)}` : formatarDataIso(p.de, 'pt-BR'));
  const comTexto = colunasComTexto(pontos.length);
  const textoPedidos = (n: number) => contagem(n, 'pedido', 'pedidos');
  const colunasDe = (medida: 'centavos' | 'pedidos'): Coluna[] =>
    pontos.map((p, i) => ({
      rotulo: rotuloDoPonto(p),
      valor: p[medida],
      texto: medida === 'centavos' ? formatarPreco(p.centavos) : textoPedidos(p.pedidos),
      detalhe: medida === 'centavos' ? textoPedidos(p.pedidos) : formatarPreco(p.centavos),
      ...(comTexto.has(i) ? { eixo: dataCurta(p.de) } : {}),
    }));
  const marcasReais = marcasDoEixo(Math.max(...pontos.map((p) => p.centavos)), 10_000);
  const topoReais = marcasReais[marcasReais.length - 1];
  const marcasPedidos = marcasDoEixo(Math.max(...pontos.map((p) => p.pedidos)));
  const quando = porSemana ? 'por semana' : 'por dia';
  const nomeDaCidade = (f: Fatia) => ({ ...f, rotulo: CIDADES[f.chave as keyof typeof CIDADES]?.nome.pt ?? f.rotulo });

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Estatísticas</h1>
          <p className="text-small text-tinta-suave">
            Só pedidos pagos, no dia do pagamento e pelo valor que entrou (no Pix, com o desconto), menos reembolsos
          </p>
        </div>
        <a href="/admin" className="min-h-10 bg-white px-4 py-2 font-semibold">
          Voltar aos pedidos
        </a>
      </header>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <a
            key={p.chave}
            href={endereco({ periodo: p.chave, de: undefined, ate: undefined })}
            aria-current={p.chave === chave ? 'page' : undefined}
            className={`filtro ${p.chave === chave ? '!bg-mar !text-sol' : '!bg-white'}`}
          >
            {p.rotulo}
          </a>
        ))}
      </div>
      <details className="mt-3" open={chave === 'outro'}>
        <summary className="cursor-pointer text-small font-semibold">Escolher as datas</summary>
        <form method="get" className="mt-2 flex flex-wrap items-end gap-2">
          {ver && <input type="hidden" name="ver" value={ver} />}
          <div>
            <label htmlFor="de" className="rotulo">
              De
            </label>
            <input id="de" name="de" type="date" required defaultValue={periodo.de} max={hoje} className="campo min-h-11 py-2" />
          </div>
          <div>
            <label htmlFor="ate" className="rotulo">
              Até
            </label>
            <input id="ate" name="ate" type="date" required defaultValue={periodo.ate} max={hoje} className="campo min-h-11 py-2" />
          </div>
          <button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white">
            Ver
          </button>
        </form>
      </details>
      <p className="mt-3 text-small text-tinta-suave">
        De {dataLonga(periodo.de)} a {dataLonga(periodo.ate)}
        {anterior ? `, comparado com ${dataLonga(anterior.de)} a ${dataLonga(anterior.ate)}` : ''}.
      </p>

      {erroBanco && <p className="mt-6 bg-erro-claro px-4 py-3 font-semibold">Erro ao ler o banco: {erroBanco}</p>}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Resumo">
        <div className="@container col-span-2 flex flex-col justify-center bg-white px-5 py-5 lg:col-span-1 lg:row-span-2">
          {/* o mesmo número de "Vendido (pagos, menos reembolsos)" da página de pedidos. O mínimo da letra também segue a
              tela (min com 12vw): com a letra do celular em 150%, o 2.25rem ia a 54 px e o valor sem quebra passava 22 a 62
              px da tela em 320 e 360 px (reteste de 16-17/11, R1); com a letra normal (a partir de 300 px) e em 390 px com
              125%, nada muda. Do lg para cima o cartão tem 1/3 da grade e a letra segue o cartão, não a tela: 12cqi (12% da
              largura de dentro do cartão, o @container dele), nunca mais que 3.25rem. Com 11vw ela ficava nos 3.25rem, e
              R$ 58.517,68 passava 23,8 px do cartão em 1024 px já com a letra normal (reteste de 17-18/11, T2b). Com 12cqi,
              cabe qualquer número de até 8,3 vezes a letra, em qualquer largura e letra (R$ 1.234.567,89 mede 7,5 vezes a
              letra no Segoe UI em negrito, a letra do painel no Windows: o layout do painel não carrega o Barlow).
              Abaixo do lg a letra também tem o teto do cartão: a regra de antes, nunca mais que 14cqi (14% de dentro do
              cartão, que ali tem a largura da tela menos a margem). Só com a tela, R$ 100.000,00 passava 13,3 px do cartão em
              320 px com a letra em 150%, e R$ 1.234.567,89 fazia a página rolar de lado (reteste de 22/11, medido com o número
              trocado na tela). Com 14cqi, até R$ 9.999.999,99 fica dentro do cartão em 320, 360 e 390 px com a letra em 100,
              125 e 150%, e de 336 px para cima com a letra normal nada muda (em 390 px, os 42,9 px de antes: 14% de dentro do
              cartão dá 44,5). A regra só da tela continua na frente, para o navegador que não conhece o cqi */}
          <p className="text-small text-tinta-suave">Faturamento (menos reembolsos)</p>
          <p className="mt-1 whitespace-nowrap text-[clamp(min(2.25rem,12vw),11vw,3.25rem)] font-bold leading-none max-lg:text-[min(clamp(min(2.25rem,12vw),11vw,3.25rem),14cqi)] lg:text-[min(12cqi,3.25rem)]">
            {formatarPreco(r.centavos)}
          </p>
          <Comparacao atual={r.centavos} anterior={antes?.centavos} />
        </div>
        <Numero rotulo="Pedidos pagos" valor={String(r.pedidos)} atual={r.pedidos} anterior={antes?.pedidos} />
        <Numero rotulo="Ticket médio" valor={formatarPreco(r.ticketCentavos)} atual={r.ticketCentavos} anterior={antes?.ticketCentavos} />
        <Numero
          rotulo="Itens por pedido"
          valor={decimal(r.itensPorPedido)}
          nota={contagem(r.itens, 'item vendido', 'itens vendidos')}
          atual={r.itensPorPedido}
          anterior={antes?.itensPorPedido}
        />
        <Numero
          rotulo="Vendido pelas sugestões"
          valor={formatarPreco(r.sugestoesCentavos)}
          nota={doFaturamento(r.sugestoesCentavos, r.centavos)}
          atual={r.sugestoesCentavos}
          anterior={antes?.sugestoesCentavos}
        />
      </section>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Ver os gráficos">
        <a
          href={endereco({ ver: 'dia' })}
          aria-current={!porSemana ? 'true' : undefined}
          className={`filtro ${!porSemana ? '!bg-mar !text-sol' : '!bg-white'}`}
        >
          Por dia
        </a>
        <a
          href={endereco({ ver: 'semana' })}
          aria-current={porSemana ? 'true' : undefined}
          className={`filtro ${porSemana ? '!bg-mar !text-sol' : '!bg-white'}`}
        >
          Por semana
        </a>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Cartao titulo={`Faturamento ${quando}`}>
          {r.pedidos ? (
            <GraficoColunas
              nome={`Faturamento ${quando}`}
              colunas={colunasDe('centavos')}
              marcas={marcasReais.map((valor) => ({ valor, texto: eixoEmReais(valor, topoReais) }))}
            />
          ) : (
            <p className="text-tinta-suave">{SEM_VENDAS}</p>
          )}
        </Cartao>
        <Cartao titulo={`Pedidos pagos ${quando}`}>
          {r.pedidos ? (
            <GraficoColunas
              nome={`Pedidos pagos ${quando}`}
              colunas={colunasDe('pedidos')}
              marcas={marcasPedidos.map((valor) => ({ valor, texto: String(valor) }))}
            />
          ) : (
            <p className="text-tinta-suave">{SEM_VENDAS}</p>
          )}
        </Cartao>
      </div>
      {r.pedidos > 0 && (
        <details className="mt-3 bg-white px-5 py-3">
          <summary className="cursor-pointer text-small font-semibold">Ver em tabela</summary>
          {/* no celular com a letra grande, a tabela passa da largura do cartão: ela rola de lado dentro da caixa dela, e a
              página não (reteste de 16-17/11, R1) */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-small tabular-nums">
              <caption className="sr-only">Pedidos pagos e faturamento {quando}, só com o que teve venda</caption>
              <thead>
                <tr className="border-b border-borda text-left">
                  <th className="py-1 font-semibold">{porSemana ? 'Semana' : 'Dia'}</th>
                  <th className="py-1 text-right font-semibold">Pedidos</th>
                  <th className="py-1 text-right font-semibold">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {pontos
                  .filter((p) => p.pedidos)
                  .toReversed()
                  .map((p) => (
                    <tr key={p.de} className="border-b border-superficie">
                      <td className="py-1">{porSemana ? `${dataCurta(p.de)} a ${dataCurta(p.ate)}` : dataLonga(p.de)}</td>
                      <td className="py-1 text-right">{p.pedidos}</td>
                      <td className="py-1 text-right">{formatarPreco(p.centavos)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Cartao
          titulo="Lembretes do carrinho"
          nota="Quem digitou o e-mail no checkout e não terminou recebe até 2 lembretes: 1 hora e 24 horas depois"
        >
          <BlocoLembretes l={e.lembretes} anterior={e.lembretesAnterior} />
        </Cartao>
        <Cartao titulo="E-mails automáticos" nota="O que sai sozinho para o cliente e para a equipe">
          <Emails />
        </Cartao>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Cartao titulo="Funil do carrinho" nota="Os carrinhos criados no período e até onde cada um chegou">
          <BlocoFunil f={e.funil} anterior={e.funilAnterior} />
        </Cartao>
        <Cartao titulo="Itens por pedido" nota={r.pedidos ? `Média de ${decimal(r.itensPorPedido)} por pedido` : undefined}>
          {r.pedidos ? (
            <ul className="space-y-3">
              {e.itensPorPedido.map((i, n) => (
                <Linha
                  key={i.rotulo}
                  nome={i.rotulo}
                  valor={String(i.pedidos)}
                  nota={`${porcento(i.pedidos, r.pedidos)} dos pedidos`}
                  largura={parte(i.pedidos, r.pedidos)}
                  cor={CORES_ETAPAS[n]}
                />
              ))}
            </ul>
          ) : (
            <p className="text-tinta-suave">{SEM_VENDAS}</p>
          )}
        </Cartao>
        <Cartao titulo="Vendas por passeio">
          <Ranking fatias={e.porPasseio} um="item" varios="itens" />
        </Cartao>
        <Cartao
          titulo="Vendido pelas sugestões"
          nota={
            e.sugestoes.itens
              ? `${contagem(e.sugestoes.itens, 'item', 'itens')} em ${textoPedidos(e.sugestoes.pedidos)}, ${doFaturamento(e.sugestoes.centavos, r.centavos)}`
              : undefined
          }
        >
          {e.sugestoes.itens ? (
            <Ranking fatias={e.sugestoes.porPasseio} um="item" varios="itens" />
          ) : (
            <p className="text-tinta-suave">Nenhum item das sugestões foi pago neste período.</p>
          )}
        </Cartao>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao titulo="Vendas por cidade" nota="O transfer fica à parte, porque liga uma cidade a outra">
          <Ranking fatias={e.porCidade.map(nomeDaCidade)} um="item" varios="itens" />
        </Cartao>
        <Cartao titulo="País do cliente" nota="Pelo código do país no WhatsApp">
          <Ranking fatias={e.porPais} um="pedido" varios="pedidos" />
        </Cartao>
        <Cartao titulo="Forma de pagamento">
          <Ranking fatias={e.porPagamento} um="pedido" varios="pedidos" />
        </Cartao>
        <Cartao titulo="Origem" nota="Pelos links dos anúncios; quem chega sem link marcado entra em Direto">
          <Ranking fatias={e.porOrigem} um="pedido" varios="pedidos" />
        </Cartao>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Cartao titulo="Campanhas" nota="Só as vendas que vieram de um anúncio com o nome da campanha no link">
          {e.porCampanha.length ? (
            <Ranking fatias={e.porCampanha} um="pedido" varios="pedidos" />
          ) : (
            <p className="text-tinta-suave">Nenhuma venda de campanha neste período.</p>
          )}
        </Cartao>
        <Cartao titulo="Medição dos anúncios" nota="O que já está ligado para a Meta e o Google aprenderem com as vendas">
          <Medicao />
        </Cartao>
      </div>
    </main>
  );
}

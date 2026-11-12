-- Pagamento online pela Stripe (Fase 4, Etapa 4): cartão e Pix pelo Checkout embutido no site.
-- O desenho está em docs/pagamentos-stripe.md.
--
-- DEPENDE da 20261108150000_idioma_es_ar.sql já aplicada (o idioma 'es-ar' nos pedidos): um pedido vindo
-- de /es-ar com cartão quebraria o check de idioma sem ela. Esta migração é aplicada só na publicação da
-- Etapa 4; nada aqui muda o que o cliente vê.
--
-- ORDEM DA PUBLICAÇÃO: a migração entra ANTES do código novo, e por alguns minutos o site roda o código
-- antigo em cima do banco novo. O código antigo não conhece as quatro colunas novas de pedidos; por isso
-- (a) o gatilho pedidos_completar_pagamento completa provedor e reembolso_centavos quando a linha chega sem
-- eles e (b) atualizar_reserva nunca apaga uma coluna nova com um valor vazio. O mesmo protege uma volta
-- atrás do código (rollback) com esta migração já aplicada.
--
-- Como nas migrações anteriores: só o servidor do site (service_role) lê e grava; RLS ligado sem políticas;
-- as funções rodam com search_path vazio e execução concedida só ao service_role. Os grants das tabelas novas
-- vêm dos "default privileges" da 20261103135632_permissoes_servidor.sql.

-- ============================================================
-- PEDIDOS: quem processou o pagamento e os ids da Stripe
-- ============================================================
-- 'pagarme' é o checkout antigo de um passeio (hoje desligado); 'whatsapp' é a reserva que a equipe cobra
-- fora do site e marca paga no painel; 'stripe' é o pagamento online desta etapa.
alter table public.pedidos add column provedor text check (provedor in ('pagarme','stripe','whatsapp'));

-- Os pedidos antigos: pelo WhatsApp → 'whatsapp'; os que chegaram a ter um pedido na Pagar.me (pedidoId
-- dentro do JSON pagamento) → 'pagarme'. Uma forma online sem pedido na Pagar.me tem duas origens: a equipe
-- marcou no painel uma reserva do WhatsApp como paga no Pix ou no cartão (a forma anotada muda, mas quem
-- cobrou foi a equipe, e o histórico guarda a marcação) → 'whatsapp'; ou o cliente escolheu a forma no
-- checkout antigo → 'pagarme'.
update public.pedidos p set provedor = case
  when p.metodo_pagamento = 'whatsapp' then 'whatsapp'
  when p.pagamento ? 'pedidoId' then 'pagarme'
  when exists (
    select 1 from public.pedidos_historico h
    where h.pedido_id = p.id and h.evento like 'Marcada como paga no %, no admin'
  ) then 'whatsapp'
  when p.metodo_pagamento in ('pix','cartao') then 'pagarme'
  else 'whatsapp'
end;
alter table public.pedidos alter column provedor set not null;
comment on column public.pedidos.provedor is 'Quem processou o pagamento: stripe (online), whatsapp (equipe cobra fora do site) ou pagarme (checkout antigo).';

-- A sessão de pagamento corrente na Stripe (cs_...). Um pedido pode ter várias sessões ao longo do tempo
-- ("pagar de novo", cartão recusado → Pix); aqui fica só a corrente, as anteriores ficam no histórico.
alter table public.pedidos add column pagamento_externo_id text;
create index pedidos_pagamento_externo_idx on public.pedidos (pagamento_externo_id);
comment on column public.pedidos.pagamento_externo_id is 'Id da Checkout Session corrente na Stripe (cs_...). As anteriores ficam no histórico.';

-- O pagamento em si na Stripe (pi_...): é por ele que se reembolsa e que o webhook de cartão recusado acha o pedido.
alter table public.pedidos add column payment_intent_id text;
create index pedidos_payment_intent_idx on public.pedidos (payment_intent_id);
comment on column public.pedidos.payment_intent_id is 'Id do PaymentIntent na Stripe (pi_...), preenchido quando o pagamento é confirmado ou recusado.';

-- Quanto já voltou para o cliente, em centavos (reembolso total ou de um item só). O status do pedido
-- continua um só; o item reembolsado é marcado em itens_pedido.status pela função atualizar_item.
alter table public.pedidos add column reembolso_centavos integer not null default 0 check (reembolso_centavos >= 0);
comment on column public.pedidos.reembolso_centavos is 'Total já devolvido ao cliente, em centavos (soma dos reembolsos, totais ou por item).';

-- O código antigo do site (o que está no ar até o deploy desta etapa, e o de uma volta atrás) não conhece as
-- colunas novas: manda a linha sem elas, e criar_pedido/criar_reserva gravam o vazio no lugar (o "default" da
-- coluna não vale para um vazio explícito). Sem este gatilho, o banco recusaria todo pedido novo nesse
-- intervalo. Antes de gravar, ele completa só o que veio vazio, com a regra do preenchimento acima sem a
-- linha do histórico: um pedido que nasce ainda não tem histórico, e marcar como pago no painel é uma
-- atualização, que mantém o provedor já gravado (atualizar_reserva).
-- O código novo sempre manda as duas colunas e passa por aqui sem mudança.
create or replace function public.pedidos_completar_pagamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provedor is null then
    new.provedor := case
      when new.metodo_pagamento = 'whatsapp' then 'whatsapp'
      when new.pagamento ? 'pedidoId' then 'pagarme'
      when new.metodo_pagamento in ('pix','cartao') then 'pagarme'
      else 'whatsapp'
    end;
  end if;
  if new.reembolso_centavos is null then
    new.reembolso_centavos := 0;
  end if;
  return new;
end;
$$;
revoke execute on function public.pedidos_completar_pagamento() from public, anon, authenticated;
grant execute on function public.pedidos_completar_pagamento() to service_role;

create trigger pedidos_completar_pagamento before insert on public.pedidos
  for each row execute function public.pedidos_completar_pagamento();

-- Status: entra 'contestado' (chargeback aberto na Stripe) e sai 'parcial', que nunca foi usado pelo site.
-- Se algum pedido tiver 'parcial', a migração para aqui para o dono decidir antes (nenhum deve ter).
do $$
begin
  if exists (select 1 from public.pedidos where status = 'parcial') then
    raise exception 'Há pedidos com status parcial: decidir o que são antes de aplicar esta migração.';
  end if;
end;
$$;
alter table public.pedidos drop constraint pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check
  check (status in ('pendente','aguardando_whatsapp','pago','recusado','cancelado','expirado','reembolsado','contestado'));

-- ============================================================
-- EVENTOS DO WEBHOOK (idempotência)
-- ============================================================
-- A Stripe reenvia eventos por até 3 dias e fora de ordem. O id do evento é gravado aqui ANTES de ser
-- processado, e processado_em é preenchido quando o trabalho termina. Um id repetido e já processado não
-- é processado de novo; um id recebido há mais de 2 minutos e ainda sem processado_em (a função foi
-- cortada no meio) é retomado pela próxima entrega. A verdade sobre o pagamento nunca é o corpo do
-- evento: é a sessão relida na Stripe.
create table public.pagamentos_eventos (
  id text primary key,
  tipo text not null,
  pedido_codigo text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  payload jsonb
);
create index pagamentos_eventos_pedido_idx on public.pagamentos_eventos (pedido_codigo);
alter table public.pagamentos_eventos enable row level security;
comment on table public.pagamentos_eventos is 'Eventos do webhook da Stripe já recebidos (id = event.id), para não processar o mesmo evento duas vezes.';
comment on column public.pagamentos_eventos.processado_em is 'Quando o processamento do evento terminou. Vazio = ainda em andamento ou cortado no meio: depois de 2 minutos, a próxima entrega retoma o evento.';
comment on column public.pagamentos_eventos.payload is 'Só o resumo que o servidor guardou (ids e status); nunca dados do cartão.';

-- ============================================================
-- LIMITE POR IP das rotas públicas
-- ============================================================
-- Numa função serverless um contador em memória não vale (cada chamada pode cair numa máquina diferente):
-- a contagem fica aqui. A chave é "rota:ip"; a janela começa no primeiro acesso e recomeça quando vence.
-- A limpeza das janelas vencidas é feita pelo agendamento diário de /api/saude.
create table public.limites_ip (
  chave text primary key,
  contagem integer not null default 0 check (contagem >= 0),
  janela_inicio timestamptz not null default now()
);
alter table public.limites_ip enable row level security;
comment on table public.limites_ip is 'Contagem de acessos por rota e IP: limite das rotas públicas (carrinho, pedido, pagar de novo), das tentativas de senha do painel e das consultas à Stripe.';

-- Conta mais um acesso na chave e devolve a contagem da janela corrente, numa operação só (sem corrida
-- entre duas chamadas ao mesmo tempo). Quando a janela venceu, recomeça do 1.
create or replace function public.contar_limite(p_chave text, p_janela_segundos integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_contagem integer;
begin
  insert into public.limites_ip as l (chave, contagem, janela_inicio)
    values (p_chave, 1, now())
  on conflict (chave) do update set
    contagem = case
      when l.janela_inicio + make_interval(secs => p_janela_segundos) <= now() then 1
      else l.contagem + 1
    end,
    janela_inicio = case
      when l.janela_inicio + make_interval(secs => p_janela_segundos) <= now() then now()
      else l.janela_inicio
    end
  returning l.contagem into v_contagem;
  return v_contagem;
end;
$$;

revoke execute on function public.contar_limite(text, integer) from public, anon, authenticated;
grant execute on function public.contar_limite(text, integer) to service_role;

-- ============================================================
-- STATUS POR ITEM (voucher)
-- ============================================================
-- Muda o status de UM item só (ativo, cancelado, reembolsado ou usado), sem mexer nos outros vouchers do
-- pedido: é o caso da chuva num passeio só de um carrinho de três, com reembolso parcial na Stripe.
-- Grava o evento no histórico do pedido, ligado ao item, e toca o atualizado_em do pedido para que quem
-- leu a reserva antes releia (atualizar_reserva confere a versão). Devolve false se o voucher não existir.
create or replace function public.atualizar_item(p_voucher text, p_status text, p_evento text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_pedido uuid;
  v_item uuid;
begin
  update public.itens_pedido set status = p_status
  where voucher_codigo = p_voucher
  returning pedido_id, id into v_pedido, v_item;
  if v_pedido is null then
    return false;
  end if;
  update public.pedidos set atualizado_em = now() where id = v_pedido;
  if p_evento is not null and p_evento <> '' then
    insert into public.pedidos_historico (pedido_id, item_pedido_id, em, evento)
      values (v_pedido, v_item, now(), p_evento);
  end if;
  return true;
end;
$$;

revoke execute on function public.atualizar_item(text, text, text) from public, anon, authenticated;
grant execute on function public.atualizar_item(text, text, text) to service_role;

-- ============================================================
-- atualizar_reserva: grava as colunas novas e respeita o status de cada item
-- ============================================================
-- Igual à versão de 20261106005427_pedidos_com_varios_itens.sql, com três diferenças:
-- 1. grava provedor, pagamento_externo_id, payment_intent_id e reembolso_centavos;
-- 2. um valor vazio nessas quatro colunas NÃO apaga o que já está gravado. O código novo nunca as esvazia;
--    quem manda vazio é o código antigo, que não as conhece (entre esta migração e o deploy, ou numa volta
--    atrás). Sem isso ele não conseguiria atualizar pedido nenhum (provedor é obrigatório) e, numa volta
--    atrás, apagaria os ids da Stripe e zeraria o valor já devolvido dos pedidos pagos pelo site;
-- 3. os outros vouchers do pedido só acompanham o status do item mudado quando o PEDIDO inteiro foi
--    cancelado ou reembolsado. Nos demais casos cada item guarda o seu próprio status (atualizar_item):
--    um voucher reembolsado sozinho não volta a 'ativo' quando o pedido é atualizado por outro motivo.
-- criar_pedido e criar_reserva não mudam: elas inserem a linha inteira (select v_pedido.*), e o gatilho
-- pedidos_completar_pagamento, mais acima, completa o que o código antigo não manda.
create or replace function public.atualizar_reserva(p_versao timestamptz, p_pedido jsonb, p_item jsonb, p_historico jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  p public.pedidos := jsonb_populate_record(null::public.pedidos, p_pedido);
  i public.itens_pedido := jsonb_populate_record(null::public.itens_pedido, p_item);
  v_id uuid;
begin
  update public.pedidos set
    status = p.status,
    idioma = p.idioma,
    cliente_nome = p.cliente_nome,
    cliente_email = p.cliente_email,
    cliente_telefone = p.cliente_telefone,
    cliente_documento_tipo = p.cliente_documento_tipo,
    cliente_documento = p.cliente_documento,
    cliente_pais = p.cliente_pais,
    metodo_pagamento = p.metodo_pagamento,
    pagamento = p.pagamento,
    subtotal_centavos = p.subtotal_centavos,
    desconto_centavos = p.desconto_centavos,
    total_centavos = p.total_centavos,
    total_pix_centavos = p.total_pix_centavos,
    moeda = p.moeda,
    origem_utm = p.origem_utm,
    observacoes = p.observacoes,
    pago_em = p.pago_em,
    provedor = coalesce(p.provedor, provedor),
    pagamento_externo_id = coalesce(p.pagamento_externo_id, pagamento_externo_id),
    payment_intent_id = coalesce(p.payment_intent_id, payment_intent_id),
    reembolso_centavos = coalesce(p.reembolso_centavos, reembolso_centavos)
  where codigo = p.codigo and (p_versao is null or atualizado_em = p_versao)
  returning id into v_id;
  if v_id is null then
    return false;
  end if;

  update public.itens_pedido set
    tipo = i.tipo,
    produto_slug = i.produto_slug,
    produto_nome = i.produto_nome,
    cidade = i.cidade,
    opcao = i.opcao,
    data = i.data,
    horario = i.horario,
    data_fim = i.data_fim,
    pessoas = i.pessoas,
    unidades = i.unidades,
    preco_centavos = i.preco_centavos,
    sinal_centavos = i.sinal_centavos,
    detalhes = i.detalhes,
    status = i.status
  where pedido_id = v_id and voucher_codigo = i.voucher_codigo;

  -- o pedido inteiro cancelado ou reembolsado leva todos os vouchers junto; fora disso, cada item é seu
  update public.itens_pedido set status = i.status
  where pedido_id = v_id and voucher_codigo <> i.voucher_codigo
    and p.status in ('cancelado', 'reembolsado');

  insert into public.pedidos_historico (pedido_id, em, evento)
    select v_id, (h ->> 'em')::timestamptz, h ->> 'evento'
    from jsonb_array_elements(coalesce(p_historico, '[]'::jsonb)) as h
    where not exists (
      select 1 from public.pedidos_historico x
      where x.pedido_id = v_id and x.em = (h ->> 'em')::timestamptz and x.evento = h ->> 'evento'
    );
  return true;
end;
$$;

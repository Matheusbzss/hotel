-- Reservas de hoje: o status e a forma de pagamento "Finalizar no WhatsApp", o total no Pix e o histórico.
-- Avaliações: a nota fica opcional (avaliação real que chega pelo WhatsApp ou pelo Instagram não tem nota).

-- Toda reserva sem pagamento online nasce "aguardando_whatsapp", com a forma de pagamento "whatsapp"
alter table public.pedidos drop constraint pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check
  check (status in ('pendente','aguardando_whatsapp','pago','recusado','cancelado','expirado','reembolsado','parcial'));

alter table public.pedidos drop constraint pedidos_metodo_pagamento_check;
alter table public.pedidos add constraint pedidos_metodo_pagamento_check
  check (metodo_pagamento in ('pix','cartao','whatsapp'));

-- Pelo WhatsApp a forma de pagamento ainda não foi escolhida: a equipe cobra este total no Pix
-- ou o total_centavos no cartão
alter table public.pedidos add column total_pix_centavos integer check (total_pix_centavos >= 0);

-- O histórico de cada pedido (criado, pago, cancelado no painel...), mostrado no painel do administrador
create table public.pedidos_historico (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  item_pedido_id uuid references public.itens_pedido (id) on delete cascade,
  em timestamptz not null default now(),
  evento text not null
);
create index pedidos_historico_pedido_idx on public.pedidos_historico (pedido_id, em);
create index pedidos_historico_item_idx on public.pedidos_historico (item_pedido_id);
alter table public.pedidos_historico enable row level security;

-- Nota só quando a origem tem nota (Google, TripAdvisor): nunca inventada
alter table public.avaliacoes alter column nota drop not null;
